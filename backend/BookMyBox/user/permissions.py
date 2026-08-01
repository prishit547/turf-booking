from rest_framework import permissions

class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    """
    def has_object_permission(self, request, view, obj):
        # Read permissions for any request
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions are only allowed to the owner of the object.
        if hasattr(obj, 'owner'):
            return obj.owner == request.user
        return obj == request.user

class IsAdminUser(permissions.BasePermission):
    """
    Custom permission to only allow admin users.
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == 'admin'

class IsOwnerUser(permissions.BasePermission):
    """
    Custom permission to only allow facility owners.
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == 'owner'

class IsPlayerUser(permissions.BasePermission):
    """
    Custom permission to only allow regular users (players).
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == 'user'

class IsAdminOrOwner(permissions.BasePermission):
    """
    Custom permission to allow admin or owner users.
    """
    def has_permission(self, request, view):
        return (request.user and request.user.is_authenticated and 
                request.user.role in ['admin', 'owner'])

class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Custom permission to allow owners to manage their own objects, and admins to manage all.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['admin', 'owner']

    def has_object_permission(self, request, view, obj):
        # Admin can access everything
        if request.user.role == 'admin':
            return True

        # Owner can only access their own objects
        if request.user.role == 'owner':
            return hasattr(obj, 'owner') and obj.owner == request.user

        return False

class IsVerifiedUser(permissions.BasePermission):
    """
    Custom permission to only allow verified users.
    """
    def has_permission(self, request, view):
        return (request.user and request.user.is_authenticated and 
                hasattr(request.user, 'is_verified') and request.user.is_verified)

class IsOwnerOrAdminOrReadOnly(permissions.BasePermission):
    """
    Custom permission to allow read access to everyone, 
    but only allow write access to owners and admins.
    """
    def has_permission(self, request, view):
        # Allow read access to authenticated users
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        
        # Write access only for authenticated admin or owner users
        return (request.user and request.user.is_authenticated and 
                request.user.role in ['admin', 'owner'])
    
    def has_object_permission(self, request, view, obj):
        # Read permissions for authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Admin can modify everything
        if request.user.role == 'admin':
            return True
        
        # Owner can only modify their own objects
        if request.user.role == 'owner':
            return hasattr(obj, 'owner') and obj.owner == request.user
        
        return False