from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import validate_email
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from datetime import timedelta
import secrets


class UserManager(BaseUserManager):
    """Custom user manager for creating users and superusers."""

    @staticmethod
    def normalize_auth_email(email):
        return (email or '').strip().lower()

    def create_user(self, email, full_name, password=None, **extra_fields):
        email = self.normalize_auth_email(email)
        if not email:
            raise ValueError('Users must have an email address')
        if not full_name:
            raise ValueError('Users must have a full name')
        if not password:
            raise ValueError('Users must have a password')
        if not extra_fields.get('phone'):
            raise ValueError('Users must have a phone number')

        validate_email(email)

        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_verified', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, full_name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model with email as USERNAME_FIELD."""

    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('owner', 'Owner'),
        ('customer', 'Customer'),
    ]

    user_id = models.BigAutoField(primary_key=True)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, unique=True,null=False, blank=False)
    email = models.EmailField(unique=True, null=False, blank=False)
    is_verified = models.BooleanField(default=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='customer')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'phone']

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.full_name or self.phone

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.full_name or self.phone


class UserNotification(models.Model):
    class Type(models.TextChoices):
        TOURNAMENT_TEAM_APPROVED = 'tournament_team_approved', 'Tournament team approved'
        TOURNAMENT_TEAM_REJECTED = 'tournament_team_rejected', 'Tournament team rejected'

    notification_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(max_length=64, choices=Type.choices)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_notifications'
        verbose_name = 'User Notification'
        verbose_name_plural = 'User Notifications'
        ordering = ['-created_at', '-notification_id']

    def __str__(self):
        return f'{self.user_id}:{self.notification_type}'


class EmailVerificationOTP(models.Model):
    class DeliveryStatus(models.TextChoices):
        NOT_ATTEMPTED = 'not_attempted', 'Not attempted'
        SENT = 'sent', 'Sent'
        FAILED = 'failed', 'Failed'

    OTP_LENGTH = 6
    OTP_TTL = timedelta(minutes=2)
    RESEND_COOLDOWN = timedelta(seconds=60)
    DEFAULT_MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='email_verification_otps')
    email = models.EmailField()
    otp_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    delivery_status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.NOT_ATTEMPTED,
    )
    delivery_attempted_at = models.DateTimeField(null=True, blank=True)
    delivery_sent_at = models.DateTimeField(null=True, blank=True)
    delivery_failed_at = models.DateTimeField(null=True, blank=True)
    delivery_error = models.TextField(blank=True, default='')
    attempts_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=DEFAULT_MAX_ATTEMPTS)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'email_verification_otps'
        indexes = [
            models.Index(fields=['email', 'created_at']),
            models.Index(fields=['user', 'created_at']),
        ]

    @classmethod
    def generate_otp(cls):
        return f"{secrets.randbelow(10 ** cls.OTP_LENGTH):0{cls.OTP_LENGTH}d}"

    @classmethod
    def issue_for_user(cls, user):
        now = timezone.now()
        cls.objects.filter(user=user, is_used=False).update(is_used=True, used_at=now)
        otp = cls.generate_otp()
        record = cls.objects.create(
            user=user,
            email=user.email,
            otp_hash=make_password(otp),
            expires_at=now + cls.OTP_TTL,
        )
        return record, otp

    def is_expired(self):
        return timezone.now() >= self.expires_at

    def resend_available_at(self):
        return self.created_at + self.RESEND_COOLDOWN

    def verify_otp(self, raw_otp):
        if self.is_used or self.is_expired() or self.attempts_count >= self.max_attempts:
            return False

        if not check_password(raw_otp, self.otp_hash):
            self.attempts_count += 1
            if self.attempts_count >= self.max_attempts:
                self.is_used = True
                self.used_at = timezone.now()
                self.save(update_fields=['attempts_count', 'is_used', 'used_at'])
            else:
                self.save(update_fields=['attempts_count'])
            return False

        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=['is_used', 'used_at'])
        return True
