# bookings/email_services.py
"""Service for sending email notifications to turf and box owners when new
bookings are placed on their venues.

Emails are styled with BoxNplay's signature dark theme UI and dispatched
asynchronously via Celery (BookMyBox.tasks.send_email_task) and Resend.
"""

import logging
from django.conf import settings
from BookMyBox.tasks import send_email_task

logger = logging.getLogger(__name__)


def render_owner_booking_email_html(booking):
    """Render a responsive, BoxNplay-themed HTML email for the venue owner."""
    box = booking.box
    owner = box.owner if box else None
    owner_name = (
        (owner.first_name if owner and owner.first_name else '')
        or (owner.business_name if owner and owner.business_name else '')
        or (owner.email if owner else 'Venue Partner')
    )

    # Resolve customer details
    customer = booking.user
    customer_name = (
        booking.customer_name
        or (customer.full_name if customer and customer.full_name else '')
        or (customer.email if customer else 'Customer')
    )
    customer_phone = (
        booking.customer_phone
        or (customer.phone if customer and customer.phone else '')
        or 'Not provided'
    )
    customer_email = customer.email if customer else 'Not provided'

    # Format date & times
    date_str = str(booking.date)
    duration_label = f"{booking.duration} hr" if booking.duration == 1 else f"{booking.duration} hrs"
    time_slot = f"{booking.start_time} - {booking.end_time} ({duration_label})"

    # Payment display
    payment_status = booking.payment_status or 'Not Required'
    is_paid = payment_status == 'Completed'
    payment_badge_color = '#10b981' if is_paid else '#f59e0b'
    payment_badge_text = 'Paid' if is_paid else 'Pay at Venue'

    # Dashboard URL
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    dashboard_url = f"{frontend_url}/dashboard?tab=bookings"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking Confirmed - BoxNplay</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #151c2c; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; background: linear-gradient(135deg, #161f30 0%, #0e1626 100%); border-bottom: 1px solid #1e293b;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 22px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #ffffff;">
                      BOX<span style="color: #ccff00;">N</span>PLAY
                    </span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 20px; background-color: rgba(204, 255, 0, 0.15); color: #ccff00; border: 1px solid rgba(204, 255, 0, 0.3);">
                      New Booking
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Headline -->
          <tr>
            <td style="padding: 28px 32px 12px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #ffffff; line-height: 1.2;">
                Slot Booked! ⚡
              </h1>
              <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #94a3b8;">
                Hi <strong style="color: #f8fafc;">{owner_name}</strong>, a new booking has just been confirmed for <strong style="color: #ccff00;">{box.name if box else 'your venue'}</strong>.
              </p>
            </td>
          </tr>

          <!-- Booking Details Card -->
          <tr>
            <td style="padding: 12px 32px 20px 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 20px;">
                <tr>
                  <td style="padding-bottom: 12px; border-bottom: 1px solid #1e293b;">
                    <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Facility / Turf</span>
                    <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 2px;">{box.name if box else 'Sports Box'}</div>
                    <div style="font-size: 13px; color: #94a3b8;">{box.sport if box else 'General Sport'} • Booking #{booking.id}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #1e293b;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Date</span>
                          <div style="font-size: 14px; font-weight: 600; color: #f8fafc; margin-top: 2px;">{date_str}</div>
                        </td>
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Time Slot</span>
                          <div style="font-size: 14px; font-weight: 600; color: #ccff00; margin-top: 2px;">{time_slot}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 12px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Total Amount</span>
                          <div style="font-size: 17px; font-weight: 800; color: #ffffff; margin-top: 2px;">₹{booking.total_amount}</div>
                        </td>
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Payment Status</span>
                          <div style="margin-top: 4px;">
                            <span style="display: inline-block; padding: 2px 8px; font-size: 12px; font-weight: 600; border-radius: 6px; background-color: rgba(255,255,255,0.06); color: {payment_badge_color};">
                              ● {payment_badge_text}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Customer Info Card -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 20px;">
                <tr>
                  <td style="padding-bottom: 8px;">
                    <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: #64748b;">Player / Customer Details</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style="font-size: 15px; font-weight: 700; color: #ffffff;">{customer_name}</div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 3px;">
                      📞 Phone: <a href="tel:{customer_phone}" style="color: #38bdf8; text-decoration: none;">{customer_phone}</a>
                    </div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 2px;">
                      ✉️ Email: <a href="mailto:{customer_email}" style="color: #38bdf8; text-decoration: none;">{customer_email}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td align="center" style="padding: 0 32px 32px 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #ccff00;">
                    <a href="{dashboard_url}" target="_blank" style="display: inline-block; padding: 13px 28px; font-size: 14px; font-weight: 700; color: #0b0f19; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Open Owner Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0c121e; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;">
                Need assistance? Reach our partner support at <a href="tel:+919825327612" style="color: #94a3b8; text-decoration: none;">+91 98253 27612</a> or <a href="mailto:Info@boxnplay.com" style="color: #94a3b8; text-decoration: none;">Info@boxnplay.com</a>.
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                © BoxNplay Platform. Play more, plan less.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return html


def send_owner_booking_notification(booking):
    """Send an automated booking confirmation email to the box owner.
    
    Safe & non-blocking: dispatches via Celery's send_email_task so Resend API
    latency never slows down API requests, and catches any queuing error so a
    notification failure never rolls back an approved booking.
    """
    try:
        if not booking or not booking.box:
            logger.warning("Cannot send owner booking email: booking or box is missing.")
            return False

        owner = booking.box.owner
        if not owner or not owner.email:
            logger.warning(
                "Cannot send owner booking email for booking #%s: Box '%s' has no owner email on file.",
                booking.id,
                booking.box.name,
            )
            return False

        subject = f"⚡ New Booking Confirmed: {booking.box.name} on {booking.date} at {booking.start_time}"
        html_content = render_owner_booking_email_html(booking)

        send_email_task.delay(
            owner.email,
            subject,
            html_content,
        )
        logger.info(
            "Queued owner booking notification email for booking #%s to %s",
            booking.id,
            owner.email,
        )
        return True
    except Exception as e:
        logger.exception(
            "Failed to queue owner booking notification for booking #%s: %s",
            getattr(booking, 'id', 'unknown'),
            e,
        )
        return False
