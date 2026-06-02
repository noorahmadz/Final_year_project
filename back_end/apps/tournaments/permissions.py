from rest_framework import permissions
from apps.users.permissions import IsAdminUser, IsOwner

# Re-export permissions from users app for convenience
__all__ = ['IsAdminUser', 'IsOwner']
