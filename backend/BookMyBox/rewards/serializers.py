# rewards/serializers.py
from rest_framework import serializers

from .models import (
    CashbackRule, RedeemCode, ScratchCard, ScratchCardConfig,
    SpinWheelSegment, WalletTransaction,
)


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ['id', 'amount', 'balance_after', 'type', 'description', 'booking', 'created_at']


class CashbackRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashbackRule
        fields = ['id', 'percent', 'max_cashback', 'min_booking_amount', 'active', 'created_at']
        read_only_fields = ['created_at']

    def create(self, validated_data):
        if validated_data.get('active', True):
            CashbackRule.objects.filter(active=True).update(active=False)
        return super().create(validated_data)


class ScratchCardConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScratchCardConfig
        fields = ['id', 'label', 'prize_amount', 'weight', 'active']


class ScratchCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScratchCard
        fields = ['id', 'prize_amount', 'is_scratched', 'scratched_at', 'expires_at', 'created_at']
        read_only_fields = fields


class SpinWheelSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpinWheelSegment
        fields = ['id', 'label', 'prize_amount', 'weight', 'color', 'order', 'active']


class RedeemCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RedeemCode
        fields = [
            'id', 'code', 'value', 'batch_label', 'is_used', 'used_by',
            'used_at', 'expires_at', 'created_at',
        ]
        read_only_fields = ['code', 'is_used', 'used_by', 'used_at', 'created_at']
