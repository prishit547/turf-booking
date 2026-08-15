# user/views.py

import logging

from django.conf import settings
from django.db.models import Sum, Count, DecimalField, Q
from django.db.models.functions import TruncMonth, Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, generics, permissions, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import authenticate
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters

from boxes.models import Box, CommissionRate, Review
from boxes.pricing import resolve_commission_rate
from bookings.models import Booking
from owner_dashboard.models import Payout

from .models import AdminActionLog, OwnerPayoutDetails, OwnerVerification, PasswordResetToken, User
from .audit import log_admin_action
from .filters import UserFilter
from .permissions import IsAdminUser, IsOwnerUser
from .notifications import notify
from .serializers import (
    UserRegistrationSerializer,
    # UserLoginSerializer,  # <--- CONFIRMED: This line should be commented out or removed
    UserSerializer,
    UserUpdateSerializer,
    AdminUserUpdateSerializer,
    AdminCreateUserSerializer,
    AdminActionLogSerializer,
    OwnerVerificationSerializer,
    OwnerPayoutDetailsSerializer,
    PasswordChangeSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    UserSearchResultSerializer,
    CustomTokenObtainPairSerializer, # <--- CORRECTED: This now matches the name in serializers.py
)
from .google_auth import GoogleAuthSerializer
from BookMyBox.pagination import StandardResultsPagination
from BookMyBox.tasks import send_email_task

PASSWORD_RESET_TOKEN_TTL_MINUTES = 45

logger = logging.getLogger(__name__)

# --- Simple JWT Custom Login View ---
# This is the PRIMARY view for user login and token generation.
# It uses CustomTokenObtainPairSerializer to handle email-based authentication
# and return user data along with tokens.
class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Takes a set of user credentials (email and password) and returns the
    access and refresh JWTs, along with serialized user data (including role).
    """
    serializer_class = CustomTokenObtainPairSerializer # Use your custom serializer
    # Scoped (not Anon/UserRateThrottle) so this limits login attempts
    # specifically, without throttling the rest of the API by IP/user — see
    # REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] in settings.py for the rate.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


# --- Google OAuth Login/Signup Endpoint ---
@api_view(['POST'])
@permission_classes([AllowAny])
def google_auth(request):
    """
    Handles Google OAuth authentication.
    Creates new user or logs in existing user.
    """
    serializer = GoogleAuthSerializer(data=request.data)
    if serializer.is_valid():
        result = serializer.to_representation(serializer.validated_data)
        
        if result.get('is_new_user'):
            return Response({
                'success': True,
                'message': 'Account created successfully with Google',
                'user': result['user'],
                'tokens': result['tokens'],
                'is_new_user': True,
                'needs_onboarding': result['needs_onboarding']
            }, status=status.HTTP_201_CREATED)
        else:
            return Response({
                'success': True,
                'message': 'Logged in successfully with Google',
                'user': result['user'],
                'tokens': result['tokens'],
                'is_new_user': False,
                'needs_onboarding': result['needs_onboarding']
            }, status=status.HTTP_200_OK)
    
    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


# --- Onboarding Completion Endpoint ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def complete_onboarding(request):
    """
    Completes user onboarding by collecting missing required fields.
    Role elevation to owner is NOT permitted through onboarding;
    owner access must be granted by an admin via a separate process.
    """
    user = request.user
    data = request.data

    errors = {}

    if 'phone' in data:
        phone = data['phone']
        if phone:
            digits_only = ''.join(filter(str.isdigit, phone))
            if len(digits_only) != 10:
                errors['phone'] = 'Phone number must be 10 digits'
            else:
                user.phone = phone

    if 'location' in data and data['location']:
        user.location = data['location']
    else:
        errors['location'] = 'Location is required'

    # Reject any attempt to self-elevate role through onboarding.
    if 'role' in data:
        if data['role'] != user.role:
            errors['role'] = 'Role changes require admin approval'
        elif data['role'] not in ['user', 'owner']:
            errors['role'] = 'Invalid role'

    # Only existing owners can set/update a business name here.
    if user.role == 'owner':
        if 'business_name' in data and data['business_name']:
            user.business_name = data['business_name']
        else:
            errors['business_name'] = 'Business name is required for owners'

    if errors:
        return Response({
            'success': False,
            'errors': errors
        }, status=status.HTTP_400_BAD_REQUEST)

    user.save()

    return Response({
        'success': True,
        'message': 'Onboarding completed successfully',
        'user': UserSerializer(user).data
    }, status=status.HTTP_200_OK)


# --- User Registration Endpoint ---
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def register(request):
    """
    Handles new user registration.
    """
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()

        # Generate tokens for the newly registered user
        refresh = RefreshToken.for_user(user)

        return Response({
            'success': True,
            'message': 'User registered successfully',
            'user': UserSerializer(user).data, # Full user data, including role
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


# `@api_view` wraps `register` into a dynamically generated APIView subclass
# and returns `WrappedAPIView.as_view()`; DRF's `APIView.as_view()` stashes
# that class on the returned function as `.cls` (see rest_framework/views.py),
# which is how a `throttle_scope` gets attached to a function-based view —
# `@throttle_classes` only sets which throttle *classes* run, ScopedRateThrottle
# itself reads the scope off the view instance at request time.
register.cls.throttle_scope = 'signup'


# --- User Logout Endpoint ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Blacklists the provided refresh token, effectively logging the user out.
    """
    try:
        refresh_token = request.data.get('refresh_token')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist() # Blacklist the refresh token to invalidate it

        return Response({
            'success': True,
            'message': 'Successfully logged out'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        # Catch exceptions (e.g., malformed token) and return an error
        return Response({
            'success': False,
            'error': f'Invalid token or logout failed: {str(e)}'
        }, status=status.HTTP_400_BAD_REQUEST)


# --- Get Current User Profile ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile(request):
    """
    Retrieves the authenticated user's profile data.
    """
    serializer = UserSerializer(request.user)
    return Response({
        'success': True,
        'user': serializer.data
    })


# --- Update Current User Profile ---
@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """
    Updates the authenticated user's profile information.
    """
    serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response({
            'success': True,
            'message': 'Profile updated successfully',
            'user': UserSerializer(request.user).data # Return updated user data
        })

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


# --- Change User Password ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """
    Allows an authenticated user to change their password.
    """
    serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response({
            'success': True,
            'message': 'Password changed successfully'
        })

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


# --- Self-service password reset ---
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def request_password_reset(request):
    """Starts the reset flow. Always returns success (even for an unknown
    email) so this endpoint can't be used to enumerate registered accounts —
    the actual email only goes out if a matching user exists."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email']

    user = User.objects.filter(email__iexact=email).first()
    if user:
        # Invalidate any prior unused token for this user before issuing a
        # new one — only the most recent reset link should ever work.
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        reset_token = PasswordResetToken.objects.create(
            user=user,
            expires_at=timezone.now() + timezone.timedelta(minutes=PASSWORD_RESET_TOKEN_TTL_MINUTES),
        )
        reset_link = f"{settings.FRONTEND_URL}/reset-password/{reset_token.token}"
        send_email_task.delay(
            user.email,
            'Reset your BoxNplay password',
            f"<p>Hi {user.first_name or user.email},</p>"
            f"<p>Click the link below to set a new password. This link expires in "
            f"{PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once.</p>"
            f'<p><a href="{reset_link}">{reset_link}</a></p>'
            f"<p>If you didn't request this, you can safely ignore this email.</p>",
        )

    return Response({
        'success': True,
        'message': "If that email is registered, we've sent a password reset link.",
    })


# See register.cls.throttle_scope's comment above for why `.cls` is how a
# function-based view's throttle_scope gets set. Both reset-flow endpoints
# share the 'password_reset' scope so requesting a link and then burning
# through guesses against it count against the same limit.
request_password_reset.cls.throttle_scope = 'password_reset'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def confirm_password_reset(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({'success': True, 'message': 'Password reset successfully.'})
    return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


confirm_password_reset.cls.throttle_scope = 'password_reset'


# --- User search (for inviting someone to a booking) ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_search(request):
    """Lightweight search-as-you-type for BookingInvite's "invite an
    existing user" flow — distinct from UserListView, which is admin-only
    and returns full profile fields. Any authenticated user can call this,
    but only ever gets back {id, name, email} for a handful of matches."""
    query = request.query_params.get('q', '').strip()
    if len(query) < 2:
        return Response([])
    matches = User.objects.filter(
        Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query)
    ).exclude(id=request.user.id)[:10]
    return Response(UserSearchResultSerializer(matches, many=True).data)


# --- Get Demo Credentials (Optional) ---
@api_view(['GET'])
@permission_classes([AllowAny])
def demo_credentials(request):
    """
    Provides demo user credentials for testing purposes (if configured in settings).
    """
    return Response({
        'success': True,
        'demo_credentials': getattr(settings, 'DEMO_CREDENTIALS', {})
    })


# --- User Dashboard Data Endpoint ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_dashboard_data(request):
    """
    Retrieves dashboard-specific data based on the authenticated user's role.
    Placeholders for actual data are included.
    """
    user = request.user

    dashboard_data = {
        'user': UserSerializer(user).data, # User data including role
        'stats': {},
        'recent_activity': [],
        'permissions': []
    }

    # Role-based dashboard data logic (add your actual data retrieval here)
    if user.role == 'admin':
        dashboard_data['stats'] = {
            'total_users': User.objects.count(),
            'total_owners': User.objects.filter(role='owner').count(),
            'total_facilities': 0, # Example placeholder
            'total_bookings': 0,  # Example placeholder
        }
        dashboard_data['permissions'] = ['manage_users', 'manage_facilities', 'view_analytics']

    elif user.role == 'owner':
        dashboard_data['stats'] = {
            'my_facilities': 0,  # Example placeholder
            'total_bookings': 0,  # Example placeholder
            'revenue': 0,         # Example placeholder
            'active_bookings': 0, # Example placeholder
        }
        dashboard_data['permissions'] = ['manage_own_facilities', 'view_bookings']

    else:  # 'user' role or any other default
        dashboard_data['stats'] = {
            'my_bookings': 0,     # Example placeholder
            'upcoming_bookings': 0, # Example placeholder
            'favorite_facilities': 0, # Example placeholder
            'total_spent': 0,       # Example placeholder
        }
        dashboard_data['permissions'] = ['book_facilities', 'view_own_bookings']

    return Response({
        'success': True,
        'dashboard': dashboard_data
    })


# --- Class-Based Views for User Listing and Detail ---
class UserListView(generics.ListAPIView):
    """
    Lists all users (for admins) or only the authenticated user (for non-admins).
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_class = UserFilter
    search_fields = ['email', 'first_name', 'last_name']

    def get_queryset(self):
        # Admins can see all users, others can only see their own profile in a list context
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return User.objects.all().order_by('-date_joined')
        return User.objects.filter(id=self.request.user.id) # Non-admins retrieve only themselves


class UserDetailView(generics.RetrieveAPIView):
    """
    Retrieves a specific user by ID. Read-only for everyone (self or admin)
    — mutating role/is_active goes through AdminUserUpdateView instead, and
    there is deliberately no user-delete endpoint (see AdminUserUpdateView's
    docstring for why).
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'pk' # Assumes primary key is used for lookup

    def get_queryset(self):
        # Admins can view any user profile.
        # Non-admins can only view their own profile.
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return User.objects.all()
        return User.objects.filter(id=self.request.user.id)


class AdminUserUpdateView(generics.UpdateAPIView):
    """Admin-only: edit a user's role/status plus core profile fields (see
    AdminUserUpdateSerializer). Hard-deleting a user is handled separately
    by AdminUserDeleteView/AdminUserDeletePreviewView below, behind an
    explicit confirmation flow on the frontend given real FK-cascade risk."""
    queryset = User.objects.all()
    serializer_class = AdminUserUpdateSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ['patch']

    # Fields AdminUserUpdateSerializer can actually change — tracked before/
    # after so the audit log records exactly what an admin edit changed,
    # not just "user was updated".
    _TRACKED_FIELDS = [
        'role', 'is_active', 'email', 'first_name', 'last_name',
        'phone', 'business_name', 'location',
    ]

    def patch(self, request, *args, **kwargs):
        target = self.get_object()
        if target.id == request.user.id:
            return Response(
                {'detail': "You cannot change your own role or status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        before = {field: getattr(target, field) for field in self._TRACKED_FIELDS}
        response = self.partial_update(request, *args, **kwargs)
        target.refresh_from_db()
        after = {field: getattr(target, field) for field in self._TRACKED_FIELDS}
        changed = {
            field: {'before': before[field], 'after': after[field]}
            for field in self._TRACKED_FIELDS if before[field] != after[field]
        }
        logger.info(
            "Admin %s updated user %s: role=%s is_active=%s",
            request.user.email, target.email,
            request.data.get('role', target.role), request.data.get('is_active', target.is_active),
        )
        log_admin_action(
            request.user, 'user.update', target=target,
            target_repr=target.email, details={'changed': changed},
        )
        return response


class AdminCreateUserView(generics.CreateAPIView):
    """Admin-only user creation. If no password is supplied, the account is
    created with an unusable password and the new user is emailed a
    password-setup link, reusing the exact PasswordResetToken +
    send_email_task pattern request_password_reset (above) already uses —
    this avoids an admin ever seeing/relaying a plaintext password. An
    admin may still optionally set an explicit password (e.g. for seeding
    demo accounts)."""
    queryset = User.objects.all()
    serializer_class = AdminCreateUserSerializer
    permission_classes = [IsAdminUser]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = dict(serializer.validated_data)
        password = data.pop('password', None) or None
        data['username'] = data['email']
        user = User.objects.create_user(password=password, **data)

        if not password:
            reset_token = PasswordResetToken.objects.create(
                user=user,
                expires_at=timezone.now() + timezone.timedelta(minutes=PASSWORD_RESET_TOKEN_TTL_MINUTES),
            )
            reset_link = f"{settings.FRONTEND_URL}/reset-password/{reset_token.token}"
            send_email_task.delay(
                user.email,
                'Set up your BoxNplay password',
                f"<p>Hi {user.first_name or user.email},</p>"
                f"<p>An administrator created an account for you on BoxNplay. Click the link "
                f"below to set your password. This link expires in {PASSWORD_RESET_TOKEN_TTL_MINUTES} "
                f"minutes and can only be used once.</p>"
                f'<p><a href="{reset_link}">{reset_link}</a></p>',
            )

        logger.info(
            "Admin %s created user %s (role=%s, password_set=%s)",
            request.user.email, user.email, user.role, bool(password),
        )
        log_admin_action(
            request.user, 'user.create', target=user, target_repr=user.email,
            details={'role': user.role, 'password_set': bool(password)},
        )
        return Response({
            'success': True,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


def _admin_delete_preview_counts(target):
    """Shared by the preview (GET) and the actual delete (DELETE, for its
    log line) so the two can never drift out of sync."""
    counts = {
        'bookings_as_customer': Booking.objects.filter(user=target).count(),
        'reviews': Review.objects.filter(user=target).count(),
    }
    if target.role == 'owner':
        counts['boxes_owned'] = Box.objects.filter(owner=target).count()
        counts['payout_records'] = Payout.objects.filter(owner=target).count()
        counts['payout_total_amount'] = float(
            Payout.objects.filter(owner=target).aggregate(t=Sum('amount'))['t'] or 0
        )
        counts['commission_rate_overrides'] = CommissionRate.objects.filter(owner=target).count()
    return counts


class AdminUserDeletePreviewView(APIView):
    """Admin-only, read-only: counts of what a hard delete of this user
    would touch, so the frontend confirmation modal can spell out the real
    consequences (see boxes/models.py::Box.owner's SET_NULL — an owner's
    boxes survive but go ownerless, they are NOT included as a 'thing that
    gets deleted' here)."""
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if target.id == request.user.id:
            return Response(
                {'detail': "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_admin_delete_preview_counts(target))


class AdminUserDeleteView(APIView):
    """Admin-only real hard delete. Respects existing FK on_delete behavior
    as-is (Booking/Review/Payout/CommissionRate CASCADE off User; Box.owner
    SET_NULL) rather than changing it — see the plan doc for why. Self-delete
    is blocked, same as AdminUserUpdateView's self-edit block."""
    permission_classes = [IsAdminUser]

    def delete(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if target.id == request.user.id:
            return Response(
                {'detail': "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        counts = _admin_delete_preview_counts(target)
        email, role, deleted_id = target.email, target.role, target.id
        target.delete()
        logger.info(
            "Admin %s permanently deleted user %s (role=%s): %s",
            request.user.email, email, role, counts,
        )
        # target.delete() clears target.pk, so target_type/target_id are
        # passed explicitly rather than derived from the (now pk-less)
        # instance — see log_admin_action's docstring.
        log_admin_action(
            request.user, 'user.delete',
            target_type='User', target_id=deleted_id, target_repr=email,
            details={'role': role, **counts},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_dashboard_data(request):
    """
    Returns aggregated stats and lists for the admin dashboard.

    Rebuilt to use grouped ORM aggregation (TruncMonth/annotate, following
    the same pattern as user_dashboard/views.py's DashboardAnalyticsView)
    instead of iterating full tables in Python, and to annotate users/boxes
    in a single query each instead of issuing a per-row .count()/.aggregate()
    call (the previous version's N+1). `boxes_overview` was dropped — it was
    an unfiltered duplicate of `boxes` truncated to 50 that the frontend
    never actually reached (its fallback-only reference to it is dead code
    since `boxes` is always present).
    """
    if request.user.role != 'admin':
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    ACTIVE_STATUSES = ['Confirmed', 'Completed']

    total_users = User.objects.count()
    total_owners = User.objects.filter(role='owner').count()
    total_bookings = Booking.objects.filter(booking_status__in=ACTIVE_STATUSES).count()
    platform_revenue = Booking.objects.filter(
        booking_status__in=ACTIVE_STATUSES
    ).aggregate(
        total=Sum('total_amount', default=0.0, output_field=DecimalField())
    )['total']

    # Real per-booking resolved commission (owner+sport can override the
    # platform default — see boxes/pricing.py::resolve_commission_rate),
    # not a flat guess — this is what the Overview tab's revenue summary
    # displays instead of a hardcoded percentage.
    total_commission = sum(
        (b.total_amount or 0) * resolve_commission_rate(b.box.owner if b.box else None, b.box.sport if b.box else '', b.date)
        for b in Booking.objects.filter(booking_status__in=ACTIVE_STATUSES).select_related('box', 'box__owner')
    )

    total_bookings_all = Booking.objects.count()
    cancelled_bookings = Booking.objects.filter(booking_status='Cancelled').count()
    cancellation_rate_pct = round((cancelled_bookings / total_bookings_all) * 100, 1) if total_bookings_all else 0.0

    approved_boxes_count = Box.objects.filter(status='approved').count()
    rejected_boxes_count = Box.objects.filter(status='rejected').count()
    pending_boxes = Box.objects.filter(status='pending').order_by('-submitted_at')
    pending_boxes_count = pending_boxes.count()

    recent_users = User.objects.order_by('-date_joined')[:10]
    recent_bookings = Booking.objects.select_related('user', 'box', 'box__owner').order_by('-created_at')[:10]

    # Monthly chart data for the last 6 calendar months — one grouped query
    # per metric instead of a Python loop over the full table.
    today = timezone.now().date()
    months = []
    labels = []
    for i in range(5, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_key = today.replace(year=year, month=month, day=1)
        months.append(month_key)
        labels.append(month_key.strftime('%b'))

    revenue_by_month = {
        row['month']: float(row['revenue'])
        for row in Booking.objects.filter(booking_status__in=ACTIVE_STATUSES, created_at__date__gte=months[0])
        .annotate(month=TruncMonth('created_at')).values('month')
        .annotate(revenue=Coalesce(Sum('total_amount'), 0.0, output_field=DecimalField()))
    }
    users_by_month = {
        row['month']: row['count']
        for row in User.objects.filter(date_joined__date__gte=months[0])
        .annotate(month=TruncMonth('date_joined')).values('month')
        .annotate(count=Count('id'))
    }
    bookings_by_month = {
        row['month']: row['count']
        for row in Booking.objects.filter(created_at__date__gte=months[0])
        .annotate(month=TruncMonth('created_at')).values('month')
        .annotate(count=Count('id'))
    }

    revenue_chart_data = [revenue_by_month.get(m, 0) for m in months]
    user_growth_data = [users_by_month.get(m, 0) for m in months]
    booking_trend_data = [bookings_by_month.get(m, 0) for m in months]

    def _mom_growth_pct(series):
        if len(series) < 2:
            return 0.0
        prev, curr = series[-2], series[-1]
        if prev:
            return round((curr - prev) / prev * 100, 1)
        return 100.0 if curr else 0.0

    mom_revenue_growth_pct = _mom_growth_pct(revenue_chart_data)
    mom_bookings_growth_pct = _mom_growth_pct(booking_trend_data)

    # Sports distribution across approved boxes
    sports_distribution = {
        (row['sport'] or 'Other'): row['count']
        for row in Box.objects.filter(status='approved').values('sport').annotate(count=Count('id'))
    }

    # Top cities by confirmed/completed bookings
    city_rows = list(
        Booking.objects.filter(booking_status__in=ACTIVE_STATUSES)
        .values('box__location').annotate(count=Count('id')).order_by('-count')[:5]
    )
    total_city_bookings = sum(row['count'] for row in city_rows) or 1
    top_cities = [
        {
            'city': row['box__location'] or 'Unknown',
            'bookings': row['count'],
            'percentage': round((row['count'] / total_city_bookings) * 100),
        }
        for row in city_rows
    ]

    # Peak booking hours — grouped by distinct start_time (bounded by the
    # number of distinct times, not the number of bookings), then bucketed
    # to the hour in Python since start_time is a raw "HH:MM" string, not a
    # TimeField the DB can group by hour directly.
    hours_tally = {}
    for row in Booking.objects.filter(booking_status__in=ACTIVE_STATUSES).values('start_time').annotate(count=Count('id')):
        hour = (row['start_time'] or '')[:2]
        if hour:
            hours_tally[hour] = hours_tally.get(hour, 0) + row['count']
    total_hour_bookings = sum(hours_tally.values()) or 1
    peak_hours_sorted = sorted(hours_tally.items(), key=lambda kv: kv[0])
    peak_booking_hours = {
        'labels': [f"{h}:00" for h, _ in peak_hours_sorted],
        'data': [round((c / total_hour_bookings) * 100, 1) for _, c in peak_hours_sorted],
    }

    # Owner performance ranking — top 10 owners by revenue across all their boxes
    owner_performance_ranking = [
        {'owner': (o.full_name or o.email), 'revenue': float(o.revenue), 'bookings': o.booking_count}
        for o in User.objects.filter(role='owner').annotate(
            revenue=Coalesce(
                Sum('owned_boxes__bookings__total_amount', filter=Q(owned_boxes__bookings__booking_status__in=ACTIVE_STATUSES)),
                0.0, output_field=DecimalField(),
            ),
            booking_count=Coalesce(
                Count('owned_boxes__bookings', filter=Q(owned_boxes__bookings__booking_status__in=ACTIVE_STATUSES)), 0,
            ),
        ).order_by('-revenue')[:10]
        if o.revenue or o.booking_count
    ]

    # Boxes list (Boxes/Analytics tabs) + top-boxes-by-revenue ranking share
    # this one annotated query instead of a per-box aggregate call each.
    boxes_qs = list(Box.objects.select_related('owner').annotate(
        booking_count=Coalesce(Count('bookings', filter=Q(bookings__booking_status__in=ACTIVE_STATUSES)), 0),
        revenue=Coalesce(
            Sum('bookings__total_amount', filter=Q(bookings__booking_status__in=ACTIVE_STATUSES)),
            0.0, output_field=DecimalField(),
        ),
    ).order_by('-submitted_at'))
    top_boxes_by_revenue = [
        {'name': b.name, 'revenue': float(b.revenue), 'bookings': b.booking_count}
        for b in sorted(boxes_qs, key=lambda b: b.revenue, reverse=True)[:10]
    ]

    # Recent activity stream (latest 10 events)
    recent_activity = []
    event_id = 1
    for booking in recent_bookings:
        recent_activity.append({
            'id': event_id,
            'type': 'booking',
            'text': f"New booking: {booking.box.name if booking.box else 'Unknown box'}",
            'time': booking.created_at,
        })
        event_id += 1
    for box in pending_boxes[:5]:
        recent_activity.append({
            'id': event_id,
            'type': 'approval',
            'text': f"Box pending approval: {box.name}",
            'time': box.submitted_at,
        })
        event_id += 1
    for user in recent_users[:5]:
        recent_activity.append({
            'id': event_id,
            'type': 'user',
            'text': f"New user registered: {user.full_name or user.email}",
            'time': user.date_joined,
        })
        event_id += 1
    recent_activity.sort(key=lambda x: x['time'], reverse=True)
    recent_activity = recent_activity[:10]

    return Response({
        'stats': {
            'total_users': total_users,
            'total_owners': total_owners,
            'total_bookings': total_bookings,
            'platform_revenue': platform_revenue,
            'total_commission': round(float(total_commission), 2),
            'pending_boxes_count': pending_boxes_count,
            'approved_boxes_count': approved_boxes_count,
            'rejected_boxes_count': rejected_boxes_count,
            'cancellation_rate_pct': cancellation_rate_pct,
            'mom_revenue_growth_pct': mom_revenue_growth_pct,
            'mom_bookings_growth_pct': mom_bookings_growth_pct,
        },
        'pending_boxes': [
            {
                'id': box.id,
                'name': box.name,
                'sport': box.sport,
                'location': box.location,
                'owner': box.owner.email if box.owner else None,
                'submitted_at': box.submitted_at,
                'status': box.status,
                'rejection_reason': box.rejection_reason,
            }
            for box in pending_boxes
        ],
        'users': [
            {
                'id': user.id,
                'name': user.full_name or user.email,
                'email': user.email,
                'role': user.role.capitalize(),
                'status': 'Active' if user.is_active else 'Inactive',
                'bookings': user.booking_count,
                'joinDate': user.date_joined.date().isoformat(),
            }
            for user in User.objects.annotate(
                booking_count=Coalesce(Count('bookings', filter=Q(bookings__booking_status__in=ACTIVE_STATUSES)), 0)
            ).order_by('-date_joined')
        ],
        'bookings': [
            {
                'id': b.id,
                'user': b.user.full_name or b.user.email,
                'box': b.box.name if b.box else None,
                'owner': b.box.owner.email if b.box and b.box.owner else None,
                'date': b.date.isoformat() if b.date else None,
                'amount': str(b.total_amount),
                'commission': str(round(
                    float(b.total_amount or 0) * float(resolve_commission_rate(
                        b.box.owner if b.box else None, b.box.sport if b.box else '', b.date,
                    )), 2,
                )),
                'status': b.booking_status,
            }
            for b in Booking.objects.select_related('user', 'box', 'box__owner').order_by('-created_at')
        ],
        'boxes': [
            {
                'id': box.id,
                'name': box.name,
                'owner': box.owner.email if box.owner else None,
                'sport': box.sport,
                'location': box.location,
                'status': box.status.capitalize(),
                'bookings': box.booking_count,
                'revenue': box.revenue,
            }
            for box in boxes_qs
        ],
        'recent_users': UserSerializer(recent_users, many=True).data,
        'recent_bookings': [
            {
                'id': b.id,
                'user': b.user.email,
                'box': b.box.name if b.box else None,
                'date': b.date,
                'amount': str(b.total_amount),
                'status': b.booking_status,
                'created_at': b.created_at,
            }
            for b in recent_bookings
        ],
        'revenue_chart': {
            'labels': labels,
            'data': revenue_chart_data,
        },
        'user_growth_chart': {
            'labels': labels,
            'data': user_growth_data,
        },
        'booking_trend_chart': {
            'labels': labels,
            'data': booking_trend_data,
        },
        'sports_distribution': {
            'labels': list(sports_distribution.keys()),
            'data': list(sports_distribution.values()),
        },
        'top_cities': top_cities,
        'peak_booking_hours': peak_booking_hours,
        'owner_performance_ranking': owner_performance_ranking,
        'top_boxes_by_revenue': top_boxes_by_revenue,
        'recent_activity': [
            {
                'type': event['type'],
                'text': event['text'],
                'time': event['time'].isoformat() if event['time'] else None,
            }
            for event in recent_activity
        ],
    })


# --- Owner verification (identity/business KYC) ---
# Mirrors boxes/views.py's Box submit -> pending -> admin review pattern:
# OwnerVerificationView is the owner-facing "OwnerBoxViewSet" half (get
# current status, submit/resubmit), AdminOwnerVerificationViewSet is the
# admin-facing "AdminBoxViewSet" half (list pending, approve, reject).
class OwnerVerificationView(APIView):
    """Owner-facing verification submission. GET returns (and lazily
    creates, in 'not_submitted' state) the caller's own OwnerVerification —
    never another owner's. POST submits/resubmits it, always landing in
    'pending'; a resubmission after rejection clears the prior rejection
    reason and review metadata. Blocked while a submission is already
    pending or already approved, mirroring OwnerBoxViewSet's
    changes_requested-only auto-resubmit guard.

    is_verified is NEVER touched here — only
    AdminOwnerVerificationViewSet.approve() below ever sets it True."""
    permission_classes = [IsOwnerUser]

    def get(self, request):
        verification, _ = OwnerVerification.objects.get_or_create(user=request.user)
        return Response(OwnerVerificationSerializer(verification, context={'request': request}).data)

    def post(self, request):
        verification, _ = OwnerVerification.objects.get_or_create(user=request.user)
        if verification.verification_status == 'pending':
            return Response(
                {'detail': 'Your verification is already pending review.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if verification.verification_status == 'approved':
            return Response(
                {'detail': 'You are already verified.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OwnerVerificationSerializer(
            verification, data=request.data, partial=True, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        has_document = serializer.validated_data.get('verification_document') or verification.verification_document
        if not has_document:
            return Response(
                {'detail': 'Please upload a verification document (PAN card, GST certificate, or similar).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save(
            verification_status='pending',
            submitted_at=timezone.now(),
            rejection_reason='',
            reviewed_at=None,
            reviewed_by=None,
        )
        return Response(
            OwnerVerificationSerializer(verification, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminOwnerVerificationViewSet(viewsets.ViewSet):
    """Admin-only review queue for owner identity/business verification —
    same list_pending/approve/reject shape as boxes/views.py's
    AdminBoxViewSet. approve() is the only code path (besides Google OAuth
    signup — see google_auth.py) that ever sets User.is_verified True;
    reject() explicitly leaves it False. Access is gated purely by
    IsAdminUser (role == 'admin'), so an owner — including the owner whose
    own verification is under review — can never call these."""
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination

    def list_pending(self, request):
        pending = OwnerVerification.objects.filter(
            verification_status='pending',
        ).select_related('user', 'reviewed_by').order_by('submitted_at')
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(pending, request)
        serializer = OwnerVerificationSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def approve(self, request, pk=None):
        verification = get_object_or_404(OwnerVerification, pk=pk)
        verification.verification_status = 'approved'
        verification.rejection_reason = ''
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        verification.save(update_fields=['verification_status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])

        verification.user.is_verified = True
        verification.user.save(update_fields=['is_verified'])

        notify(
            verification.user, 'Verification approved',
            'Your owner verification has been approved — your profile now shows as verified.',
            link='/owner-dashboard',
        )
        log_admin_action(
            request.user, 'owner_verification.approve', target=verification,
            details={'owner': verification.user.email},
        )
        return Response(OwnerVerificationSerializer(verification, context={'request': request}).data)

    def reject(self, request, pk=None):
        reason = request.data.get('reason', '')
        if not reason.strip():
            return Response(
                {'detail': 'Please provide a reason for rejection.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        verification = get_object_or_404(OwnerVerification, pk=pk)
        verification.verification_status = 'rejected'
        verification.rejection_reason = reason
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        verification.save(update_fields=['verification_status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])
        notify(
            verification.user, 'Verification rejected',
            f'Your owner verification was rejected: {reason}',
            link='/owner-dashboard',
        )
        log_admin_action(
            request.user, 'owner_verification.reject', target=verification,
            details={'owner': verification.user.email, 'reason': reason},
        )
        return Response(OwnerVerificationSerializer(verification, context={'request': request}).data)


# --- Owner payout details (bank/UPI destination for payouts) ---
class OwnerPayoutDetailsView(APIView):
    """Owner-facing view/edit of their own payout destination (bank account
    or UPI) — see OwnerPayoutDetails' docstring for why this is a separate
    model from owner_dashboard.Payout. GET lazily get_or_creates (mirroring
    OwnerVerificationView.get above) an empty row rather than 404ing, since
    "not filled in yet" is an expected, non-error state. PUT/PATCH update
    it; both accept partial data since every field is individually optional
    — the serializer's own validate() is what still enforces bank_account_
    number/ifsc_code being filled together.

    Deliberately never a gate: an owner never needs to hit this endpoint to
    use the rest of their dashboard, list boxes, or take bookings."""
    permission_classes = [IsOwnerUser]

    def get(self, request):
        details, _ = OwnerPayoutDetails.objects.get_or_create(owner=request.user)
        return Response(OwnerPayoutDetailsSerializer(details).data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial):
        details, _ = OwnerPayoutDetails.objects.get_or_create(owner=request.user)
        serializer = OwnerPayoutDetailsSerializer(details, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# --- Admin action audit log (read-only) ---
class AdminActionLogListView(generics.ListAPIView):
    """Admin-only, read-only, newest-first history of admin actions with
    real consequences (user edit/create/delete, box approve/reject, payout
    record) — backs the Activity Log tab on AdminDashboard.jsx. Every row is
    written by user/audit.py::log_admin_action(), called from the admin
    views themselves alongside (not instead of) their existing logger.info()
    lines."""
    serializer_class = AdminActionLogSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['action', 'target_type']

    def get_queryset(self):
        return AdminActionLog.objects.select_related('actor').all()