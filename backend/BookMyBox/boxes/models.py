# boxes/models.py

from django.db import models
from django.conf import settings
from django.utils import timezone

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
    ]
    status = models.CharField(
        max_length=10,
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
    price = models.DecimalField(max_digits=10, decimal_places=2)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.0)
    
    # --- THIS IS THE NEW FIELD THAT FIXES THE ERROR ---
    is_featured = models.BooleanField(default=False, help_text="Mark this box as featured to show it on the homepage.")
    # --- END OF NEW FIELD ---

    capacity = models.IntegerField(default=1)
    
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

    def __str__(self):
        return self.name

# --- NO CHANGES to Review or UserFavoriteBox models ---
class Review(models.Model):
    box = models.ForeignKey(Box, related_name='reviews', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    date = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"Review by {self.user.username} for {self.box.name}" 

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['box', 'user'], name='unique_review_per_user_box')
        ]
        
class UserFavoriteBox(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favorite_boxes')
    box = models.ForeignKey(Box, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'box')

    def __str__(self):
        return f"{self.user.email} - {self.box.name} (Favorite)"