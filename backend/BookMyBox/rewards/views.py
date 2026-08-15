# rewards/views.py
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from BookMyBox.pagination import StandardResultsPagination
from boxes.models import Box
from user.audit import log_admin_action
from user.permissions import IsAdminUser, IsOwnerUser
from .models import (
    CashbackRule, OwnerScratchCardSetting, RedeemCode, ScratchCard, ScratchCardAutoGrantSetting,
    ScratchCardConfig, SpinEntitlement, SpinWheelSegment, Wallet, WalletTransaction,
)
from .serializers import (
    CashbackRuleSerializer, RedeemCodeSerializer, ScratchCardConfigSerializer,
    ScratchCardSerializer, SpinWheelSegmentSerializer, WalletTransactionSerializer,
)
from . import services
from .services import get_or_create_wallet

User = get_user_model()


def _parse_positive_value(raw):
    """Parses a redeem-code `value` into a positive Decimal, or returns None
    if it isn't one — shared by both the owner and admin `generate` actions
    below, which previously only checked `if not value` (true only for
    blank/zero/None, so a negative value sailed through and, once applied
    at checkout, *increased* the booking total instead of discounting it)."""
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, TypeError):
        return None
    return value if value > 0 else None


class WalletView(APIView):
    """A user's own wallet summary — balance plus lifetime earned/spent,
    the headline numbers at the top of the Rewards tab's tracking page."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = get_or_create_wallet(request.user)
        earned = wallet.transactions.filter(amount__gt=0).aggregate(total=Sum('amount'))['total'] or 0
        spent = wallet.transactions.filter(amount__lt=0).aggregate(total=Sum('amount'))['total'] or 0
        return Response({
            'balance': wallet.balance,
            'lifetime_earned': earned,
            'lifetime_spent': abs(spent),
        })


class WalletTransactionListView(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The full ledger, paginated, optionally filtered by ?type= — this is
    the actual answer to "where can I track my cashback/rewards," since
    every mechanic (cashback, scratch cards, spin wheel, redeem codes,
    wallet spend at checkout) writes into this same table."""
    serializer_class = WalletTransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        wallet = get_or_create_wallet(self.request.user)
        qs = wallet.transactions.all()
        type_filter = self.request.query_params.get('type')
        if type_filter:
            qs = qs.filter(type=type_filter)
        return qs


class AdminCashbackRuleViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Admin config for the standing cashback rate — list shows history
    (most recent first), create adds a new rule and deactivates any other
    active one (see CashbackRuleSerializer.create)."""
    serializer_class = CashbackRuleSerializer
    permission_classes = [IsAdminUser]
    queryset = CashbackRule.objects.all()

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        log_admin_action(
            self.request.user, 'cashback_rule.create', target=rule,
            details={'percent': str(rule.percent), 'active': rule.active},
        )


class ScratchCardViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """A user's own scratch cards. Reveal is a dedicated action, not a
    PATCH, since it's a one-way state transition with a side effect
    (crediting the wallet), not a generic field update."""
    serializer_class = ScratchCardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.request.user.scratch_cards.all()

    @action(detail=True, methods=['post'])
    def scratch(self, request, pk=None):
        card = self.get_object()
        try:
            services.scratch_card(request.user, card)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(card).data)


class AdminScratchCardConfigViewSet(viewsets.ModelViewSet):
    """Admin CRUD over scratch-card prize tiers."""
    serializer_class = ScratchCardConfigSerializer
    permission_classes = [IsAdminUser]
    queryset = ScratchCardConfig.objects.all()

    def perform_create(self, serializer):
        config = serializer.save()
        log_admin_action(
            self.request.user, 'scratch_card_config.create', target=config,
            details={'label': config.label, 'prize_amount': str(config.prize_amount), 'active': config.active},
        )

    def perform_update(self, serializer):
        config = serializer.save()
        log_admin_action(
            self.request.user, 'scratch_card_config.update', target=config,
            details={'label': config.label, 'prize_amount': str(config.prize_amount), 'active': config.active},
        )

    def perform_destroy(self, instance):
        config_id = instance.pk
        config_repr = str(instance)
        instance.delete()
        log_admin_action(
            self.request.user, 'scratch_card_config.delete',
            target_type='ScratchCardConfig', target_id=config_id, target_repr=config_repr,
        )


class SpinWheelView(APIView):
    """GET: how many spins the user has queued up. POST: consume the
    oldest one and spin — see services.spin_wheel for the weighted-random
    pick and wallet credit."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        available = SpinEntitlement.objects.filter(user=request.user, used=False).count()
        segments = SpinWheelSegmentSerializer(SpinWheelSegment.objects.filter(active=True), many=True).data
        return Response({'available': available, 'segments': segments})

    def post(self, request):
        try:
            attempt = services.spin_wheel(request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'segment_id': attempt.segment_id,
            'segment_label': attempt.segment.label if attempt.segment else None,
            'prize_amount': attempt.prize_amount,
        })


class AdminSpinWheelSegmentViewSet(viewsets.ModelViewSet):
    """Admin CRUD over spin-wheel segments."""
    serializer_class = SpinWheelSegmentSerializer
    permission_classes = [IsAdminUser]
    queryset = SpinWheelSegment.objects.all()

    def perform_create(self, serializer):
        segment = serializer.save()
        log_admin_action(
            self.request.user, 'spin_wheel_segment.create', target=segment,
            details={'label': segment.label, 'prize_amount': str(segment.prize_amount), 'active': segment.active},
        )

    def perform_update(self, serializer):
        segment = serializer.save()
        log_admin_action(
            self.request.user, 'spin_wheel_segment.update', target=segment,
            details={'label': segment.label, 'prize_amount': str(segment.prize_amount), 'active': segment.active},
        )

    def perform_destroy(self, instance):
        segment_id = instance.pk
        segment_repr = str(instance)
        instance.delete()
        log_admin_action(
            self.request.user, 'spin_wheel_segment.delete',
            target_type='SpinWheelSegment', target_id=segment_id, target_repr=segment_repr,
        )


class RedeemCodeView(APIView):
    """POST {code} — redeem a voucher code into the caller's wallet."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get('code')
        if not code:
            return Response({'detail': 'A code is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            redeemed = services.redeem_code(request.user, code)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'value': redeemed.value, 'code': redeemed.code})


class AdminRedeemCodeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Admin browsing of generated code batches, plus the bulk-generate
    action. Read-only ModelViewSet-wise (codes are never hand-edited),
    generation is its own action since it creates many rows at once."""
    serializer_class = RedeemCodeSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        qs = RedeemCode.objects.all()
        batch = self.request.query_params.get('batch_label')
        if batch:
            qs = qs.filter(batch_label=batch)
        used = self.request.query_params.get('is_used')
        if used is not None:
            qs = qs.filter(is_used=used.lower() == 'true')
        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        value = _parse_positive_value(request.data.get('value'))
        try:
            quantity = int(request.data.get('quantity', 1))
        except (TypeError, ValueError):
            quantity = 0
        batch_label = request.data.get('batch_label', '')
        expires_at = request.data.get('expires_at')
        if value is None or quantity < 1 or quantity > 1000:
            return Response({'detail': 'A positive value and a quantity (1-1000) are required.'}, status=status.HTTP_400_BAD_REQUEST)
        codes = [
            RedeemCode(value=value, batch_label=batch_label, expires_at=expires_at, created_by=request.user)
            for _ in range(quantity)
        ]
        created = RedeemCode.objects.bulk_create(codes)
        log_admin_action(
            request.user, 'redeem_code.generate',
            details={'quantity': quantity, 'value': str(value), 'batch_label': batch_label},
        )
        return Response(RedeemCodeSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


class AdminScratchCardAutoGrantView(APIView):
    """Platform-wide master switch — see ScratchCardAutoGrantSetting's
    docstring. Off means no scratch cards are granted anywhere, regardless
    of any individual owner's own setting."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({'enabled': ScratchCardAutoGrantSetting.is_enabled()})

    def patch(self, request):
        setting, _ = ScratchCardAutoGrantSetting.objects.get_or_create(pk=1)
        setting.enabled = bool(request.data.get('enabled', setting.enabled))
        setting.updated_by = request.user
        setting.save()
        log_admin_action(
            request.user, 'scratch_card_auto_grant.toggle',
            details={'enabled': setting.enabled},
        )
        return Response({'enabled': setting.enabled})


class OwnerScratchCardAutoGrantView(APIView):
    """Per-owner opt-out — see OwnerScratchCardSetting's docstring."""
    permission_classes = [IsOwnerUser]

    def get(self, request):
        return Response({'enabled': OwnerScratchCardSetting.is_enabled_for(request.user)})

    def patch(self, request):
        setting, _ = OwnerScratchCardSetting.objects.get_or_create(owner=request.user)
        setting.enabled = bool(request.data.get('enabled', setting.enabled))
        setting.save()
        return Response({'enabled': setting.enabled})


class AdminGrantScratchCardView(APIView):
    """Manual "give this user a scratch card right now" — same random
    prize-tier draw as the automatic grant on booking completion (see
    services.grant_scratch_card), just triggered on demand."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        user = get_object_or_404(User, pk=request.data.get('user_id'))
        card = services.grant_scratch_card(user)
        if card is None:
            return Response({'detail': 'No active scratch card prize tiers configured.'}, status=400)
        log_admin_action(
            request.user, 'scratch_card.grant', target=card,
            details={'user': user.email},
        )
        return Response(ScratchCardSerializer(card).data, status=201)


class OwnerGrantScratchCardView(APIView):
    """Owner-triggered equivalent of AdminGrantScratchCardView — any
    facility owner can gift a scratch card to any user, not just their own
    customers, same as the admin one. That "any user" scope is deliberate
    (see above), but nothing previously stopped an owner from calling this
    in a loop to mint unlimited real wallet credit — the ScopedRateThrottle
    below is the actual guardrail against that, same pattern as the auth
    endpoints in user/views.py (see REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    in settings.py for the rate)."""
    permission_classes = [IsOwnerUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'owner_scratch_grant'

    def post(self, request):
        user = get_object_or_404(User, pk=request.data.get('user_id'))
        card = services.grant_scratch_card(user)
        if card is None:
            return Response({'detail': 'No active scratch card prize tiers configured.'}, status=400)
        return Response(ScratchCardSerializer(card).data, status=201)


class OwnerRedeemCodeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Owner-issued, box-scoped redeem codes — checkout-time discounts for
    that specific box only, NOT general wallet cash (see RedeemCode.box's
    docstring and bookings/services.py::apply_redeem_code)."""
    serializer_class = RedeemCodeSerializer
    permission_classes = [IsOwnerUser]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        qs = RedeemCode.objects.filter(box__owner=self.request.user)
        box_id = self.request.query_params.get('box_id')
        if box_id:
            qs = qs.filter(box_id=box_id)
        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        box_id = request.data.get('box')
        value = _parse_positive_value(request.data.get('value'))
        try:
            quantity = int(request.data.get('quantity', 1))
        except (TypeError, ValueError):
            quantity = 0
        batch_label = request.data.get('batch_label', '')
        expires_at = request.data.get('expires_at')
        box = Box.objects.filter(pk=box_id, owner=request.user).first()
        if not box:
            return Response({'detail': 'That box is not yours.'}, status=status.HTTP_403_FORBIDDEN)
        if value is None or quantity < 1 or quantity > 1000:
            return Response({'detail': 'A positive value and a quantity (1-1000) are required.'}, status=status.HTTP_400_BAD_REQUEST)
        codes = [
            RedeemCode(box=box, value=value, batch_label=batch_label, expires_at=expires_at, created_by=request.user)
            for _ in range(quantity)
        ]
        created = RedeemCode.objects.bulk_create(codes)
        return Response(RedeemCodeSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


class AdminRewardsOverviewView(APIView):
    """The admin's "how much have we given away and what do we still owe"
    page — a real platform liability (outstanding wallet balances) plus
    totals issued to date by mechanic, distinct from the per-mechanic
    config sections (Cashback/Scratch Cards/Spin Wheel/Redeem Codes)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        outstanding_liability = Wallet.objects.aggregate(total=Sum('balance'))['total'] or 0
        by_type = {
            row['type']: row['total']
            for row in WalletTransaction.objects.filter(amount__gt=0).values('type').annotate(total=Sum('amount'))
        }
        redeem_issued = RedeemCode.objects.aggregate(total=Sum('value'))['total'] or 0
        redeem_redeemed = RedeemCode.objects.filter(is_used=True).aggregate(total=Sum('value'))['total'] or 0
        top_wallets = list(
            Wallet.objects.select_related('user').order_by('-balance')[:10]
            .values('user__email', 'balance')
        )
        return Response({
            'outstanding_liability': outstanding_liability,
            'cashback_paid': by_type.get('cashback', 0),
            'scratch_card_paid': by_type.get('scratch_card', 0),
            'spin_wheel_paid': by_type.get('spin_wheel', 0),
            'redeem_code_value_issued': redeem_issued,
            'redeem_code_value_redeemed': redeem_redeemed,
            'top_wallets': top_wallets,
        })
