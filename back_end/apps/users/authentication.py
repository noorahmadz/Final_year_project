from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class VerifiedUserJWTAuthentication(JWTAuthentication):
    """
    Reject authenticated API access for users whose email address is not verified.
    """

    def authenticate(self, request):
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None

        user, token = authenticated
        if not getattr(user, 'is_verified', False):
            raise AuthenticationFailed(
                detail={
                    'message': 'Email address is not verified.',
                    'error_code': 'email_not_verified',
                    'errors': {'email': ['Email address is not verified.']},
                }
            )

        return user, token
