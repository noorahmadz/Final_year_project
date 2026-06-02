from rest_framework import permissions

from apps.common.authz import is_admin, is_owner, is_customer


def can_manage_gym(user, gym):
    return is_admin(user) or (is_owner(user) and gym.owner_id == user.user_id)


def can_manage_field(user, field):
    return can_manage_gym(user, field.gym)


def can_manage_slot(user, slot):
    return can_manage_gym(user, slot.field.gym)


def can_manage_discount(user, discount):
    return can_manage_gym(user, discount.gym)


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)


class IsOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_owner(request.user)


class IsAdminOrOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user) or is_owner(request.user)


class IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_customer(request.user)


class IsGymOwnerOrAdmin(permissions.BasePermission):
    """
    Allow access to admins or owners of the gym object.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return can_manage_gym(request.user, obj)


class IsFieldOwnerOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return can_manage_field(request.user, obj)


class IsSlotOwnerOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return can_manage_slot(request.user, obj)


class IsDiscountOwnerOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return can_manage_discount(request.user, obj)


class IsReviewOwnerOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return is_admin(request.user) or obj.user_id == request.user.user_id


__all__ = [
    'IsAdminUser',
    'IsOwner',
    'IsAdminOrOwner',
    'IsCustomer',
    'IsGymOwnerOrAdmin',
    'IsFieldOwnerOrAdmin',
    'IsSlotOwnerOrAdmin',
    'IsDiscountOwnerOrAdmin',
    'IsReviewOwnerOrAdmin',
    'is_admin',
    'is_owner',
    'is_customer',
    'can_manage_gym',
    'can_manage_field',
    'can_manage_slot',
    'can_manage_discount',
]
