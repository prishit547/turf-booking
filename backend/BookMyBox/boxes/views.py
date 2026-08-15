# boxes/views.py
from decimal import Decimal, InvalidOperation

from rest_framework import mixins, viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.core.files.storage import default_storage
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
import math

from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model

from bookings.models import Booking
from bookings.services import cancel_booking, CancellationError
from .models import Box, Review, BlockedDate, CommissionRate, PlatformCommissionSetting, PricingRule
from .serializers import (
    BoxSerializer, ReviewSerializer, ReviewOwnerResponseSerializer, OwnerBoxSerializer,
    AdminBoxSerializer, AdminReviewSerializer, BlockedDateSerializer, CommissionRateSerializer,
    PlatformCommissionSettingSerializer, PricingRuleSerializer,
)
from .filters import BoxFilter
from user.audit import log_admin_action
from user.notifications import notify
from user.permissions import IsAdminUser, IsAdminOrOwner, IsOwnerUser
from BookMyBox.pagination import StandardResultsPagination

REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024
REVIEW_IMAGE_ALLOWED_EXTENSIONS = ('jpg', 'jpeg', 'png', 'webp')


def _validate_review_image(uploaded_file):
    """Raises ValueError with a user-facing message if `uploaded_file`
    isn't an actual image we're willing to store and serve back publicly
    from /media/ — a bare extension check is easy to spoof (rename a
    script to .jpg), so this also asks Pillow (already a hard dependency
    via Box.image/ImageField) to genuinely decode it."""
    from PIL import Image, UnidentifiedImageError

    ext = uploaded_file.name.rsplit('.', 1)[-1].lower() if '.' in uploaded_file.name else ''
    if ext not in REVIEW_IMAGE_ALLOWED_EXTENSIONS:
        raise ValueError(f"'{uploaded_file.name}' isn't a supported image type (jpg, jpeg, png, webp only).")
    if uploaded_file.size > REVIEW_IMAGE_MAX_BYTES:
        raise ValueError(f"'{uploaded_file.name}' is larger than the 5MB limit.")
    try:
        Image.open(uploaded_file).verify()
    except (UnidentifiedImageError, OSError):
        raise ValueError(f"'{uploaded_file.name}' isn't a valid image file.")
    finally:
        # Image.verify() consumes the file's read pointer — reset it so the
        # same InMemoryUploadedFile/TemporaryUploadedFile can still be
        # handed to default_storage.save() afterward.
        uploaded_file.seek(0)


class MinLengthSearchFilter(drf_filters.SearchFilter):
    """Custom search filter that handles searches of any length"""
    
    def filter_queryset(self, request, queryset, view):
        search_terms = self.get_search_terms(request)
        if not search_terms:
            return queryset
        
        # Join all search terms and check length
        search_string = ' '.join(search_terms).strip()
        if not search_string:
            return queryset
            
        # Allow searches of any length - remove the 2 character restriction
        return super().filter_queryset(request, queryset, view)

# Haversine function remains the same
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Response cache TTL for the public box endpoints below. Short enough that
# a newly-approved or newly-edited box shows up quickly, long enough to
# absorb the bulk of repeat traffic — a stress test found box listing/detail
# to be the most-hit read endpoints and, even after fixing their N+1 query,
# still meaningfully CPU/DB cost on a resource-constrained deployment.
# Bounded staleness here is an accepted tradeoff already used elsewhere in
# this app (the frontend polls booked_slots every 30s for the same reason).
PUBLIC_BOX_CACHE_TTL = 15


@method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL), name='list')
@method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL), name='retrieve')
class PublicBoxViewSet(viewsets.ReadOnlyModelViewSet):
    """
    This viewset provides PUBLIC read-only access to approved boxes.
    It handles listing, retrieving, searching, and nearby functionality.

    list/retrieve/featured/popular are cached (see PUBLIC_BOX_CACHE_TTL) —
    all four return identical content regardless of who's asking (BoxSerializer
    has no per-user fields, and permission_classes here only gates writes, not
    reads), so caching by URL is safe. nearby is deliberately NOT cached: its
    cache key would be the exact lat/lng query string, and real GPS
    coordinates are high-cardinality enough that caching it would mostly
    just consume cache space without ever getting a hit.
    """
    queryset = Box.objects.filter(status='approved', owner__is_active=True).order_by('id')
    serializer_class = BoxSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, MinLengthSearchFilter, drf_filters.OrderingFilter]
    filterset_class = BoxFilter
    search_fields = ['name']  # Only search by name field
    ordering_fields = ['price', 'rating', 'name', 'id']
    ordering = ['id']  # Default ordering

    def get_queryset(self):
        """Ensure we always return only approved boxes with stable ordering.

        prefetch_related('reviews') matters here specifically because
        BoxSerializer nests the full review list on every box — without it,
        every action built on this queryset (list/retrieve/featured/popular/
        nearby) does one extra reviews query per box serialized, which a
        stress test measured as the dominant cost of listing 100 boxes
        (~925ms p50, vs ~220ms to retrieve a single box).
        """
        return Box.objects.filter(status='approved', owner__is_active=True).order_by('id').prefetch_related('reviews', 'blocked_dates', 'pricing_rules')

    # --- ADDED THE TWO MISSING ACTIONS BELOW ---

    @action(detail=False, methods=['get'])
    @method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL))
    def featured(self, request):
        """
        This new function creates the /api/boxes/featured/ URL.
        It returns a list of approved boxes that are marked as featured.
        """
        # NOTE: This code assumes your Box model has a field named 'is_featured'.
        # If your field is named differently, please change the filter below.
        # For example, if it's called 'is_premium', change to .filter(is_premium=True)
        featured_boxes = self.get_queryset().filter(is_featured=True)

        serializer = self.get_serializer(featured_boxes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    @method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL))
    def popular(self, request):
        """
        This new function creates the /api/boxes/popular/ URL.
        It returns a list of the most popular approved boxes.
        """
        # NOTE: This is an example of getting popular boxes by ordering by rating.
        # You can change this logic to define 'popular' however you like.
        popular_boxes = self.get_queryset().order_by('-rating')[:10] # Gets top 10 by rating
        
        serializer = self.get_serializer(popular_boxes, many=True)

        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    @method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL))
    def locations(self, request):
        """Distinct city/location strings across approved boxes, for the
        Home hero search's city dropdown."""
        locations = (
            Box.objects.filter(status='approved', owner__is_active=True)
            .exclude(location='')
            .order_by('location')
            .values_list('location', flat=True)
            .distinct()
        )
        return Response(list(locations))

    @action(detail=False, methods=['get'])
    @method_decorator(cache_page(PUBLIC_BOX_CACHE_TTL))
    def stats(self, request):
        """Real platform-wide counts for marketing pages (About.jsx) —
        replaces hardcoded "500+ facilities" style copy that never moved."""
        User = get_user_model()
        return Response({
            'facilities': Box.objects.filter(status='approved', owner__is_active=True).count(),
            'cities': Box.objects.filter(status='approved', owner__is_active=True).exclude(location='')
                .values('location').distinct().count(),
            'users': User.objects.filter(role='user').count(),
            'bookings_completed': Booking.objects.filter(booking_status='Completed').count(),
        })

    # --- YOUR EXISTING ACTIONS ARE UNCHANGED ---

    @action(detail=False, methods=['get'])
    def nearby(self, request):
        # ... (your existing nearby logic is unchanged)
        lat_str = request.query_params.get('lat')
        lng_str = request.query_params.get('lng')
        radius_str = request.query_params.get('radius', 20)
        if not lat_str or not lng_str:
            return Response({"error": "Latitude (lat) and Longitude (lng) are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_lat, user_lng, search_radius = map(float, [lat_str, lng_str, radius_str])
        except ValueError:
            return Response({"error": "lat, lng, and radius must be valid numbers."}, status=status.HTTP_400_BAD_REQUEST)
        
        all_approved_boxes = self.get_queryset()
        nearby_boxes_list = []
        for box in all_approved_boxes:
            if box.latitude is not None and box.longitude is not None:
                distance = haversine_distance(user_lat, user_lng, float(box.latitude), float(box.longitude))
                if distance <= search_radius:
                    box.distance_from_user = distance
                    nearby_boxes_list.append(box)
        
        nearby_boxes_list.sort(key=lambda b: b.distance_from_user)
        serializer = self.get_serializer(nearby_boxes_list, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def add_review(self, request, pk=None):
        box = self.get_object()
        if Review.objects.filter(box=box, user=request.user).exists():
            return Response(
                {'detail': 'You have already reviewed this facility.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        has_completed_booking = Booking.objects.filter(
            box=box, user=request.user, booking_status__in=['Confirmed', 'Completed'],
        ).exists()
        if not has_completed_booking:
            return Response(
                {'detail': 'You can only review a facility you have booked.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ReviewSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Same upload pattern as OwnerBoxViewSet.perform_create's extra
            # box images — capped at 4 since this is a customer review, not
            # a facility listing. Validated *before* the review row is
            # created (not after) so a rejected image can't leave behind a
            # review with no way to retry the upload (the already-reviewed
            # check above would then permanently block a second attempt).
            uploaded_images = request.FILES.getlist('images')[:4]
            for img in uploaded_images:
                try:
                    _validate_review_image(img)
                except ValueError as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

            review = serializer.save(box=box, user=request.user)

            if uploaded_images:
                review.images = [
                    default_storage.save(f"review_images/{img.name}", img)
                    for img in uploaded_images
                ]
                review.save(update_fields=['images'])

            new_avg = box.reviews.aggregate(models.Avg('rating'))['rating__avg']
            box.rating = new_avg or 0.0
            box.save()
            notify(
                box.owner,
                'New review received',
                f"{request.user.full_name or request.user.email} left a {serializer.data.get('rating')}-star "
                f"review on {box.name}.",
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OwnerBoxViewSet(viewsets.ModelViewSet):
    """
    This viewset allows authenticated facility owners to CREATE,
    LIST, UPDATE, and DELETE their own boxes. Admins can manage all boxes.
    """
    serializer_class = OwnerBoxSerializer
    permission_classes = [IsAdminOrOwner]

    def get_queryset(self):
        """Filter boxes to only those owned by the current user."""
        if self.request.user.role == 'admin':
            return Box.objects.all().order_by('-submitted_at')
        return Box.objects.filter(owner=self.request.user).order_by('-submitted_at')

    def perform_create(self, serializer):
        box = serializer.save(
            owner=self.request.user,
            status='pending',
            submitted_at=timezone.now()
        )

        uploaded_images = self.request.FILES.getlist('images')
        if uploaded_images:
            if not isinstance(box.images, list):
                box.images = []

            # Save the first image to the main ImageField; Django handles storage.
            box.image = uploaded_images[0]
            box.images.append(f"box_images/{uploaded_images[0].name}")

            # Persist any additional images to default storage.
            for img in uploaded_images[1:]:
                path = default_storage.save(
                    f"box_images/{img.name}",
                    img
                )
                box.images.append(path)

            box.save()

    def perform_update(self, serializer):
        """If the owner is editing a box the admin sent back for changes,
        treat the save itself as the resubmission — flip it back to
        'pending' so it re-enters the admin approval queue, instead of
        making the owner take a separate explicit "resubmit" action.
        Editing an approved/rejected box is untouched — this only applies
        to the changes_requested state."""
        box = self.get_object()
        was_changes_requested = box.status == 'changes_requested'
        if was_changes_requested:
            serializer.save(status='pending', rejection_reason='', submitted_at=timezone.now())
        else:
            serializer.save()

    @action(detail=True, methods=['patch'], url_path='reviews/(?P<review_id>[^/.]+)/respond')
    def respond_to_review(self, request, pk=None, review_id=None):
        """Owner reply to a review on their own box — box is already
        ownership-scoped via get_queryset()/get_object(), so a mismatched
        box id 404s naturally without a separate ownership check."""
        box = self.get_object()
        review = get_object_or_404(box.reviews, pk=review_id)
        serializer = ReviewOwnerResponseSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(owner_response_at=timezone.now())
        notify(
            review.user,
            'The owner replied to your review',
            f"{box.name}'s owner replied to your review.",
            link=f'/boxes/{box.id}',
        )
        return Response(ReviewSerializer(review).data)


class AdminBoxViewSet(viewsets.ViewSet):
    """
    Admin-only endpoints for managing box approvals.
    """
    permission_classes = [IsAdminUser]

    def list_pending(self, request):
        pending = Box.objects.filter(status='pending').order_by('-submitted_at')
        serializer = AdminBoxSerializer(pending, many=True, context={'request': request})
        return Response(serializer.data)

    def approve(self, request, pk=None):
        try:
            box = Box.objects.get(pk=pk)
        except Box.DoesNotExist:
            return Response({'detail': 'Box not found.'}, status=status.HTTP_404_NOT_FOUND)
        box.status = 'approved'
        box.rejection_reason = ''
        box.save(update_fields=['status', 'rejection_reason'])
        notify(box.owner, 'Your box was approved', f'{box.name} is now live and bookable.', link=f'/boxes/{box.id}')
        log_admin_action(request.user, 'box.approve', target=box, target_repr=box.name)
        return Response(AdminBoxSerializer(box, context={'request': request}).data)

    def reject(self, request, pk=None):
        try:
            box = Box.objects.get(pk=pk)
        except Box.DoesNotExist:
            return Response({'detail': 'Box not found.'}, status=status.HTTP_404_NOT_FOUND)
        reason = request.data.get('reason', '')
        box.status = 'rejected'
        box.rejection_reason = reason
        box.save(update_fields=['status', 'rejection_reason'])
        notify(
            box.owner, 'Your box was rejected',
            f'{box.name} was rejected: {reason}' if reason else f'{box.name} was rejected.',
        )
        log_admin_action(request.user, 'box.reject', target=box, target_repr=box.name, details={'reason': reason})
        return Response(AdminBoxSerializer(box, context={'request': request}).data)

    def request_changes(self, request, pk=None):
        """A middle ground between approve/reject — the box isn't rejected
        outright, but the owner needs to fix something before it can go
        live. Reuses rejection_reason (already means "why this isn't
        approved yet", which fits here too) to carry the admin's notes.
        See OwnerBoxViewSet.perform_update() for the other half: editing a
        changes_requested box auto-resubmits it to pending."""
        try:
            box = Box.objects.get(pk=pk)
        except Box.DoesNotExist:
            return Response({'detail': 'Box not found.'}, status=status.HTTP_404_NOT_FOUND)
        reason = request.data.get('reason', '')
        if not reason.strip():
            return Response({'detail': 'Please explain what needs to change.'}, status=status.HTTP_400_BAD_REQUEST)
        box.status = 'changes_requested'
        box.rejection_reason = reason
        box.save(update_fields=['status', 'rejection_reason'])
        notify(
            box.owner, 'Changes requested on your box',
            f'{box.name} needs changes before it can be approved: {reason}',
            link='/owner-dashboard',
        )
        log_admin_action(
            request.user, 'box.request_changes', target=box, target_repr=box.name, details={'reason': reason},
        )
        return Response(AdminBoxSerializer(box, context={'request': request}).data)


class AdminReviewViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Admin-only review moderation surface: list every review platform-wide
    and delete abusive/spam ones. No update action — admins moderate, they
    don't edit customer-authored content."""
    serializer_class = AdminReviewSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination
    filter_backends = [drf_filters.SearchFilter, drf_filters.OrderingFilter]
    search_fields = ['box__name', 'user__email', 'user__first_name', 'user__last_name', 'comment']
    ordering_fields = ['date', 'rating']
    ordering = ['-date']

    def get_queryset(self):
        return Review.objects.select_related('box', 'user').all()

    def destroy(self, request, pk=None):
        review = get_object_or_404(Review, pk=pk)
        box = review.box
        review_id = review.pk
        review_repr = f'{box.name} — {review.user.email} ({review.rating}★)'
        review.delete()
        new_avg = box.reviews.aggregate(models.Avg('rating'))['rating__avg']
        box.rating = new_avg or 0.0
        box.save(update_fields=['rating'])
        log_admin_action(
            request.user, 'review.delete',
            target_type='Review', target_id=review_id, target_repr=review_repr,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedDateViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Owner-managed whole-day blocks (holiday/maintenance) on their own
    boxes. Scoped to the owner's own boxes via get_queryset(), same
    ownership-via-queryset pattern as OwnerBookingViewSet — a mismatched
    box id 404s naturally rather than needing a separate check."""
    serializer_class = BlockedDateSerializer
    permission_classes = [IsOwnerUser]

    def get_queryset(self):
        queryset = BlockedDate.objects.filter(box__owner=self.request.user).select_related('box')
        box_id = self.request.query_params.get('box')
        if box_id:
            queryset = queryset.filter(box_id=box_id)
        return queryset

    def create(self, request, *args, **kwargs):
        box_id = request.data.get('box')
        date_value = request.data.get('date')
        if not Box.objects.filter(pk=box_id, owner=request.user).exists():
            return Response({'detail': 'Box not found.'}, status=status.HTTP_404_NOT_FOUND)
        if BlockedDate.objects.filter(box_id=box_id, date=date_value).exists():
            return Response({'detail': 'This date is already blocked.'}, status=status.HTTP_400_BAD_REQUEST)

        # A block is a whole-day closure — if paid, Confirmed bookings
        # already exist for this box+date, blocking silently would leave
        # customers unrefunded and showing up to a closed venue. Reject by
        # default and make the owner explicitly opt into the cascade via
        # force=true, rather than auto-cancelling behind their back.
        conflicting_bookings = list(
            Booking.objects.filter(box_id=box_id, date=date_value, booking_status='Confirmed')
            .select_related('user')
            .order_by('start_time')
        )
        force = str(request.data.get('force', '')).lower() in ('true', '1', 'yes')

        if conflicting_bookings and not force:
            count = len(conflicting_bookings)
            return Response({
                'detail': (
                    f"This date has {count} confirmed booking{'s' if count != 1 else ''}. "
                    "Cancelling them will refund the affected customers."
                ),
                'conflicting_bookings': [
                    {
                        'id': b.id,
                        # Matches OwnerDashboard.jsx's Bookings tab display rule: a
                        # walk-in/manual booking's `user` is the owner themselves
                        # (see OwnerBookingViewSet.book()), so the real customer's
                        # name lives in customer_name, not user.full_name.
                        'customer_name': (
                            (b.customer_name or 'Walk-in customer') if b.booking_source == 'owner_manual'
                            else (b.user.full_name or b.user.email)
                        ),
                        'start_time': b.start_time,
                    }
                    for b in conflicting_bookings
                ],
            }, status=status.HTTP_400_BAD_REQUEST)

        # All-or-nothing: either every conflicting booking gets cancelled
        # (with its refund/notification) and the block is created, or none
        # of it happens — an owner should never end up with some customers
        # refunded and others left holding a booking for a now-closed venue.
        try:
            with transaction.atomic():
                cancelled_count = 0
                for booking in conflicting_bookings:
                    # cancel_booking itself raises CancellationError if a
                    # booking can't be cancelled (e.g. within the 2-hour
                    # notice window) — letting that propagate out of this
                    # `with` block rolls back any bookings already
                    # cancelled earlier in the loop, so we never end up
                    # half-cancelled.
                    cancel_booking(
                        booking, cancelled_by=request.user,
                        reason='Venue closed by owner for this date.',
                    )
                    cancelled_count += 1
                response = super().create(request, *args, **kwargs)
        except CancellationError as e:
            return Response(
                {'detail': f"Could not block this date: {e.detail}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cancelled_count:
            response.data['cancelled_bookings_count'] = cancelled_count
            response.data['detail'] = (
                f"Date blocked. {cancelled_count} confirmed booking{'s' if cancelled_count != 1 else ''} "
                "cancelled and refunded."
            )
        return response


class PricingRuleViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Owner-managed peak/off-peak price overrides on their own boxes. Same
    ownership-via-queryset pattern as BlockedDateViewSet. create() locks the
    box row for the duration of the overlap check + insert, so two
    concurrent rule creates for the same box can't both pass validation
    against a rule the other is still in the middle of inserting."""
    serializer_class = PricingRuleSerializer
    permission_classes = [IsOwnerUser]

    def get_queryset(self):
        queryset = PricingRule.objects.filter(box__owner=self.request.user).select_related('box')
        box_id = self.request.query_params.get('box')
        if box_id:
            queryset = queryset.filter(box_id=box_id)
        return queryset

    def create(self, request, *args, **kwargs):
        box_id = request.data.get('box')
        with transaction.atomic():
            box = Box.objects.select_for_update().filter(pk=box_id, owner=request.user).first()
            if not box:
                return Response({'detail': 'Box not found.'}, status=status.HTTP_404_NOT_FOUND)
            return super().create(request, *args, **kwargs)

class AdminCommissionRateViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Admin-only commission-rate configuration. list/create only — a rate
    change is always a new (owner, sport, effective_from) row, never an
    edit-in-place, so commission on past bookings can never be silently
    rewritten (see CommissionRate's docstring)."""
    serializer_class = CommissionRateSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = CommissionRate.objects.select_related('owner').all()
        owner_id = self.request.query_params.get('owner')
        if owner_id:
            queryset = queryset.filter(owner_id=owner_id)
        return queryset

    def perform_create(self, serializer):
        rate = serializer.save(created_by=self.request.user)
        log_admin_action(
            self.request.user, 'commission_rate.create', target=rate,
            details={'owner': rate.owner.email, 'sport': rate.sport, 'rate': str(rate.rate), 'effective_from': str(rate.effective_from)},
        )


class AdminPlatformCommissionView(APIView):
    """Platform-wide default commission rate — the admin-editable
    replacement for the env-var-only DEFAULT_COMMISSION_RATE, read by
    boxes/pricing.py's resolve_commission_rate() as the ultimate fallback
    when no per-owner/sport CommissionRate override applies. Append-only/
    versioned (see PlatformCommissionSetting's docstring) — GET returns
    whatever's currently effective, PATCH always creates a new row dated
    today rather than mutating one in place, same reasoning as
    AdminCommissionRateViewSet never allowing an edit-in-place."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        row = PlatformCommissionSetting.objects.filter(
            effective_from__lte=timezone.localdate(),
        ).order_by('-effective_from', '-id').first()
        if row:
            return Response(PlatformCommissionSettingSerializer(row).data)
        return Response({
            'default_rate': float(settings.DEFAULT_COMMISSION_RATE) * 100,
            'effective_from': None,
            'updated_at': None,
            'updated_by': None,
        })

    def patch(self, request):
        new_rate = request.data.get('default_rate')
        if new_rate is None:
            return Response({'detail': 'default_rate is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_rate = Decimal(str(new_rate))
        except InvalidOperation:
            return Response({'detail': 'default_rate must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_rate < 0 or new_rate > 100:
            return Response({'detail': 'default_rate must be between 0 and 100.'}, status=status.HTTP_400_BAD_REQUEST)
        setting = PlatformCommissionSetting.objects.create(
            default_rate=new_rate, effective_from=timezone.localdate(), updated_by=request.user,
        )
        log_admin_action(
            request.user, 'platform_commission.update', target=setting,
            details={'default_rate': str(setting.default_rate), 'effective_from': str(setting.effective_from)},
        )
        return Response(PlatformCommissionSettingSerializer(setting).data)
