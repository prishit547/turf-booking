# user/serializers.py

from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer # Needed for CustomTokenObtainPairSerializer inheritance
from rest_framework_simplejwt.tokens import RefreshToken # Needed in CustomTokenObtainPairSerializer

from .models import User # Assuming your custom User model is here

# --- User Data Serializer ---
# This serializer is used to represent the User model in API responses
# It MUST include 'role' in its fields for the frontend to receive it
class UserSerializer(serializers.ModelSerializer):
    # 'full_name' as a read-only field. Requires a 'full_name' @property on your User model.
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'full_name', 'phone', 'role', # <-- 'role' is consistently included here
            'business_name', 'location', 'is_verified',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'username'] # username is often read-only after creation

# --- User Registration Serializer ---
class UserRegistrationSerializer(serializers.ModelSerializer):
    # min_length must match AUTH_PASSWORD_VALIDATORS' MinimumLengthValidator
    # (settings.py, default 8) so this fails with one clear message instead
    # of passing here only to be rejected by validate_password() below.
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'email', 'password', 'confirm_password', 'first_name',
            'last_name', 'phone', 'role', 'business_name', 'location'
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        if value:
            digits_only = ''.join(filter(str.isdigit, value))
            if len(digits_only) != 10:
                raise serializers.ValidationError("Phone number must be 10 digits.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate_role(self, value):
        if value not in ('user', 'owner'):
            raise serializers.ValidationError("Invalid role. Must be 'user' or 'owner'.")
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError("Passwords do not match.")

        # Validate business name for owners
        if attrs.get('role') == 'owner' and not attrs.get('business_name'):
            raise serializers.ValidationError("Business name is required for facility owners.")

        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')

        # Create username from email (as per your models.py setup where username is required)
        validated_data['username'] = validated_data['email']

        user = User.objects.create_user(**validated_data)
        return user


# --- Custom Simple JWT Token Obtain Pair Serializer ---
# THIS IS THE PRIMARY SERIALIZER FOR LOGIN WITH JWTs.
# It's designed to accept 'email' and 'password' and return 'user' data including 'role'.
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer): # <--- Confirmed Name
    email = serializers.EmailField(write_only=True) # Explicitly define email field
    password = serializers.CharField(write_only=True)

    # Remove the default 'username' field from the serializer's expected fields
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('username', None) # Remove the default username field

    def validate(self, attrs):
        email = attrs.get('email') # Get email from the explicitly defined 'email' field
        password = attrs.get('password')

        if not email or not password:
            raise serializers.ValidationError("Must include email and password.")

        # Authenticate using email as the username
        # This assumes your User model is configured to authenticate by email (USERNAME_FIELD = 'email')
        user = authenticate(username=email, password=password)

        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("User account is disabled.")

        refresh = self.get_token(user)

        # This is the response format for a successful login
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data # Include full user data, including 'role'
        }

# --- Password Change Serializer ---
class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_new_password']:
            raise serializers.ValidationError("New passwords do not match.")
        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user

# --- User Update Serializer ---
class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'business_name', 'location'
        ]

    def validate_phone(self, value):
        if value:
            digits_only = ''.join(filter(str.isdigit, value))
            if len(digits_only) != 10:
                raise serializers.ValidationError("Phone number must be 10 digits.")
        return value