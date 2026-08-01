# profiles/admin.py
from django.contrib import admin
from .models import UserProfile

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'date_of_birth',
        'emergency_contact',
        'get_preferred_sports_count',
        'created_at',
        'updated_at'
    ]
    
    list_filter = [
        'created_at',
        'updated_at',
        'date_of_birth',
    ]
    
    search_fields = [
        'user__email', 
        'user__first_name',
        'user__last_name',
        'bio',
        'address',
        'emergency_contact'
    ]
    
    # --- MODIFIED: Changed from a list [] to a tuple () to prevent the TypeError ---
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('User Association', {
            'fields': ('user',)
        }),
        ('Personal Information', {
            'fields': ('date_of_birth', 'bio', 'address', 'emergency_contact')
        }),
        ('Sports Preferences', {
            'fields': ('preferred_sports',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # This custom method is correct as is.
    def get_preferred_sports_count(self, obj):
        if obj.preferred_sports and isinstance(obj.preferred_sports, list):
            return len(obj.preferred_sports)
        return 0
    get_preferred_sports_count.short_description = 'Sports Count'

    # This method will now work correctly because readonly_fields is a tuple.
    def get_readonly_fields(self, request, obj=None):
        """
        Makes the 'user' field read-only when editing an existing profile,
        but allows it to be set when creating a new one.
        """
        if obj:
            # Now correctly adds a tuple to a tuple.
            return self.readonly_fields + ('user',)
        return self.readonly_fields