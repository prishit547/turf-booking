# rewards/views.py
from django.db.models import Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from BookMyBox.pagination import StandardResultsPagination
from user.permissions import IsAdminUser
from .models import CashbackRule, RedeemCode, ScratchCard, ScratchCardConfig, SpinEntitlement, SpinWheelSegment, Wallet, WalletTransaction
from .serializers import (
    CashbackRuleSerializer, RedeemCodeSerializer, ScratchCardConfigSerializer,
    ScratchCardSerializer, SpinWheelSegmentSerializer, WalletTransactionSerializer,
)
from . import services
from .services import get_or_create_wallet


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
        serializer.save(created_by=self.request.user)


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
        value = request.data.get('value')
        quantity = int(request.data.get('quantity', 1))
        batch_label = request.data.get('batch_label', '')
        expires_at = request.data.get('expires_at')
        if not value or quantity < 1 or quantity > 1000:
            return Response({'detail': 'A value and a quantity (1-1000) are required.'}, status=status.HTTP_400_BAD_REQUEST)
        codes = [
            RedeemCode(value=value, batch_label=batch_label, expires_at=expires_at, created_by=request.user)
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
