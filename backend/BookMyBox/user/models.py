# user/models.py
import secrets

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

class User(AbstractUser):
    ROLE_CHOICES = [
        ('user', 'Sports Player'),
        ('owner', 'Facility Owner'),
        ('admin', 'Platform Admin'),
    ]
    
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=10, blank=True, null=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    business_name = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    google_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']
    
    def __str__(self):
        return self.email
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
    
    def get_role_display_name(self):
        return dict(self.ROLE_CHOICES).get(self.role, self.role)
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'


class Notification(models.Model):
    """A single in-app notification for one user. Deliberately simple —
    no delivery channel/priority/type taxonomy, just enough to power a
    bell dropdown. See user/notifications.py's notify() for the only way
    these should be created."""
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=255, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Notification for {self.user.email}: {self.title}"


def _generate_token():
    return secrets.token_urlsafe(32)


class OwnerVerification(models.Model):
    """One-to-one identity/business verification record for a facility
    owner. Deliberately its own model rather than fields bolted onto User —
    these fields are owner-specific and most users (players) never touch
    them. Mirrors boxes.Box's submit -> pending -> admin review
    (approve/reject-with-reason) pattern for consistency with how this app
    already does review workflows.

    Approving here (see user/views.py's AdminOwnerVerificationViewSet) is
    the only place post-signup that flips User.is_verified True — it is a
    deliberate soft signal, not a hard gate: box approval does NOT require
    owner.is_verified, since that would retroactively break every owner who
    predates this flow. Google OAuth sets is_verified True independently at
    account-creation time (see google_auth.py) and is untouched by this
    model."""
    STATUS_CHOICES = [
        ('not_submitted', 'Not submitted'),
        ('pending', 'Pending review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    user = models.OneToOneField('User', on_delete=models.CASCADE, related_name='owner_verification')
    pan_number = models.CharField(max_length=20, blank=True, default='')
    gst_number = models.CharField(max_length=20, blank=True, default='')
    verification_document = models.FileField(upload_to='owner_verification_docs/', blank=True, null=True)
    verification_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_submitted')
    rejection_reason = models.TextField(blank=True, default='')
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='owner_verifications_reviewed',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'owner_verifications'

    def __str__(self):
        return f"Verification for {self.user.email}: {self.verification_status}"


class OwnerPayoutDetails(models.Model):
    """One-to-one record of WHERE to send an owner's payouts (bank account
    or UPI) — deliberately separate from owner_dashboard.Payout, which only
    records that a payout already happened (payment_method/transaction_id
    describe a completed transfer after the fact). This model is the
    destination info an admin needs *before* recording one. Mirrors
    OwnerVerification's structure/conventions above: its own model rather
    than fields bolted onto User, get_or_create'd lazily on first access.

    Deliberately never a gate on anything — an owner can list boxes, take
    bookings, and use their whole dashboard with this left empty. All
    fields are optional; see OwnerPayoutDetailsSerializer for the only
    validation applied (bank_account_number and ifsc_code must be filled
    together, or both left blank — upi_id is independent of that pair)."""
    owner = models.OneToOneField('User', on_delete=models.CASCADE, related_name='payout_details')
    account_holder_name = models.CharField(max_length=150, blank=True)
    bank_account_number = models.CharField(max_length=34, blank=True)
    ifsc_code = models.CharField(max_length=11, blank=True)
    upi_id = models.CharField(max_length=100, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'owner_payout_details'

    def __str__(self):
        return f"Payout details for {self.owner.email}"


class PasswordResetToken(models.Model):
    """A one-time, expiring link sent to a user's email to let them set a
    new password without knowing the old one. Deliberately an explicit
    stored row (not Django's built-in PasswordResetTokenGenerator, which
    computes rather than stores) so a token can be invalidated early and
    reused-detection is a simple `used_at is not None` check — same pattern
    as this app's other short-lived tokens (bookings.WaitlistEntry, etc.)."""
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.CharField(max_length=64, unique=True, default=_generate_token)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        return self.used_at is None and timezone.now() < self.expires_at

    def __str__(self):
        return f"Password reset token for {self.user.email}"


class AdminActionLog(models.Model):
    """Queryable audit trail for admin actions with real consequences (user
    edit/create/delete, box approve/reject, payout record) — a console
    logger.info() line (still emitted alongside this, unchanged) can't
    answer "who deleted this user and when" after the fact once the server
    logs have rotated away, especially given the hard-delete added
    elsewhere cascades real financial/booking data. See user/audit.py's
    log_admin_action(), the only place that should create these.

    actor is SET_NULL (not CASCADE) so deleting the admin who performed an
    action doesn't erase the historical record of that action — target_repr
    exists for the exact same reason on the target side, since the target
    itself may be hard-deleted (e.g. 'user.delete') or otherwise mutated
    after the fact."""
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='admin_actions',
    )
    action = models.CharField(max_length=100)  # e.g. 'user.delete', 'box.approve', 'payout.record'
    target_type = models.CharField(max_length=50, blank=True)  # e.g. 'User', 'Box', 'Payout'
    target_id = models.CharField(max_length=50, blank=True)
    target_repr = models.CharField(max_length=255, blank=True)  # human-readable snapshot, survives target deletion
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} by {self.actor_id} on {self.target_type}:{self.target_id}"
