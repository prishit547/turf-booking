# boxes/views.py
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from django.db import models
from django.utils import timezone
from django.core.files.storage import default_storage
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
import math

from .models import Box, Review
from .serializers import BoxSerializer, ReviewSerializer, OwnerBoxSerializer, AdminBoxSerializer
from .filters import BoxFilter
from user.permissions import IsAdminUser, IsAdminOrOwner


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
    queryset = Box.objects.filter(status='approved').order_by('id')
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
        return Box.objects.filter(status='approved').order_by('id').prefetch_related('reviews')

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
        serializer = ReviewSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(box=box, user=request.user)
            new_avg = box.reviews.aggregate(models.Avg('rating'))['rating__avg']
            box.rating = new_avg or 0.0
            box.save()
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
        return Response(AdminBoxSerializer(box, context={'request': request}).data)