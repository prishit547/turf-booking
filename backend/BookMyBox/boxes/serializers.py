# boxes/serializers.py

import re

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers
from .models import Box, Review, BlockedDate, CommissionRate, PlatformCommissionSetting, PricingRule

_TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


class PlatformCommissionSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformCommissionSetting
        fields = ['default_rate', 'effective_from', 'updated_at', 'updated_by']
        read_only_fields = ['effective_from', 'updated_at', 'updated_by']


class BlockedDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockedDate
        fields = ['id', 'box', 'date', 'reason', 'created_at']
        read_only_fields = ['created_at']


class PricingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingRule
        fields = ['id', 'box', 'applies_to', 'start_time', 'end_time', 'price', 'label', 'created_at']
        read_only_fields = ['created_at']

    def validate(self, attrs):
        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start_time >= end_time:
            raise serializers.ValidationError("start_time must be before end_time.")

        box = attrs.get('box', getattr(self.instance, 'box', None))
        applies_to = attrs.get('applies_to', getattr(self.instance, 'applies_to', None))
        # A 'weekday'/'weekend' rule can collide with an 'all' rule (and
        # vice versa) since both cover the same days for resolution
        # purposes — cross-check against both to keep resolve_box_price()'s
        # lookup always unambiguous (at most one match).
        overlapping_applies_to = [applies_to, 'all'] if applies_to != 'all' else ['weekday', 'weekend', 'all']
        existing = PricingRule.objects.filter(box=box, applies_to__in=overlapping_applies_to)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        for rule in existing:
            if start_time < rule.end_time and rule.start_time < end_time:
                raise serializers.ValidationError(
                    f"This overlaps an existing rule ({rule.get_applies_to_display()} "
                    f"{rule.start_time}-{rule.end_time})."
                )
        return attrs

class CommissionRateSerializer(serializers.ModelSerializer):
    owner_email = serializers.CharField(source='owner.email', read_only=True)

    class Meta:
        model = CommissionRate
        fields = ['id', 'owner', 'owner_email', 'sport', 'rate', 'effective_from', 'created_at']
        read_only_fields = ['created_at']

    def validate_rate(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Commission rate must be between 0 and 100.")
        return value

    def validate_effective_from(self, value):
        # CommissionRate is append-only by design (see its docstring): a new
        # rate is a new row, never an edit-in-place, specifically so a rate
        # change never rewrites the commission owed on past bookings.
        # Backdating effective_from defeats that entirely — any booking on
        # or after the backdated date immediately resolves to the new rate,
        # including ones a payout was already computed and paid out against.
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "effective_from cannot be in the past — a new rate can only take effect from "
                "today onward, otherwise it silently rewrites commission already owed on past bookings."
            )
        return value


class ReviewSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source='user', read_only=True)
    images = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'user', 'user_id', 'rating', 'comment', 'date', 'owner_response', 'owner_response_at', 'images']
        read_only_fields = ['owner_response', 'owner_response_at']

    def get_images(self, obj):
        request = self.context.get('request')
        urls = []
        for path in (obj.images or []):
            if path.startswith('http://') or path.startswith('https://'):
                urls.append(path)
                continue
            media_path = path if path.startswith('/') else f"/media/{path}"
            urls.append(request.build_absolute_uri(media_path) if request else media_path)
        return urls


class ReviewOwnerResponseSerializer(serializers.ModelSerializer):
    """Single-purpose write serializer for an owner replying to a review on
    their own box — deliberately separate from ReviewSerializer so this is
    the only path that can ever write owner_response."""

    class Meta:
        model = Review
        fields = ['owner_response']

# --- NO CHANGES to the existing BoxSerializer for public view ---
class BoxSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField()
    reviews = ReviewSerializer(many=True, read_only=True)
    blocked_dates = serializers.SerializerMethodField()
    pricing_rules = PricingRuleSerializer(many=True, read_only=True)
    min_price = serializers.SerializerMethodField()
    # Just the numeric FK id, not owner details (name/email/phone stay
    # private) — lets BoxDetails.jsx detect "this is my own box" for a
    # logged-in owner (offer a link to their dashboard's walk-in booking
    # flow instead of the blocked customer flow) without a second request.
    owner_id = serializers.SerializerMethodField()

    class Meta:
        model = Box
        fields = [
            'id', 'name', 'sport', 'sports', 'location', 'price', 'rating',
            'capacity', 'opening_time', 'closing_time', 'image', 'images',
            'amenities', 'description', 'full_description', 'rules',
            'latitude', 'longitude', 'reviews', 'status', 'rejection_reason', 'blocked_dates',
            'pricing_rules', 'min_price', 'owner_id',
        ]
        read_only_fields = ['status', 'rejection_reason']

    def get_blocked_dates(self, obj):
        return [d.date.isoformat() for d in obj.blocked_dates.all()]

    def get_min_price(self, obj):
        """The lowest price this box could cost — box.price unless a
        PricingRule undercuts it. Powers listing cards' "from ₹X" display
        without a per-card extra request (pricing_rules is prefetched)."""
        rule_prices = [r.price for r in obj.pricing_rules.all()]
        return min([obj.price, *rule_prices]) if rule_prices else obj.price

    def get_owner_id(self, obj):
        return obj.owner_id

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
            'id', 'owner', 'name', 'sport', 'sports', 'location', 'price',
            'capacity', 'opening_time', 'closing_time', 'image', 'images',
            'amenities', 'description', 'full_description', 'rules',
            'latitude', 'longitude', 'status', 'rejection_reason'
        ]
        # 'owner' is read-only here — perform_create() below always sets it
        # from request.user; exposing it writable would let a PATCH reassign
        # a box to a different owner. Read-only access is what the admin
        # Commission tab needs (picking an owner's boxes to see their sports).
        read_only_fields = ['owner', 'status', 'rejection_reason']

    def validate_opening_time(self, value):
        if not _TIME_RE.match(value or ''):
            raise serializers.ValidationError("Must be a valid 24-hour time in HH:MM format.")
        return value

    def validate_closing_time(self, value):
        if not _TIME_RE.match(value or ''):
            raise serializers.ValidationError("Must be a valid 24-hour time in HH:MM format.")
        return value

    def validate(self, attrs):
        # Field-level validate_opening_time/validate_closing_time above have
        # already confirmed both are well-formed HH:MM by the time this
        # runs, so a plain string comparison correctly reflects time order.
        # Falls back to the existing instance's value on a partial update
        # (PATCH), same pattern as PricingRuleSerializer.validate() above.
        opening = attrs.get('opening_time', getattr(self.instance, 'opening_time', None))
        closing = attrs.get('closing_time', getattr(self.instance, 'closing_time', None))
        if opening and closing and closing <= opening:
            raise serializers.ValidationError("closing_time must be after opening_time.")
        return attrs

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
    # Surfaces the owner's identity/business verification state (see
    # user.OwnerVerification) next to a box in the approval queue, so an
    # admin reviewing a new listing can factor it into their decision.
    # Deliberately informational only — approving/rejecting a box never
    # checks this, since verification is a separate, optional, soft signal
    # (see OwnerVerification's docstring for why box approval doesn't
    # hard-gate on it).
    owner_verification_status = serializers.SerializerMethodField()

    class Meta(OwnerBoxSerializer.Meta):
        fields = OwnerBoxSerializer.Meta.fields + ['owner', 'submitted_at', 'owner_verification_status']

    def get_owner(self, obj):
        return obj.owner.email if obj.owner else None

    def get_owner_verification_status(self, obj):
        if not obj.owner:
            return 'not_submitted'
        try:
            return obj.owner.owner_verification.verification_status
        except ObjectDoesNotExist:
            return 'not_submitted'


class AdminReviewSerializer(serializers.ModelSerializer):
    """Flat row shape for the admin Reviews moderation tab."""
    box_name = serializers.CharField(source='box.name', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = Review
        fields = [
            'id', 'box_id', 'box_name', 'user_name', 'user_email',
            'rating', 'comment', 'date', 'owner_response', 'owner_response_at',
        ]

    def get_user_name(self, obj):
        return obj.user.full_name or obj.user.email if obj.user else None