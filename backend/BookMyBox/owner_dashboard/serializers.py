# owner_dashboard/serializers.py
from rest_framework import serializers
from bookings.models import Booking
from boxes.models import Box
from boxes.serializers import BoxSerializer # We can reuse the BoxSerializer for listing boxes
from .models import Payout, PayoutSchedule


class PayoutSerializer(serializers.ModelSerializer):
    owner_email = serializers.CharField(source='owner.email', read_only=True)

    class Meta:
        model = Payout
        fields = ['id', 'owner', 'owner_email', 'amount', 'note', 'source', 'payment_method', 'transaction_id', 'created_at']
        read_only_fields = ['owner_email', 'source', 'created_at']
        extra_kwargs = {'owner': {'write_only': True, 'required': True}}

    def validate_amount(self, value):
        # A Payout row directly feeds balance_due (net_revenue - total_paid,
        # see PayoutViewSet._balance_for_owner) — a negative amount here
        # doesn't record money going *out* to the owner, it inflates what
        # the platform appears to still owe them.
        if value <= 0:
            raise serializers.ValidationError("Payout amount must be greater than 0.")
        return value


class PayoutScheduleSerializer(serializers.ModelSerializer):
    owner_email = serializers.CharField(source='owner.email', read_only=True)

    class Meta:
        model = PayoutSchedule
        fields = ['id', 'owner', 'owner_email', 'frequency', 'day_of_week', 'day_of_month', 'active', 'last_run_at', 'created_at']
        read_only_fields = ['owner_email', 'last_run_at', 'created_at']

    def validate_day_of_month(self, value):
        # owner_dashboard/tasks.py::is_due_today silently clamps anything
        # above 28 down to the 28th (min(day, 28), since not every month has
        # a 30th/31st) — without this check, an admin configuring "day 30"
        # gets a schedule that looks like it's set to run on the 30th but
        # actually always fires on the 28th, with no indication anywhere.
        if value is not None and not (1 <= value <= 28):
            raise serializers.ValidationError("Must be between 1 and 28 (not every month has a 29th-31st).")
        return value

    def validate_day_of_week(self, value):
        # Same silent-misconfiguration risk as day_of_month: is_due_today
        # compares against date.weekday(), which is always 0-6, so a
        # day_of_week outside that range would just never match — the
        # schedule would silently never run, with nothing surfacing why.
        if value is not None and not (0 <= value <= 6):
            raise serializers.ValidationError("Must be between 0 (Monday) and 6 (Sunday).")
        return value

class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = '__all__'

class RecentBookingSerializer(serializers.Serializer):
    """
    Serializer for formatted recent booking data.
    """
    id = serializers.IntegerField()
    user_name = serializers.CharField()
    box_name = serializers.CharField()
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    status = serializers.CharField()
    time_slot = serializers.CharField()

class OwnerDashboardStatsSerializer(serializers.Serializer):
    """
    Defines the shape of the data for the main dashboard overview.
    """
    # Key Metrics
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_bookings = serializers.IntegerField()
    active_boxes_count = serializers.IntegerField()
    pending_boxes_count = serializers.IntegerField()
    rejected_boxes_count = serializers.IntegerField()
    avg_rating = serializers.DecimalField(max_digits=3, decimal_places=1, default=0.0)

    # Chart Data
    sports_distribution = serializers.DictField(child=serializers.IntegerField())
    revenue_chart_labels = serializers.ListField(child=serializers.CharField())
    revenue_chart_data = serializers.ListField(child=serializers.DecimalField(max_digits=10, decimal_places=2))
    bookings_chart_labels = serializers.ListField(child=serializers.CharField())
    bookings_chart_data = serializers.ListField(child=serializers.IntegerField())
    
    # Recent Activity Lists
    recent_bookings = RecentBookingSerializer(many=True)
    all_owner_boxes = BoxSerializer(many=True) # A list of all boxes owned by the user