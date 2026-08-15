# contact/models.py
"""Durable record of contact-form submissions (Contact.jsx). Kept alongside
the outbound email (BookMyBox.tasks.send_email_task, see contact/views.py)
rather than instead of it, so a submission still exists to review even if
Resend/Celery is down or misconfigured — the failure mode that motivated
this app in the first place (the old client-side EmailJS integration had
no server-side record at all)."""
from django.db import models


class ContactSubmission(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True, default='')
    subject = models.CharField(max_length=255)
    message = models.TextField()
    # Mirrors Contact.jsx's "Inquiry Type" select (general/booking/partnership/
    # technical/feedback) — stored as free text rather than a choices-enforced
    # field so the frontend's option list can change without a migration.
    inquiry_type = models.CharField(max_length=50, blank=True, default='general')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} <{self.email}> — {self.subject}"
