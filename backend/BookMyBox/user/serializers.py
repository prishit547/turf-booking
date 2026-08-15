# user/serializers.py

from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer # Needed for CustomTokenObtainPairSerializer inheritance
from rest_framework_simplejwt.tokens import RefreshToken # Needed in CustomTokenObtainPairSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import AdminActionLog, Notification, OwnerPayoutDetails, OwnerVerification, PasswordResetToken, User # Assuming your custom User model is here


class OwnerVerificationSerializer(serializers.ModelSerializer):
    """Backs both the owner's own GET/POST (my-verification) and the admin
    review queue — same dual-purpose shape AdminBoxSerializer/OwnerBoxSerializer
    use for boxes, just collapsed into one serializer here since there's no
    public-facing view to keep separate. pan_number/gst_number/
    verification_document are writable (the owner's submission uses this
    serializer directly); verification_status/rejection_reason/submitted_at/
    reviewed_at/reviewed_by are admin/system-only and read-only here — only
    the admin approve/reject views (user/views.py) ever set them."""
    owner_email = serializers.CharField(source='user.email', read_only=True)
    owner_name = serializers.SerializerMethodField()
    reviewed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = OwnerVerification
        fields = [
            'id', 'owner_email', 'owner_name', 'pan_number', 'gst_number',
            'verification_document', 'verification_status', 'rejection_reason',
            'submitted_at', 'reviewed_at', 'reviewed_by_email',
        ]
        read_only_fields = [
            'id', 'owner_email', 'owner_name', 'verification_status',
            'rejection_reason', 'submitted_at', 'reviewed_at', 'reviewed_by_email',
        ]

    def get_owner_name(self, obj):
        return obj.user.full_name or obj.user.email

    def get_reviewed_by_email(self, obj):
        return obj.reviewed_by.email if obj.reviewed_by else None


class OwnerPayoutDetailsSerializer(serializers.ModelSerializer):
    """Backs the owner's own GET/PUT/PATCH (my-payout-details) and, read-only,
    the admin-facing view embedded in the Record Payout data (see
    owner_dashboard/views.py's PayoutViewSet._balance_for_owner). All fields
    are optional — see OwnerPayoutDetails' docstring for why this must never
    become a gate. The only validation is internal consistency: if either of
    bank_account_number/ifsc_code is provided, both must be (upi_id is
    independent and may be filled/left blank regardless)."""
    class Meta:
        model = OwnerPayoutDetails
        fields = [
            'account_holder_name', 'bank_account_number', 'ifsc_code', 'upi_id', 'updated_at',
        ]
        read_only_fields = ['updated_at']

    def validate(self, attrs):
        def _current(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, '') if self.instance else ''

        bank_account_number = _current('bank_account_number')
        ifsc_code = _current('ifsc_code')
        if bool(bank_account_number) != bool(ifsc_code):
            raise serializers.ValidationError(
                'Provide both a bank account number and an IFSC code together, or leave both blank.'
            )
        return attrs


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'link', 'is_read', 'created_at']
        read_only_fields = fields

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
            'business_name', 'location', 'is_verified', 'is_active', 'date_joined',
            'created_at', 'updated_at'
        ]
        # role/is_verified/is_active are display-only on this serializer —
        # mutating them goes through AdminUserUpdateSerializer instead, so a
        # PATCH through this serializer (e.g. a user editing their own
        # profile) can never silently reassign a role or reactivate/suspend
        # an account.
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'username',
            'role', 'is_verified', 'is_active', 'date_joined',
        ]


# --- Admin-only user mutation serializer ---
class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Backs the admin-only user-edit modal — role/suspend plus the core
    User fields and a handful of UserProfile fields (via DRF's dotted
    `source='profile.X'` pattern), all writable from one PATCH. Deliberately
    separate from UserSerializer so these fields (especially role/is_active)
    can never be reached through a regular self-profile-update request."""

    address = serializers.CharField(source='profile.address', required=False, allow_blank=True)
    date_of_birth = serializers.DateField(source='profile.date_of_birth', required=False, allow_null=True)
    bio = serializers.CharField(source='profile.bio', required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'role', 'is_active', 'first_name', 'last_name', 'email', 'phone',
            'business_name', 'location', 'address', 'date_of_birth', 'bio',
        ]

    def validate_role(self, value):
        if value not in ('user', 'owner', 'admin'):
            raise serializers.ValidationError("Role must be one of: user, owner, admin.")
        return value

    def update(self, instance, validated_data):
        # 'profile' isn't a real User field — it's where DRF's dotted
        # source='profile.X' fields land in validated_data. Pop it before
        # calling super().update(), or setattr(instance, 'profile', {...})
        # would clobber the actual OneToOne reverse-relation descriptor.
        profile_data = validated_data.pop('profile', {})
        instance = super().update(instance, validated_data)
        if profile_data:
            from user_profile.models import UserProfile
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            for k, v in profile_data.items():
                setattr(profile, k, v)
            profile.save()
        return instance


# --- Admin-only user creation serializer ---
class AdminCreateUserSerializer(serializers.ModelSerializer):
    """Admin-only user creation — distinct from UserRegistrationSerializer
    (public signup) in two ways: `role` may be 'admin' here, and `password`
    is optional (if left blank, AdminCreateUserView emails the new user a
    password-setup link via the same PasswordResetToken/send_email_task
    flow request_password_reset uses, so an admin never sees/relays a
    plaintext password)."""

    password = serializers.CharField(required=False, allow_blank=True, min_length=8, write_only=True)
    # phone is blank=True/null=True on the model (so plain ModelSerializer
    # inference would make it optional) — explicitly overridden here since
    # a phone number is required for every account an admin creates,
    # customer or owner alike, for the same reason it's required at public
    # self-signup (see UserRegistrationSerializer below).
    phone = serializers.CharField(required=True, allow_blank=False, error_messages={
        'blank': 'Phone number is required.',
        'required': 'Phone number is required.',
    })

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'role', 'business_name', 'location', 'password']

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        digits_only = ''.join(filter(str.isdigit, value))
        if len(digits_only) != 10:
            raise serializers.ValidationError("Phone number must be 10 digits.")
        return value

    def validate_password(self, value):
        if value:
            try:
                validate_password(value)
            except ValidationError as e:
                raise serializers.ValidationError(e.messages)
        return value

    def validate_role(self, value):
        if value not in ('user', 'owner', 'admin'):
            raise serializers.ValidationError("Role must be one of: user, owner, admin.")
        return value

    def validate(self, attrs):
        # Facility owners created by an admin need their identifying/contact
        # info captured properly up front — name, phone (checked above),
        # business name, and location — so the account is actually usable
        # (payouts, support, box listings) rather than a half-filled shell.
        # Customer ('user') accounts stay looser: only phone is required,
        # matching self-signup.
        if attrs.get('role') == 'owner':
            required = ('first_name', 'last_name', 'business_name', 'location')
            errors = {f: 'This field is required for facility owners.' for f in required if not attrs.get(f)}
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

# --- User Registration Serializer ---
class UserRegistrationSerializer(serializers.ModelSerializer):
    # min_length must match AUTH_PASSWORD_VALIDATORS' MinimumLengthValidator
    # (settings.py, default 8) so this fails with one clear message instead
    # of passing here only to be rejected by validate_password() below.
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    # phone is blank=True/null=True on the model (so plain ModelSerializer
    # inference would make it optional) — explicitly overridden here since a
    # reachable phone number is required for every self-signup, customer or
    # owner alike.
    phone = serializers.CharField(required=True, allow_blank=False, error_messages={
        'blank': 'Phone number is required.',
        'required': 'Phone number is required.',
    })

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

        # Someone self-signing up as a facility owner needs the same
        # identifying info an admin would be required to collect when
        # creating an owner account (see AdminCreateUserSerializer.validate)
        # — business name and location — so their account is actually usable
        # from the start rather than a half-filled shell.
        if attrs.get('role') == 'owner':
            required = ('business_name', 'location')
            errors = {f: 'This field is required for facility owners.' for f in required if not attrs.get(f)}
            if errors:
                raise serializers.ValidationError(errors)

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

def _blacklist_all_outstanding_tokens(user):
    """'Log out everywhere' — the standard simplejwt token_blacklist pattern
    (BLACKLIST_AFTER_ROTATION is already on in settings.py, which is what
    populates OutstandingToken as refresh tokens get issued/rotated). Used
    by both PasswordChangeSerializer and PasswordResetConfirmSerializer
    below: a password change/reset must kill every existing session, not
    just the one that made this request — deliberately no attempt is made
    to keep the current session's tokens alive, so the user has to log in
    again with the new password."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


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
        _blacklist_all_outstanding_tokens(user)
        return user

class UserSearchResultSerializer(serializers.ModelSerializer):
    """Minimal shape for the "invite someone" search-as-you-type — no
    phone/location/role, just enough to identify and display a match."""
    name = serializers.CharField(source='full_name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'name', 'email']


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=6)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate_token(self, value):
        try:
            reset_token = PasswordResetToken.objects.select_related('user').get(token=value)
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError("This reset link is invalid.")
        if not reset_token.is_valid():
            raise serializers.ValidationError("This reset link has expired or was already used.")
        self.context['reset_token'] = reset_token
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
        reset_token = self.context['reset_token']
        user = reset_token.user
        user.set_password(self.validated_data['new_password'])
        user.save()
        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=['used_at'])
        _blacklist_all_outstanding_tokens(user)
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


# --- Admin action audit log (read-only) ---
class AdminActionLogSerializer(serializers.ModelSerializer):
    """Backs GET /user/admin/action-log/ — the admin-only Activity Log tab.
    actor_email is denormalized here (rather than nesting a UserSerializer)
    since the log only ever needs to display who did it, not their full
    profile; it's also None-safe for a SET_NULL'd actor (an admin account
    that's since been deleted)."""
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = AdminActionLog
        fields = [
            'id', 'actor', 'actor_email', 'action',
            'target_type', 'target_id', 'target_repr', 'details', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else None