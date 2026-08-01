# user/google_auth.py

import secrets
import string

from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.exceptions import GoogleAuthError
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import UserSerializer

User = get_user_model()

GOOGLE_CLIENT_ID = getattr(settings, 'GOOGLE_CLIENT_ID', None)


class GoogleAuthSerializer(serializers.Serializer):
    """
    Handles Google OAuth authentication and user creation/login.
    Expects the frontend to send the raw Google ID token (credential).
    """
    credential = serializers.CharField(required=True, write_only=True)

    def validate(self, data):
        credential = data.get('credential')

        if not GOOGLE_CLIENT_ID:
            raise serializers.ValidationError(
                {'credential': 'Google OAuth is not configured on the server.'}
            )

        try:
            idinfo = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10,
            )
        except GoogleAuthError as e:
            raise serializers.ValidationError(
                {'credential': f'Invalid Google credential: {str(e)}'}
            )
        except ValueError as e:
            raise serializers.ValidationError(
                {'credential': f'Invalid Google credential: {str(e)}'}
            )

        # Verify the token was issued for our client
        if idinfo.get('aud') != GOOGLE_CLIENT_ID:
            raise serializers.ValidationError(
                {'credential': 'Invalid Google credential audience.'}
            )

        # Only allow Google-issued tokens
        if idinfo.get('iss') not in ('accounts.google.com', 'https://accounts.google.com'):
            raise serializers.ValidationError(
                {'credential': 'Invalid token issuer.'}
            )

        email = (idinfo.get('email') or '').lower()
        if not email or not idinfo.get('email_verified'):
            raise serializers.ValidationError(
                {'credential': 'A verified email is required for Google login.'}
            )

        self.google_payload = {
            'email': email,
            'first_name': idinfo.get('given_name', ''),
            'last_name': idinfo.get('family_name', ''),
            'google_id': idinfo.get('sub'),
            'profile_picture': idinfo.get('picture', ''),
        }
        return data

    def create_or_get_user(self):
        """
        Create user if doesn't exist, or return existing user.
        """
        validated_data = self.google_payload
        email = validated_data['email']
        google_id = validated_data['google_id']

        try:
            user = User.objects.get(email=email)
            # Link Google ID if it wasn't already set (safe idempotent linking)
            if user.google_id != google_id:
                user.google_id = google_id
                user.save(update_fields=['google_id'])
            is_new_user = False
        except User.DoesNotExist:
            random_password = ''.join(
                secrets.choice(string.ascii_letters + string.digits) for _ in range(32)
            )
            user = User.objects.create_user(
                email=email,
                username=email,
                first_name=validated_data['first_name'],
                last_name=validated_data['last_name'],
                password=random_password,
                is_verified=True,
                role='user',
                phone='',
                location='',
                google_id=google_id,
            )
            is_new_user = True

        return user, is_new_user

    def get_tokens(self, user):
        """Generate JWT tokens for the user"""
        refresh = RefreshToken.for_user(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }

    def to_representation(self, instance):
        user, is_new_user = self.create_or_get_user()
        tokens = self.get_tokens(user)

        return {
            'user': UserSerializer(user).data,
            'tokens': tokens,
            'is_new_user': is_new_user,
            'needs_onboarding': self.needs_onboarding(user),
        }

    def needs_onboarding(self, user):
        """
        Check if user needs to complete onboarding.
        """
        if not user.phone:
            return True
        if not user.location:
            return True
        if user.role == 'user':
            return True
        if user.role == 'owner' and not user.business_name:
            return True
        return False
