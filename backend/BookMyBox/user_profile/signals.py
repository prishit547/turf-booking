# profiles/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import UserProfile
from django.conf import settings

User = get_user_model()

# Comment out these two redundant signals:
# @receiver(post_save, sender=settings.AUTH_USER_MODEL)
# def create_user_profile(sender, instance, created, **kwargs):
#     """Create UserProfile when User is created"""
#     if created:
#         UserProfile.objects.create(user=instance)

# @receiver(post_save, sender=settings.AUTH_USER_MODEL)
# def save_user_profile(sender, instance, **kwargs):
#     """Ensure UserProfile exists and save it when User is saved"""
#     # Get or create profile if it doesn't exist
#     profile, created = UserProfile.objects.get_or_create(user=instance)
    
#     # Save the profile (this handles any updates)
#     if not created:  # Only save if it wasn't just created
#         profile.save()

# Use this single, consolidated signal instead:
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def manage_user_profile(sender, instance, created, **kwargs):
    """
    Create or update UserProfile when User is created/updated.
    This signal ensures a UserProfile always exists for a User.
    """
    if created:
        # Create profile for new users
        UserProfile.objects.create(user=instance)
    else:
        # For existing users, ensure the profile exists.
        # get_or_create is robust: it fetches if exists, creates if not.
        profile, profile_created = UserProfile.objects.get_or_create(user=instance)
        
        # If the profile was not just created by this call (meaning it already existed),
        # and you have logic that might modify profile fields based on user changes,
        # then explicitly saving the profile here would trigger its own save() methods.
        # However, for simply ensuring existence or if profile fields are only updated
        # directly on the profile model, this explicit profile.save() might not be strictly necessary
        # unless you have pre_save/post_save signals on UserProfile itself.
        # For a clean separation, if profile fields are only in UserProfile,
        # and not derived directly from User fields, then no explicit save here is needed.
        # If you were pushing User fields *into* UserProfile in this signal, then save() would be important.
        # Given our current separation where UserProfile has *separate* fields, this `if not profile_created:` block
        # is primarily for ensuring existence and not for propagating changes from User to Profile.
        if not profile_created:
            # This 'save()' is mostly a placeholder if you needed to trigger profile-specific
            # logic or update profile fields from user changes within this signal.
            # Otherwise, for just ensuring existence, get_or_create is sufficient.
            pass