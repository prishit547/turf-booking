# boxes/models.py

from decimal import Decimal
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.validators import MinValueValidator
from django.db import models
from django.conf import settings
from django.utils import timezone

# Owner uploads (often straight off a phone camera or a stock photo site) can
# arrive 5-10MB and several thousand px wide, but every box image on this
# site is only ever displayed as a card thumbnail or a detail hero at most a
# few hundred px tall — serving the original bloats the homepage/listings
# grid badly. Downscale + re-encode on save instead of storing as-is.
MAX_IMAGE_DIMENSION = 1600
IMAGE_QUALITY = 82


def _compress_uploaded_image(image_field):
    from PIL import Image

    img = Image.open(image_field)
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')
    img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.LANCZOS)

    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=IMAGE_QUALITY, optimize=True)
    buffer.seek(0)

    name = image_field.name.rsplit('.', 1)[0] + '.jpg'
    return ContentFile(buffer.read(), name=name)


class Box(models.Model):
    # --- ADDED FIELDS for Owner and Approval Workflow ---
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, # So boxes aren't deleted if an owner is
        null=True, 
        blank=True, 
        related_name='owned_boxes'
    )
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('changes_requested', 'Changes Requested'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="The approval status of the box."
    )
    rejection_reason = models.TextField(blank=True, null=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    # --- END OF ADDED FIELDS ---

    name = models.CharField(max_length=255)
    sport = models.CharField(max_length=100)
    sports = models.JSONField(default=list, blank=True)
    location = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.0)
    
    # --- THIS IS THE NEW FIELD THAT FIXES THE ERROR ---
    is_featured = models.BooleanField(default=False, help_text="Mark this box as featured to show it on the homepage.")
    # --- END OF NEW FIELD ---

    capacity = models.IntegerField(default=1, validators=[MinValueValidator(1)])

    opening_time = models.CharField(max_length=5, default='06:00', help_text="Daily opening time (HH:MM, 24-hour)")
    closing_time = models.CharField(max_length=5, default='23:00', help_text="Daily closing time (HH:MM, 24-hour)")

    image = models.ImageField(upload_to='box_images/', null=True, blank=True)
    images = models.JSONField(default=list, blank=True)
    amenities = models.JSONField(default=list, blank=True)
    description = models.TextField(blank=True)
    full_description = models.TextField(blank=True)
    rules = models.JSONField(default=list, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # None on a brand-new instance even if `image=` was passed to the
        # constructor, so the first save() below always treats a
        # constructor-provided image as new and compresses it.
        self._original_image_name = self.image.name if (self.pk and self.image) else None

    def save(self, *args, **kwargs):
        if self.image and self.image.name != self._original_image_name:
            try:
                self.image = _compress_uploaded_image(self.image)
            except Exception:
                pass  # unsupported/corrupt upload — store the original rather than block the save
        super().save(*args, **kwargs)
        self._original_image_name = self.image.name if self.image else None

    def __str__(self):
        return self.name

class Review(models.Model):
    box = models.ForeignKey(Box, related_name='reviews', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    date = models.DateField(auto_now_add=True)
    owner_response = models.TextField(blank=True, default='')
    owner_response_at = models.DateTimeField(null=True, blank=True)
    images = models.JSONField(default=list, blank=True, help_text="Relative storage paths of up to 4 review photos.")

    def __str__(self):
        return f"Review by {self.user.username} for {self.box.name}" 

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['box', 'user'], name='unique_review_per_user_box')
        ]
        
class BlockedDate(models.Model):
    """A whole day the owner has marked their box unavailable for (holiday,
    maintenance) without deleting the box itself. See
    bookings/services.py's validate_booking_request()/create_booking_row()
    for where this is enforced against new bookings."""
    box = models.ForeignKey(Box, related_name='blocked_dates', on_delete=models.CASCADE)
    date = models.DateField()
    reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']
        unique_together = ('box', 'date')

    def __str__(self):
        return f"{self.box.name} blocked on {self.date}"


class PricingRule(models.Model):
    """An owner-defined price override for a weekday/weekend/all-days time
    window (e.g. "weekend evenings cost more") — a flat replacement price,
    not a multiplier. Falls back to Box.price when no rule matches a given
    booking's start_time. See boxes/pricing.py's resolve_box_price() for
    resolution and boxes/serializers.py's PricingRuleSerializer for the
    non-overlap validation that keeps resolution unambiguous."""
    APPLIES_TO_CHOICES = [
        ('weekday', 'Weekdays (Mon-Fri)'),
        ('weekend', 'Weekends (Sat-Sun)'),
        ('all', 'Every day'),
    ]
    box = models.ForeignKey(Box, related_name='pricing_rules', on_delete=models.CASCADE)
    applies_to = models.CharField(max_length=10, choices=APPLIES_TO_CHOICES)
    start_time = models.CharField(max_length=5, help_text="HH:MM, 24-hour")
    end_time = models.CharField(max_length=5, help_text="HH:MM, 24-hour")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    label = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['applies_to', 'start_time']

    def __str__(self):
        return f"{self.box.name}: {self.get_applies_to_display()} {self.start_time}-{self.end_time} @ {self.price}"


class CommissionRate(models.Model):
    """Admin-set commission percentage the platform takes from a specific
    owner's bookings for a specific sport, overriding the platform-wide
    DEFAULT_COMMISSION_RATE (see boxes/pricing.py's resolve_commission_rate()).
    `sport` is a free-text match against Box.sport — no separate Sport model
    exists to FK to. A new rate is always a new row (never an edit-in-place),
    versioned by `effective_from`, so a rate change never silently rewrites
    the commission owed on bookings from before the change — same philosophy
    as PricingRule above."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='commission_rates')
    sport = models.CharField(max_length=100)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percent, 0-100.")
    effective_from = models.DateField(default=timezone.localdate)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='commission_rates_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # `-id` tiebreaks rows that share the same effective_from (e.g. two
        # edits on the same day, now that backdating is blocked) — without
        # it, "the latest rate" is ambiguous whenever dates tie, since SQL
        # doesn't guarantee any particular order among equal sort keys.
        ordering = ['-effective_from', '-id']

    def __str__(self):
        return f"{self.owner.email} / {self.sport}: {self.rate}% from {self.effective_from}"


class PlatformCommissionSetting(models.Model):
    """The platform-wide default commission percent, editable by admins —
    see boxes/pricing.py::resolve_commission_rate(). Falls back to
    settings.DEFAULT_COMMISSION_RATE if no row exists yet, same pattern as
    rewards.ScratchCardAutoGrantSetting.

    Append-only and versioned by `effective_from`, same design as
    CommissionRate above and for the identical reason: a new default rate is
    always a new row (AdminPlatformCommissionView.patch() never mutates an
    existing one), so changing it never silently rewrites the commission
    already resolved for a past booking. Used to be a true singleton
    (mutate-in-place, pk=1) — that meant every booking, past or present,
    resolved to whatever the *current* default happened to be at read time,
    the exact bug CommissionRate's own versioning was designed to avoid."""
    default_rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percent, 0-100.")
    effective_from = models.DateField(default=timezone.localdate)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        # `-id` tiebreaks rows that share the same effective_from (e.g. two
        # edits the same day) — see the identical reasoning on CommissionRate.
        ordering = ['-effective_from', '-id']

    def __str__(self):
        return f"Platform default commission: {self.default_rate}% from {self.effective_from}"

    @classmethod
    def get_rate_fraction(cls, on_date=None):
        row = cls.objects.filter(effective_from__lte=on_date or timezone.localdate()).order_by('-effective_from', '-id').first()
        if row:
            return row.default_rate / Decimal('100')
        return Decimal(str(settings.DEFAULT_COMMISSION_RATE))


class UserFavoriteBox(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favorite_boxes')
    box = models.ForeignKey(Box, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'box')

    def __str__(self):
        return f"{self.user.email} - {self.box.name} (Favorite)"