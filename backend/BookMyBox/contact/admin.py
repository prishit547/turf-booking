# contact/admin.py
from django.contrib import admin

from .models import ContactSubmission


@admin.register(ContactSubmission)
class ContactSubmissionAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'subject', 'inquiry_type', 'created_at']
    list_filter = ['inquiry_type', 'created_at']
    search_fields = ['name', 'email', 'subject', 'message']
    ordering = ['-created_at']
    readonly_fields = ['name', 'email', 'phone', 'subject', 'message', 'inquiry_type', 'created_at']

    def has_add_permission(self, request):
        # These are only ever created by the public contact form.
        return False
