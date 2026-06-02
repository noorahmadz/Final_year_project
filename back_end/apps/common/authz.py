from __future__ import annotations


def is_authenticated(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False))


def has_role(user, role: str) -> bool:
    return is_authenticated(user) and getattr(user, "role", None) == role


def is_admin(user) -> bool:
    return has_role(user, "admin")


def is_owner(user) -> bool:
    return has_role(user, "owner")


def is_customer(user) -> bool:
    return has_role(user, "customer")


__all__ = [
    "is_authenticated",
    "has_role",
    "is_admin",
    "is_owner",
    "is_customer",
]

