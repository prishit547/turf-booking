# boxes/serializers.py

from rest_framework import serializers
from .models import Box, Review

# --- NO CHANGES to ReviewSerializer ---
class ReviewSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source='user', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'user', 'user_id', 'rating', 'comment', 'date']

# --- NO CHANGES to the existing BoxSerializer for public view ---
class BoxSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField()
    reviews = ReviewSerializer(many=True, read_only=True)

    class Meta:
        model = Box
        fields = [
            'id', 'name', 'sport', 'sports', 'location', 'price', 'rating',
            'capacity', 'opening_time', 'closing_time', 'image', 'images',
            'amenities', 'description', 'full_description', 'rules',
            'latitude', 'longitude', 'reviews'
        ]

    def get_images(self, obj):
        """Return a list of absolute media URLs for all box images."""
        request = self.context.get('request')
        media_prefix = '/media/'
        urls = []

        def make_url(path):
            if not path:
                return None
            if path.startswith('http://') or path.startswith('https://'):
                return path
            if not path.startswith('/'):
                path = f"{media_prefix}{path}"
            if request:
                return request.build_absolute_uri(path)
            return path

        if obj.image:
            urls.append(make_url(obj.image.url if hasattr(obj.image, 'url') else str(obj.image)))
        if obj.images:
            for img_path in obj.images:
                urls.append(make_url(img_path))
        return urls

# --- ADDED: A new serializer for owners to create/update their boxes ---
class OwnerBoxSerializer(serializers.ModelSerializer):
    """
    Serializer for owners to manage their own boxes.
    It exposes fields relevant to the owner's management tasks.
    Image uploads are handled by the view via request.FILES.
    """
    images = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
        required=False,
    )

    class Meta:
        model = Box
        fields = [
            'id', 'name', 'sport', 'sports', 'location', 'price',
            'capacity', 'opening_time', 'closing_time', 'image', 'images',
            'amenities', 'description', 'full_description', 'rules',
            'latitude', 'longitude', 'status', 'rejection_reason'
        ]
        read_only_fields = ['status', 'rejection_reason']

    def create(self, validated_data):
        # If 'sport' is missing, set it from the first item in 'sports' (for compatibility)
        if not validated_data.get('sport') and validated_data.get('sports'):
            sports_list = validated_data['sports']
            if isinstance(sports_list, list) and len(sports_list) > 0:
                validated_data['sport'] = sports_list[0]
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get('sport') and validated_data.get('sports'):
            sports_list = validated_data['sports']
            if isinstance(sports_list, list) and len(sports_list) > 0:
                validated_data['sport'] = sports_list[0]
        return super().update(instance, validated_data)


class AdminBoxSerializer(OwnerBoxSerializer):
    """
    Serializer for admin box-approval views. Adds the owner and submission
    timestamp fields the approval queue needs, which are intentionally left
    off OwnerBoxSerializer (not needed by owners) and BoxSerializer (never
    exposed to the public).
    """
    owner = serializers.SerializerMethodField()

    class Meta(OwnerBoxSerializer.Meta):
        fields = OwnerBoxSerializer.Meta.fields + ['owner', 'submitted_at']

    def get_owner(self, obj):
        return obj.owner.email if obj.owner else None