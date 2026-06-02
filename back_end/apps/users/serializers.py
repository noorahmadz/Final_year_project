from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""
    
    class Meta:
        model = User
        fields = ['user_id', 'full_name', 'phone', 'email', 'role', 'is_active', 'created_at']
        read_only_fields = ['user_id', 'created_at', 'role']


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new user."""
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)
    ALLOWED_REGISTRATION_ROLES = {'owner', 'customer'}
    
    class Meta:
        model = User
        fields = ['full_name', 'phone', 'email', 'password', 'password_confirm', 'role']

    def validate_role(self, value):
        if value not in self.ALLOWED_REGISTRATION_ROLES:
            raise serializers.ValidationError('Role must be either "owner" or "customer".')
        return value

    def validate_email(self, value):
        normalized_email = User.objects.normalize_auth_email(value)
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized_email
    
    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return data
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data['password']
        user = User(**{key: value for key, value in validated_data.items() if key != 'password'})
        try:
            validate_password(password, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        user = User.objects.create_user(**validated_data)
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)
    
    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        normalized_email = User.objects.normalize_auth_email(email)
        user = User.objects.filter(email=normalized_email).first()

        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("User account is disabled.")

        authenticated_user = authenticate(
            request=self.context.get('request'),
            email=normalized_email,
            password=password,
        )
        if not authenticated_user:
            raise serializers.ValidationError("Invalid email or password.")

        data['user'] = authenticated_user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for changing password."""
    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, required=True, min_length=8)
    
    def validate(self, data):
        if data['new_password'] != data['new_password_confirm']:
            raise serializers.ValidationError({"new_password_confirm": "New passwords do not match."})
        try:
            validate_password(data['new_password'], user=self.context['request'].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})
        return data
    
    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value
    
    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user


class VerifyEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp = serializers.RegexField(regex=r'^\d{6}$', required=True)


class ResendEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
