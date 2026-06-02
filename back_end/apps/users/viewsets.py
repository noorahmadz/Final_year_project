from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.common.api import StandardizedModelViewSetMixin
from .models import User, EmailVerificationOTP
from .serializers import (
    UserSerializer, 
    UserCreateSerializer, 
    LoginSerializer,
    ChangePasswordSerializer,
    VerifyEmailOTPSerializer,
    ResendEmailOTPSerializer,
)
from .permissions import IsAdminUser
from .email_utils import deliver_verification_otp_email

User = get_user_model()


class UserViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing users.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer
    
    def get_permissions(self):
        if self.action in ['login', 'register', 'verify_email_otp', 'resend_email_otp']:
            permission_classes = [AllowAny]
        else:
            permission_classes = self.permission_classes
        return [permission() for permission in permission_classes]

    def get_throttles(self):
        if self.action == 'login':
            self.throttle_scope = 'login'
            return [ScopedRateThrottle()]
        return super().get_throttles()
    
    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return User.objects.all()
        return User.objects.filter(user_id=user.user_id)
    
    @action(detail=False, methods=['post'])
    def login(self, request):
        """
        Official mobile/web auth endpoint. Returns JWT tokens and user profile.
        """
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        if not user.is_verified:
            return self.error(
                message='Email address is not verified.',
                errors={'email': ['Email address is not verified.']},
                error_code='email_not_verified',
                status_code=status.HTTP_403_FORBIDDEN,
            )
        
        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data
        payload = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': user_data,
        }
        return self.success(data=payload, message='Login successful.')
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        """
        Register a new customer user.
        """
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            otp_record, otp = EmailVerificationOTP.issue_for_user(user)
        delivery_result = deliver_verification_otp_email(otp_id=otp_record.pk, otp=otp)

        user_data = UserSerializer(user).data
        payload = {
            'user': user_data,
            'verification_required': True,
            'email_verification': {
                'required': True,
                'email': user.email,
                'delivery_status': delivery_result.get(
                    'status',
                    EmailVerificationOTP.DeliveryStatus.NOT_ATTEMPTED,
                ),
            },
        }
        if not delivery_result.get('ok', False):
            return self.success(
                data=payload,
                message='Registration completed, but we could not send the verification email. Please request a new code.',
                status_code=status.HTTP_201_CREATED,
            )
        return self.success(
            data=payload,
            message='Registration successful. Please verify your email before logging in.',
            status_code=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _get_user_by_email(email):
        normalized_email = User.objects.normalize_email(email)
        users = User.objects.filter(email__iexact=normalized_email).order_by('user_id')
        if users.count() != 1:
            return None
        return users.first()

    @staticmethod
    def _get_latest_email_otp(user):
        return EmailVerificationOTP.objects.filter(user=user).order_by('-created_at').first()

    @action(detail=False, methods=['post'], url_path='verify-email-otp')
    def verify_email_otp(self, request):
        serializer = VerifyEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = self._get_user_by_email(serializer.validated_data['email'])
        if not user:
            return self.error(message='Account with this email does not exist.', status_code=status.HTTP_400_BAD_REQUEST)
        if user.is_verified:
            return self.success(message='Email is already verified.')

        otp_record = self._get_latest_email_otp(user)
        if not otp_record or otp_record.is_used or otp_record.is_expired() or otp_record.attempts_count >= otp_record.max_attempts:
            return self.error(
                message='Invalid or expired verification code.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if not otp_record.verify_otp(serializer.validated_data['otp']):
            latest = self._get_latest_email_otp(user)
            if latest and latest.attempts_count >= latest.max_attempts:
                return self.error(
                    message='Verification attempts exceeded. Please request a new code.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            return self.error(
                message='Invalid or expired verification code.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user.is_verified = True
        user.save(update_fields=['is_verified'])
        EmailVerificationOTP.objects.filter(user=user, is_used=False).update(is_used=True, used_at=timezone.now())
        return self.success(message='Email verified successfully.')

    @action(detail=False, methods=['post'], url_path='resend-email-otp')
    def resend_email_otp(self, request):
        serializer = ResendEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = self._get_user_by_email(serializer.validated_data['email'])
        if not user:
            return self.error(message='Account with this email does not exist.', status_code=status.HTTP_400_BAD_REQUEST)
        if user.is_verified:
            return self.success(message='Email is already verified.')

        latest = self._get_latest_email_otp(user)
        if latest and not latest.is_used and timezone.now() < latest.resend_available_at():
            return self.error(
                message='Please wait before requesting another verification code.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            otp_record, otp = EmailVerificationOTP.issue_for_user(user)
        delivery_result = deliver_verification_otp_email(otp_id=otp_record.pk, otp=otp)

        if not delivery_result.get('ok', False):
            return self.error(
                message=delivery_result.get(
                    'message',
                    'We could not send the verification email. Please try again later.',
                ),
                error_code=delivery_result.get('error_code'),
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return self.success(message='Verification code sent successfully.')
    
    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """
        Change user password.
        """
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return self.success(message='Password changed successfully.')
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        Get current user info.
        """
        serializer = self.get_serializer(request.user)
        user_data = serializer.data
        return self.success(data=user_data)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAdminUser])
    def owners(self, request):
        """
        List all owners (admin only).
        """
        owners = User.objects.filter(role='owner')
        serializer = self.get_serializer(owners, many=True)
        return self.success(data={'results': serializer.data})
    
    @action(detail=False, methods=['get'], permission_classes=[IsAdminUser])
    def customers(self, request):
        """
        List all customers (admin only).
        """
        customers = User.objects.filter(role='customer')
        serializer = self.get_serializer(customers, many=True)
        return self.success(data={'results': serializer.data})

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser])
    def approve_owner(self, request):
        """
        Approve a pending owner request (admin only).
        """
        user_id = request.data.get('user_id')
        if not user_id:
            return self.error(message='user_id is required.', status_code=status.HTTP_400_BAD_REQUEST)

        try:
            owner = User.objects.get(user_id=user_id, role='owner')
        except User.DoesNotExist:
            return self.error(message='Owner request not found.', status_code=status.HTTP_404_NOT_FOUND)

        if owner.is_active:
            return self.error(message='Owner is already approved.', status_code=status.HTTP_400_BAD_REQUEST)

        owner.is_active = True
        owner.save(update_fields=['is_active'])

        owner_data = UserSerializer(owner).data
        return self.success(
            message='Owner approved successfully.',
            data={'user': owner_data},
        )

    @action(detail=False, methods=['post'])
    def logout(self, request):
        """
        Logout endpoint - blacklist the provided refresh token.
        """
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return self.error(message='refresh is required.', status_code=status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh_token)
            # Enforce ownership boundary: a user must not be able to revoke another user's refresh token.
            token_user_id = token.get('user_id')
            if token_user_id is not None and int(token_user_id) != int(request.user.user_id):
                return self.error(
                    message='You do not have permission to revoke this token.',
                    status_code=status.HTTP_403_FORBIDDEN,
                )

            jti = token.get('jti')
            if jti:
                outstanding = OutstandingToken.objects.filter(jti=jti).first()
                if outstanding and outstanding.user_id != request.user.user_id:
                    return self.error(
                        message='You do not have permission to revoke this token.',
                        status_code=status.HTTP_403_FORBIDDEN,
                    )
            token.blacklist()
        except TokenError:
            return self.error(message='Invalid or expired refresh token.', status_code=status.HTTP_400_BAD_REQUEST)

        return self.success(message='Logout successful.')
