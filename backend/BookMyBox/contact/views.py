# contact/views.py
from django.conf import settings
from django.utils.html import escape
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from BookMyBox.tasks import send_email_task

from .serializers import ContactSubmissionSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def submit_contact(request):
    """Public contact-form endpoint (Contact.jsx). Persists the submission
    first (a durable record survives even if the email pipeline is down),
    then queues the notification email through the same send_email_task
    pattern request_password_reset (user/views.py) and the booking-invite
    email (bookings/views.py) use — .delay() returns immediately, so this
    view responds without waiting on Resend."""
    serializer = ContactSubmissionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    submission = serializer.save()

    html = (
        f"<p>New contact form submission from BoxNplay.</p>"
        f"<p><strong>Name:</strong> {escape(submission.name)}<br>"
        f"<strong>Email:</strong> {escape(submission.email)}<br>"
        f"<strong>Phone:</strong> {escape(submission.phone) or '—'}<br>"
        f"<strong>Inquiry type:</strong> {escape(submission.inquiry_type)}<br>"
        f"<strong>Subject:</strong> {escape(submission.subject)}</p>"
        f"<p>{escape(submission.message).replace(chr(10), '<br>')}</p>"
        f"<p>Reply directly to this email to respond to {escape(submission.name)} "
        f"— just make sure to send to {escape(submission.email)}, not this inbox.</p>"
    )
    send_email_task.delay(
        settings.SUPPORT_EMAIL,
        f"[Contact] {submission.subject}",
        html,
    )

    return Response({
        'success': True,
        'message': "Message sent successfully! We'll get back to you soon.",
    }, status=status.HTTP_201_CREATED)
