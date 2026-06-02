from rest_framework import serializers
from django.db import models
from django.utils import timezone
from .models import Gym, Field, TimeSlot, Discount, Review, GymImage


class GymImageSerializer(serializers.ModelSerializer):
    """Serializer for GymImage model."""
    
    class Meta:
        model = GymImage
        fields = ['image_id', 'image_url', 'uploaded_at']
        read_only_fields = ['image_id', 'uploaded_at']


class GymSerializer(serializers.ModelSerializer):
    """Serializer for Gym model."""
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    owner_email = serializers.SerializerMethodField()
    images = GymImageSerializer(many=True, read_only=True)
    fields_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    is_bookable = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    
    class Meta:
        model = Gym
        fields = [
            'gym_id', 'owner', 'owner_name', 'owner_email', 'name', 'address', 'city', 'description',
            'phone', 'status', 'approved_by', 'approved_at', 'approval_expires_at', 'created_at',
            'images', 'fields_count', 'average_rating', 'is_bookable', 'can_review'
        ]
        read_only_fields = ['gym_id', 'approved_by', 'approved_at', 'approval_expires_at', 'created_at']
    
    def get_fields_count(self, obj):
        return obj.fields.count()
    
    def get_average_rating(self, obj):
        reviews = obj.reviews.all()
        if reviews.exists():
            return round(reviews.aggregate(models.Avg('rating'))['rating__avg'], 1)
        return None
    
    def validate(self, data):
        if self.instance and self.instance.status == 'approved':
            # Only allow certain fields to be updated after approval
            allowed_fields = ['name', 'address', 'city', 'description', 'phone']
            for field in data.keys():
                if field not in allowed_fields:
                    raise serializers.ValidationError(
                        {field: "Cannot modify this field after gym is approved."}
                    )
        return data

    def get_is_bookable(self, obj):
        if obj.is_deleted or obj.status != 'approved':
            return False
        if obj.approval_expires_at is not None and obj.approval_expires_at <= timezone.now():
            return False
        return True

    def get_can_review(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'role', None) == 'owner' and obj.owner_id == user.user_id:
            return False
        if getattr(user, 'role', None) == 'admin':
            return False
        return not Review.objects.filter(user=user, gym=obj).exists()

    def get_owner_email(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if request and user and user.is_authenticated and user.is_staff:
            return obj.owner.email
        return None


class GymListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing gyms."""
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    owner_email = serializers.SerializerMethodField()
    images = GymImageSerializer(many=True, read_only=True)
    average_rating = serializers.SerializerMethodField()
    is_bookable = serializers.SerializerMethodField()
    
    class Meta:
        model = Gym
        fields = [
            'gym_id', 'name', 'address', 'city', 'description', 'phone',
            'status', 'approval_expires_at', 'owner_name', 'owner_email', 'images', 'average_rating', 'is_bookable', 'created_at'
        ]
    
    def get_average_rating(self, obj):
        reviews = obj.reviews.all()
        if reviews.exists():
            from django.db.models import Avg
            return round(reviews.aggregate(Avg('rating'))['rating__avg'], 1)
        return None

    def get_is_bookable(self, obj):
        if obj.is_deleted or obj.status != 'approved':
            return False
        if obj.approval_expires_at is not None and obj.approval_expires_at <= timezone.now():
            return False
        return True

    def get_owner_email(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if request and user and user.is_authenticated and user.is_staff:
            return obj.owner.email
        return None


class FieldSerializer(serializers.ModelSerializer):
    """Serializer for Field model."""
    
    class Meta:
        model = Field
        fields = [
            'field_id', 'gym', 'field_name', 'field_type', 'capacity',
            'price_per_hour', 'is_available', 'created_at'
        ]
        read_only_fields = ['field_id', 'created_at']


class TimeSlotSerializer(serializers.ModelSerializer):
    """Serializer for TimeSlot model."""
    field_name = serializers.CharField(source='field.field_name', read_only=True)
    
    class Meta:
        model = TimeSlot
        fields = ['slot_id', 'field', 'field_name', 'day_of_week', 'start_time', 'end_time', 'is_available']
        read_only_fields = ['slot_id']
    
    def validate(self, data):
        if data.get('start_time') and data.get('end_time'):
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError({'end_time': 'End time must be after start time.'})
        if data.get('day_of_week') is not None:
            if data['day_of_week'] < 0 or data['day_of_week'] > 6:
                raise serializers.ValidationError({'day_of_week': 'Day of week must be between 0 (Monday) and 6 (Sunday).'})
        return data


class DiscountSerializer(serializers.ModelSerializer):
    """Serializer for Discount model."""
    
    class Meta:
        model = Discount
        fields = ['discount_id', 'gym', 'title', 'code', 'percentage', 'start_date', 'end_date', 'is_active']
        read_only_fields = ['discount_id']
    
    def validate_code(self, value):
        # Treat empty strings as "no code".
        if value is None:
            return None
        value = str(value).strip()
        if not value:
            return None
        # Normalize to uppercase for stable matching.
        return value.upper()
    
    def validate_percentage(self, value):
        if value < 1 or value > 100:
            raise serializers.ValidationError('Percentage must be between 1 and 100.')
        return value
    
    def validate(self, data):
        if data.get('start_date') and data.get('end_date'):
            if data['start_date'] > data['end_date']:
                raise serializers.ValidationError({'end_date': 'End date must be after start date.'})
        return data


class ReviewSerializer(serializers.ModelSerializer):
    """Serializer for Review model."""
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    
    class Meta:
        model = Review
        fields = ['review_id', 'gym', 'user', 'user_name', 'rating', 'comment', 'created_at']
        read_only_fields = ['review_id', 'user', 'created_at']
    
    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value
    
    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return data

        # Gym must be derived from the real context (nested route), not optional client payload.
        gym = self.context.get('gym') or data.get('gym') or getattr(self.instance, 'gym', None)
        if gym is None:
            raise serializers.ValidationError({'gym': 'Gym is required.'})

        # Check if user already reviewed this gym
        existing_reviews = Review.objects.filter(user=user, gym=gym)
        if self.instance is not None:
            existing_reviews = existing_reviews.exclude(review_id=self.instance.review_id)
        if existing_reviews.exists():
            raise serializers.ValidationError({'non_field_errors': ['You have already reviewed this gym.']})

        return data


class GymApproveSerializer(serializers.Serializer):
    """Serializer for gym approval/rejection."""
    status = serializers.ChoiceField(choices=['approved', 'rejected'])
    approval_expires_at = serializers.DateTimeField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['status'] == 'approved':
            expires_at = attrs.get('approval_expires_at')
            if expires_at is not None and expires_at <= timezone.now():
                raise serializers.ValidationError(
                    {'approval_expires_at': 'Approval expiry must be in the future.'}
                )
        return attrs


