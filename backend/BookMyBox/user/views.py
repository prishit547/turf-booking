# user/views.py

from django.conf import settings
from django.db.models import Sum, Count, DecimalField, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import authenticate

from boxes.models import Box
from bookings.models import Booking

from .models import User
from .serializers import (
    UserRegistrationSerializer,
    # UserLoginSerializer,  # <--- CONFIRMED: This line should be commented out or removed
    UserSerializer,
    UserUpdateSerializer,
    PasswordChangeSerializer,
    CustomTokenObtainPairSerializer, # <--- CORRECTED: This now matches the name in serializers.py
)
from .google_auth import GoogleAuthSerializer

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

    def get_queryset(self):
        # Admins can see all users, others can only see their own profile in a list context
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return User.objects.all()
        return User.objects.filter(id=self.request.user.id) # Non-admins retrieve only themselves


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieves, updates, or deletes a specific user by ID.
    Access is restricted to admins or the user owning the profile.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'pk' # Assumes primary key is used for lookup

    def get_queryset(self):
        # Admins can interact with any user profile.
        # Non-admins can only interact with their own profile.
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return User.objects.all()
        return User.objects.filter(id=self.request.user.id)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_dashboard_data(request):
    """
    Returns aggregated stats and lists for the admin dashboard.
    """
    if request.user.role != 'admin':
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    total_users = User.objects.count()
    total_owners = User.objects.filter(role='owner').count()
    total_bookings = Booking.objects.filter(
        booking_status__in=['Confirmed', 'Completed']
    ).count()
    platform_revenue = Booking.objects.filter(
        booking_status__in=['Confirmed', 'Completed']
    ).aggregate(
        total=Sum('total_amount', default=0.0, output_field=DecimalField())
    )['total']
    pending_boxes = Box.objects.filter(status='pending').order_by('-submitted_at')

    # Full lists used in the Users / Bookings / Boxes tabs
    all_users = User.objects.order_by('-date_joined')
    all_bookings = Booking.objects.select_related('user', 'box', 'box__owner').order_by('-created_at')
    all_boxes = Box.objects.select_related('owner').order_by('-submitted_at')

    recent_users = all_users[:10]
    recent_bookings = all_bookings[:10]
    boxes_overview = all_boxes[:50]

    # Monthly chart data for the last 6 calendar months
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

    revenue_by_month = {m: 0 for m in months}
    users_by_month = {m: 0 for m in months}
    bookings_by_month = {m: 0 for m in months}

    for booking in Booking.objects.filter(
        booking_status__in=['Confirmed', 'Completed'],
        created_at__date__gte=months[0],
        created_at__date__lte=today,
    ):
        key = booking.created_at.date().replace(day=1)
        if key in revenue_by_month:
            revenue_by_month[key] += float(booking.total_amount or 0)

    for user in User.objects.filter(
        date_joined__date__gte=months[0],
        date_joined__date__lte=today,
    ):
        key = user.date_joined.date().replace(day=1)
        if key in users_by_month:
            users_by_month[key] += 1

    for booking in Booking.objects.filter(
        created_at__date__gte=months[0],
        created_at__date__lte=today,
    ):
        key = booking.created_at.date().replace(day=1)
        if key in bookings_by_month:
            bookings_by_month[key] += 1

    revenue_chart_data = [revenue_by_month[m] for m in months]
    user_growth_data = [users_by_month[m] for m in months]
    booking_trend_data = [bookings_by_month[m] for m in months]

    # Sports distribution across approved boxes
    sports_distribution = {}
    for box in Box.objects.filter(status='approved'):
        sport = box.sport or 'Other'
        sports_distribution[sport] = sports_distribution.get(sport, 0) + 1

    # Top cities by confirmed/completed bookings
    city_bookings = {}
    for booking in Booking.objects.filter(booking_status__in=['Confirmed', 'Completed']):
        city = booking.box.location if booking.box and booking.box.location else 'Unknown'
        city_bookings[city] = city_bookings.get(city, 0) + 1
    total_city_bookings = sum(city_bookings.values()) or 1
    top_cities = sorted(
        [
            {'city': city, 'bookings': count, 'percentage': round((count / total_city_bookings) * 100)}
            for city, count in city_bookings.items()
        ],
        key=lambda x: x['bookings'],
        reverse=True,
    )[:5]

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
            'pending_boxes_count': pending_boxes.count(),
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
                'bookings': user.bookings.filter(booking_status__in=['Confirmed', 'Completed']).count(),
                'joinDate': user.date_joined.date().isoformat(),
            }
            for user in all_users
        ],
        'bookings': [
            {
                'id': b.id,
                'user': b.user.full_name or b.user.email,
                'box': b.box.name if b.box else None,
                'owner': b.box.owner.email if b.box and b.box.owner else None,
                'date': b.date.isoformat() if b.date else None,
                'amount': str(b.total_amount),
                'commission': str(round(float(b.total_amount or 0) * 0.1, 2)),
                'status': b.booking_status,
            }
            for b in all_bookings
        ],
        'boxes': [
            {
                'id': box.id,
                'name': box.name,
                'owner': box.owner.email if box.owner else None,
                'sport': box.sport,
                'location': box.location,
                'status': box.status.capitalize(),
                'bookings': box.bookings.filter(
                    booking_status__in=['Confirmed', 'Completed']
                ).count(),
                'revenue': box.bookings.filter(
                    booking_status__in=['Confirmed', 'Completed']
                ).aggregate(
                    total=Sum('total_amount', default=0.0, output_field=DecimalField())
                )['total'],
            }
            for box in all_boxes
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
        'boxes_overview': [
            {
                'id': box.id,
                'name': box.name,
                'owner': box.owner.email if box.owner else None,
                'sport': box.sport,
                'location': box.location,
                'status': box.status,
                'bookings': box.bookings.filter(
                    booking_status__in=['Confirmed', 'Completed']
                ).count(),
                'revenue': box.bookings.filter(
                    booking_status__in=['Confirmed', 'Completed']
                ).aggregate(
                    total=Sum('total_amount', default=0.0, output_field=DecimalField())
                )['total'],
            }
            for box in boxes_overview
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
        'recent_activity': [
            {
                'type': event['type'],
                'text': event['text'],
                'time': event['time'].isoformat() if event['time'] else None,
            }
            for event in recent_activity
        ],
    })