# contact/serializers.py
from rest_framework import serializers

from .models import ContactSubmission


class ContactSubmissionSerializer(serializers.ModelSerializer):
    """Plain ModelSerializer — the model fields already encode the
    validation this endpoint needs (name/subject/message are required,
    non-blank CharField/TextFields; email is a proper EmailField), the
    same convention PasswordResetRequestSerializer (user/serializers.py)
    relies on rather than hand-rolling validators."""

    class Meta:
        model = ContactSubmission
        fields = ['name', 'email', 'phone', 'subject', 'message', 'inquiry_type']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Full name is required.")
        return value

    def validate_subject(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Subject is required.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message is required.")
        return value
