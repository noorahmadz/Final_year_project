from rest_framework import permissions

from apps.common.authz import is_admin, is_owner


class IsExpenseAdminOrOwner(permissions.BasePermission):
    """
    Allow expense access only to admins and owners.
    Owners are limited to expenses attached to their own gyms.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (is_admin(user) or is_owner(user)))

    def has_object_permission(self, request, view, obj):
        user = request.user
        if is_admin(user):
            return True
        return is_owner(user) and obj.gym.owner_id == user.user_id
