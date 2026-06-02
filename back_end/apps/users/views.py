from rest_framework import status
from rest_framework_simplejwt.views import TokenRefreshView

from apps.common.api import success_response
from .viewsets import UserViewSet


class WrappedTokenRefreshView(TokenRefreshView):
    """
    Canonical token refresh endpoint for mobile clients.
    """

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return success_response(
            message='Token refreshed successfully.',
            data=serializer.validated_data,
            status_code=status.HTTP_200_OK,
        )


__all__ = ['UserViewSet', 'WrappedTokenRefreshView']
