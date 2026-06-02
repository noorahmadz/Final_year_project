from rest_framework import permissions

from apps.common.authz import is_admin, is_owner, is_customer


class IsAdminUser(permissions.BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return is_admin(request.user)


class IsOwner(permissions.BasePermission):
    """
    Allows access only to owners.
    """
    def has_permission(self, request, view):
        return is_owner(request.user)


class IsCustomer(permissions.BasePermission):
    """
    Allows access only to customers.
    """
    def has_permission(self, request, view):
        return is_customer(request.user)


class IsAdminOrOwner(permissions.BasePermission):
    """
    Allows access to admin users or owners.
    """
    def has_permission(self, request, view):
        return is_admin(request.user) or is_owner(request.user)


class IsAdminOrOwnerOrReadOnly(permissions.BasePermission):
    """
    Allows read access to anyone, but write access only to admin or owner.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_admin(request.user) or is_owner(request.user)


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Allows read access to anyone, but write access only to owners for their own objects.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        # Check if user is owner of the object
        if hasattr(obj, 'owner'):
            return obj.owner == request.user
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return False


class IsOwnerOfGym(permissions.BasePermission):
    """
    Custom permission to check if user owns the gym.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
    
    def has_object_permission(self, request, view, obj):
        if is_admin(request.user):
            return True
        if hasattr(obj, 'owner'):
            return obj.owner == request.user
        return False
