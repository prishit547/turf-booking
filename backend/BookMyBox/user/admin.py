# user/admin.py

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import OwnerPayoutDetails, OwnerVerification, User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # Fields to display in the admin list view
    list_display = ['email', 'username', 'first_name', 'last_name', 'role', 'is_verified', 'is_active', 'created_at']
    list_filter = ['role', 'is_verified', 'is_active', 'created_at']
    search_fields = ['email', 'username', 'first_name', 'last_name', 'phone']
    ordering = ['-created_at']
    
    # Fields to display in the admin form
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email', 'phone')}),
        ('Role & Business', {'fields': ('role', 'business_name', 'location')}),
        ('Permissions', {'fields': ('is_active', 'is_verified', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    
    # Fields to display when adding a new user
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'first_name', 'last_name', 'password1', 'password2', 'role'),
        }),
    )
    
    # Make email field required
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if not obj:  # Adding new user
            form.base_fields['email'].required = True
        return form
    
    # Custom actions
    actions = ['verify_users', 'unverify_users', 'activate_users', 'deactivate_users']
    
    def verify_users(self, request, queryset):
        updated = queryset.update(is_verified=True)
        self.message_user(request, f'{updated} users were successfully verified.')
    verify_users.short_description = "Mark selected users as verified"
    
    def unverify_users(self, request, queryset):
        updated = queryset.update(is_verified=False)
        self.message_user(request, f'{updated} users were successfully unverified.')
    unverify_users.short_description = "Mark selected users as unverified"
    
    def activate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} users were successfully activated.')
    activate_users.short_description = "Activate selected users"
    
    def deactivate_users(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} users were successfully deactivated.')
    deactivate_users.short_description = "Deactivate selected users"


@admin.register(OwnerVerification)
class OwnerVerificationAdmin(admin.ModelAdmin):
    """Read-mostly visibility into the OwnerVerification queue from this
    Jazzmin panel — the real day-to-day review workflow is the in-app
    admin dashboard's Verifications tab (see user/views.py's
    AdminOwnerVerificationViewSet), not this panel."""
    list_display = ['user', 'verification_status', 'pan_number', 'gst_number', 'submitted_at', 'reviewed_at', 'reviewed_by']
    list_filter = ['verification_status']
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'pan_number', 'gst_number']
    readonly_fields = ['submitted_at', 'reviewed_at', 'created_at', 'updated_at']


@admin.register(OwnerPayoutDetails)
class OwnerPayoutDetailsAdmin(admin.ModelAdmin):
    """Read-mostly visibility into where an owner's payouts should go — the
    day-to-day usage is the admin dashboard's Record Payout modal (see
    owner_dashboard/views.py's PayoutViewSet), not this panel."""
    list_display = ['owner', 'account_holder_name', 'bank_account_number', 'ifsc_code', 'upi_id', 'updated_at']
    search_fields = ['owner__email', 'owner__first_name', 'owner__last_name', 'account_holder_name', 'upi_id']
    readonly_fields = ['updated_at']