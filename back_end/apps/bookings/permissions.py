from rest_framework import permissions

from apps.common.authz import is_admin, is_owner, is_customer


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)

    def has_object_permission(self, request, view, obj):
        return is_admin(request.user)


class IsOwnerOfGym(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and is_owner(request.user))

    def has_object_permission(self, request, view, obj):
        return bool(
            is_owner(request.user)
            and getattr(obj, 'field', None)
            and obj.field.gym.owner_id == request.user.user_id
        )


class IsBookingUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return bool(obj.user_id == request.user.user_id)


class IsBookingManager(permissions.BasePermission):
    """
    Object-level manager for booking operations:
    admin OR gym owner OR booking user.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if is_admin(user):
            return True
        if is_owner(user) and obj.field.gym.owner_id == user.user_id:
            return True
        return obj.user_id == user.user_id


class IsBookingUserOrAdmin(permissions.BasePermission):
    """Object-level permission for booking owner or admin."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return is_admin(request.user) or obj.user_id == request.user.user_id
