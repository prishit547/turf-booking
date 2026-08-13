# bookings/serializers.py

from rest_framework import serializers
from .models import Booking, BookingInvite, Coupon, WaitlistEntry
from boxes.pricing import resolve_commission_rate
from boxes.serializers import BoxSerializer

class BookingInviteSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingInvite
        fields = ['id', 'booking', 'invited_by_name', 'invited_user', 'invited_email', 'status', 'created_at', 'responded_at']
        read_only_fields = fields

    def get_invited_by_name(self, obj):
        return obj.invited_by.full_name or obj.invited_by.email


class BookingSerializer(serializers.ModelSerializer):
    # This will display the username from your CustomUser model
    user = serializers.StringRelatedField(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source='user', read_only=True)

    # Include full box details in the response
    box = BoxSerializer(read_only=True)

    # Keep these for backward compatibility
    box_name = serializers.CharField(source='box.name', read_only=True)
    box_location = serializers.CharField(source='box.location', read_only=True)
    box_sport = serializers.CharField(source='box.sport', read_only=True)
    box_image = serializers.SerializerMethodField() # For the small image on booking list
    invites = BookingInviteSerializer(many=True, read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'user', 'user_id', 'box', 'box_name', 'box_location', 'box_sport', 'box_image',
            'date', 'start_time', 'end_time', 'duration', 'total_amount',
            'payment_status', 'payment_id', 'booking_status', 'created_at',
            'cancellation_reason', 'cancelled_at', 'booking_source', 'customer_name', 'customer_phone',
            'recurring_group_id', 'coupon_code', 'discount_amount', 'wallet_amount_used', 'invites',
        ]
        read_only_fields = [
            'user', 'total_amount', 'payment_status', 'payment_id', 'booking_status', 'created_at',
            'cancellation_reason', 'cancelled_at', 'booking_source', 'customer_name', 'customer_phone',
            'recurring_group_id', 'coupon_code', 'discount_amount', 'wallet_amount_used', 'invites',
        ]

    def get_box_image(self, obj):
        request = self.context.get('request')
        if obj.box.image and request:
            return request.build_absolute_uri(obj.box.image.url)
        # Fallback: if no single 'image', try the first in the 'images' JSONField list
        if obj.box.images and len(obj.box.images) > 0 and request:
            # Assuming images in the JSONField are relative paths or full URLs
            return request.build_absolute_uri(obj.box.images[0])
        return None

    def to_internal_value(self, data):
        # For creation, we still accept box ID
        if 'boxId' in data:
            data['box'] = data.pop('boxId')
        return super().to_internal_value(data)


class AdminBookingSerializer(serializers.ModelSerializer):
    """Flat row shape for the admin Bookings table — no nested BoxSerializer
    (unlike BookingSerializer, which is built for the booking customer's own
    flows and needs the full box detail)."""
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)
    box_name = serializers.CharField(source='box.name', read_only=True)
    owner_email = serializers.SerializerMethodField()
    commission = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'user_name', 'user_email', 'box_id', 'box_name', 'owner_email',
            'date', 'start_time', 'end_time', 'total_amount', 'commission',
            'booking_status', 'payment_status', 'cancellation_reason', 'created_at',
            'booking_source', 'customer_name', 'customer_phone',
        ]

    def get_user_name(self, obj):
        return obj.user.full_name or obj.user.email if obj.user else None

    def get_owner_email(self, obj):
        return obj.box.owner.email if obj.box and obj.box.owner else None

    def get_commission(self, obj):
        if not obj.box:
            return 0
        rate = resolve_commission_rate(obj.box.owner, obj.box.sport, obj.date)
        return round(float(obj.total_amount or 0) * float(rate), 2)


class CouponSerializer(serializers.ModelSerializer):
    """Admin CRUD shape for the Coupons tab. `used_count` is read-only —
    it's only ever incremented by create_booking_row()'s locked increment,
    never set directly."""
    class Meta:
        model = Coupon
        fields = [
            'id', 'code', 'discount_type', 'value', 'active',
            'valid_from', 'valid_until', 'max_uses', 'used_count', 'created_at',
        ]
        read_only_fields = ['used_count', 'created_at']


class WaitlistEntrySerializer(serializers.ModelSerializer):
    box_name = serializers.CharField(source='box.name', read_only=True)

    class Meta:
        model = WaitlistEntry
        fields = ['id', 'box', 'box_name', 'date', 'start_time', 'duration', 'created_at']
        read_only_fields = ['created_at']


class OwnerBookingSerializer(serializers.ModelSerializer):
    """Bookings-on-my-boxes row shape for the owner Bookings tab."""
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)
    box_name = serializers.CharField(source='box.name', read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'user_name', 'user_email', 'box_id', 'box_name',
            'date', 'start_time', 'end_time', 'duration', 'total_amount',
            'booking_status', 'payment_status', 'cancellation_reason', 'cancelled_at', 'created_at',
            'booking_source', 'customer_name', 'customer_phone',
        ]

    def get_user_name(self, obj):
        return obj.user.full_name or obj.user.email if obj.user else None