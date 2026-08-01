# boxes/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PublicBoxViewSet, OwnerBoxViewSet, AdminBoxViewSet

# Router for the public-facing API (listing, searching boxes)
public_router = DefaultRouter()
public_router.register(r'public', PublicBoxViewSet, basename='public-box')

# Router for the owner-specific API (creating, managing their own boxes)
owner_router = DefaultRouter()
owner_router.register(r'owner', OwnerBoxViewSet, basename='owner-box')

urlpatterns = [
    path('', include(public_router.urls)),
    path('', include(owner_router.urls)),
    path('admin/pending/', AdminBoxViewSet.as_view({'get': 'list_pending'}), name='admin-pending-boxes'),
    path('admin/<int:pk>/approve/', AdminBoxViewSet.as_view({'post': 'approve'}), name='admin-approve-box'),
    path('admin/<int:pk>/reject/', AdminBoxViewSet.as_view({'post': 'reject'}), name='admin-reject-box'),
]