from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models import Q
from apps.users.models import User


class Gym(models.Model):
    """Gym model for managing futsal gym/facility information."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    gym_id = models.BigAutoField(primary_key=True)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='gyms'
    )
    name = models.CharField(max_length=255)
    address = models.TextField()
    city = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    phone = models.CharField(max_length=20 ,blank=False,null=False)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_gyms'
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    approval_expires_at = models.DateTimeField(blank=True, null=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gyms'
        verbose_name = 'Gym'
        verbose_name_plural = 'Gyms'
        ordering = ['-created_at', '-gym_id']

    def __str__(self):
        return f"{self.name} - {self.city}"


class Field(models.Model):
    """Field model for managing futsal field/court within a gym."""

    FIELD_TYPE_CHOICES = [
        ('futsal', 'futsal'),
        ('football', 'football'),
        ('both', 'Both'),
    ]

    field_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    field_name = models.CharField(max_length=100)
    field_type = models.CharField(
        max_length=20,
        choices=FIELD_TYPE_CHOICES,
        default='futsal'
    )
    capacity = models.IntegerField(default=10)
    price_per_hour = models.DecimalField(max_digits=10, decimal_places=2)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fields'
        verbose_name = 'Field'
        verbose_name_plural = 'Fields'
        constraints = [
            models.UniqueConstraint(
                fields=['gym'],
                name='unique_gym_single_court',
            ),
        ]

    def __str__(self):
        return f"{self.field_name} - {self.gym.name}"


class TimeSlot(models.Model):
    """TimeSlot model for managing available time slots for fields."""

    slot_id = models.BigAutoField(primary_key=True)
    field = models.ForeignKey(
        Field,
        on_delete=models.CASCADE,
        related_name='time_slots'
    )
    day_of_week = models.IntegerField(
        help_text="Day of week (0=Monday, 6=Sunday)"
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_available = models.BooleanField(default=True)

    class Meta:
        db_table = 'time_slots'
        verbose_name = 'Time Slot'
        verbose_name_plural = 'Time Slots'

    def __str__(self):
        return f"{self.field} - Day {self.day_of_week} ({self.start_time} - {self.end_time})"


class Discount(models.Model):
    """Discount model for managing gym discounts."""

    discount_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='discounts'
    )
    title = models.CharField(max_length=255)
    # Optional discount code used by customers to apply a discount at booking time.
    # If null/blank, the discount can't be applied via `discount_code`.
    code = models.CharField(max_length=50, blank=True, null=True)
    percentage = models.PositiveIntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'discounts'
        verbose_name = 'Discount'
        verbose_name_plural = 'Discounts'
        ordering = ['-start_date']
        constraints = [
            # Ensure codes are unique per gym when present.
            models.UniqueConstraint(
                fields=['gym', 'code'],
                condition=Q(code__isnull=False) & ~Q(code=''),
                name='unique_discount_code_per_gym_when_present',
            )
        ]

    def __str__(self):
        return f"{self.title} - {self.percentage}% off at {self.gym.name}"


class Review(models.Model):
    """Review model for gym ratings and comments."""

    review_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reviews'
        verbose_name = 'Review'
        verbose_name_plural = 'Reviews'
        constraints = [
            models.UniqueConstraint(fields=['user', 'gym'], name='unique_review_per_user_per_gym'),
        ]

    def __str__(self):
        return f"Review {self.review_id} - {self.gym.name} by {self.user}"


class GymImage(models.Model):
    """GymImage model for managing gym images."""

    image_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='images'
    )
    image_url = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gym_images'
        verbose_name = 'Gym Image'
        verbose_name_plural = 'Gym Images'

    def __str__(self):
        return f"Image {self.image_id} - {self.gym.name}"


class GymAuditLog(models.Model):
    """Lightweight audit log for important gym actions."""

    TARGET_CHOICES = [
        ('gym', 'Gym'),
        ('field', 'Field'),
        ('discount', 'Discount'),
    ]

    log_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gym_audit_logs'
    )
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_id = models.BigIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gym_audit_logs'
        verbose_name = 'Gym Audit Log'
        verbose_name_plural = 'Gym Audit Logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} by {self.actor_id} on {self.target_type}:{self.target_id}"
