# user/urls.py

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .notification_views import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
)

app_name = 'user'

urlpatterns = [
    # Authentication endpoints
    path('register/', views.register, name='register'),
    # CORRECTED: Use CustomTokenObtainPairView for login
    path('login/', views.CustomTokenObtainPairView.as_view(), name='login'), 
    path('logout/', views.logout, name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Google OAuth endpoints
    path('google-auth/', views.google_auth, name='google_auth'),
    path('complete-onboarding/', views.complete_onboarding, name='complete_onboarding'),
    
    # Profile endpoints
    path('profile/', views.profile, name='profile'),
    path('profile/update/', views.update_profile, name='update_profile'),
    path('change-password/', views.change_password, name='change_password'),
    path('password-reset/', views.request_password_reset, name='password_reset_request'),
    path('password-reset/confirm/', views.confirm_password_reset, name='password_reset_confirm'),
    path('search/', views.user_search, name='user_search'),

    # Dashboard endpoints
    path('dashboard/', views.user_dashboard_data, name='dashboard'),
    path('admin-dashboard/', views.admin_dashboard_data, name='admin_dashboard'),
    
    # Demo credentials
    path('demo-credentials/', views.demo_credentials, name='demo_credentials'),
    
    # User management (Admin only)
    path('users/', views.UserListView.as_view(), name='user_list'),
    path('users/<int:pk>/', views.UserDetailView.as_view(), name='user_detail'),
    path('users/<int:pk>/admin-update/', views.AdminUserUpdateView.as_view(), name='admin_user_update'),

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='notification_list'),
    path('notifications/unread-count/', NotificationUnreadCountView.as_view(), name='notification_unread_count'),
    path('notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification_mark_all_read'),
    path('notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification_mark_read'),
]