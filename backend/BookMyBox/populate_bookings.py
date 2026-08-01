# boxes/scripts/populate_bookings.py

from boxes.models import Box
from bookings.models import Booking # Assuming Booking model is in 'bookings' app
from bookings_data import bookings_data # This assumes bookings_data.py is at project root
from django.db import transaction
from django.contrib.auth import get_user_model
import uuid # Needed for payment_id generation

User = get_user_model()

def run():
    with transaction.atomic():
        print("Starting Booking data population...")
        for booking_item in bookings_data:
            box_name = booking_item['box_name']
            box_location = booking_item['location']
            user_email = booking_item['user_email']

            try:
                # Find the corresponding Box object
                box = Box.objects.get(name=box_name, location=box_location)

                # Find the corresponding User object by its email
                user = User.objects.get(email=user_email)

                # Generate a unique payment_id if payment_status is 'Completed'
                payment_id_val = booking_item.get('payment_id')

                # Check if a similar booking already exists for this box, user, date, and time
                if not Booking.objects.filter(
                    box=box,
                    user=user,
                    date=booking_item['date'],
                    start_time=booking_item['start_time'],
                    end_time=booking_item['end_time']
                ).exists():
                    booking = Booking(
                        user=user,
                        box=box,
                        date=booking_item['date'],
                        start_time=booking_item['start_time'],
                        end_time=booking_item['end_time'],
                        duration=booking_item['duration'],
                        total_amount=booking_item['total_amount'],
                        payment_status=booking_item['payment_status'],
                        payment_id=payment_id_val,
                        booking_status=booking_item['booking_status'],
                    )
                    booking.save()
                    print(f'Successfully added booking for "{box.name}" by user "{user.email}" on {booking.date} from {booking.start_time} to {booking.end_time}')
                else:
                    print(f'Booking for "{box_name}" by user "{user_email}" on {booking_item["date"]} at {booking_item["start_time"]} already exists. Skipping.')

            except Box.DoesNotExist:
                print(f'Warning: Box "{box_name}" at "{box_location}" not found. Skipping booking for this box.')
            except User.DoesNotExist:
                print(f'Warning: User with email "{user_email}" not found in your database. Skipping booking for this user.')
            except Exception as e:
                print(f'Error adding booking for "{box_name}" by user "{user_email}": {e}')
        print("Booking data population complete.")
        


