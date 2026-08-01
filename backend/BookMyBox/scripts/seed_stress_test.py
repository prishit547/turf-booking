"""
Seed script for stress-test/loadtest.py — populates docker-compose.prod.yml
(run with the docker-compose.stress.yml resource-limit overlay) with a
realistic-scale dataset so read endpoints (listing, filtering, dashboards)
aren't just querying empty tables. Run via:

  docker compose ... exec backend python manage.py shell -c "
  import sys; sys.path.insert(0, 'scripts'); exec(open('scripts/seed_stress_test.py').read())
  "

Not meant to be run against a real/dev database — it creates throwaway
users with a fixed known password so the load test script can log in.
"""
import random
from datetime import date, timedelta

from boxes.models import Box
from bookings.models import Booking
from user.models import User

SPORTS = ['Cricket', 'Football', 'Tennis', 'Badminton', 'Basketball', 'Pickleball']
CITIES = [
    ('Mumbai', 19.0760, 72.8777), ('Ahmedabad', 23.0225, 72.5714),
    ('Bengaluru', 12.9716, 77.5946), ('Delhi', 28.7041, 77.1025),
    ('Pune', 18.5204, 73.8567),
]
PASSWORD = 'StressTest123!'

print("Seeding stress-test data...")

owners = []
for i in range(5):
    owner, _ = User.objects.get_or_create(
        email=f'stress_owner{i}@loadtest.local',
        defaults=dict(
            username=f'stress_owner{i}@loadtest.local', role='owner',
            phone=f'70000000{i:02d}', location='Mumbai', business_name=f'Stress Sports {i}',
        ),
    )
    owner.set_password(PASSWORD)
    owner.save()
    owners.append(owner)

users = []
for i in range(50):
    user, _ = User.objects.get_or_create(
        email=f'stress_user{i}@loadtest.local',
        defaults=dict(
            username=f'stress_user{i}@loadtest.local', role='user',
            phone=f'71000000{i:03d}'[-10:], location='Mumbai',
        ),
    )
    user.set_password(PASSWORD)
    user.save()
    users.append(user)

boxes = []
if Box.objects.filter(name__startswith='Stress Box').count() < 100:
    for i in range(100):
        city, lat, lng = random.choice(CITIES)
        sport = random.choice(SPORTS)
        box = Box.objects.create(
            name=f'Stress Box {i}', sport=sport, sports=[sport], location=city,
            price=random.choice([300, 500, 700, 900, 1200]),
            capacity=random.choice([10, 20, 30]),
            owner=random.choice(owners), status='approved',
            latitude=lat + random.uniform(-0.05, 0.05),
            longitude=lng + random.uniform(-0.05, 0.05),
            rating=round(random.uniform(3.0, 5.0), 1),
            is_featured=(i % 10 == 0),
        )
        boxes.append(box)
else:
    boxes = list(Box.objects.filter(name__startswith='Stress Box'))

print(f"Boxes: {Box.objects.count()} total ({len(boxes)} stress boxes)")

# Scatter some existing confirmed bookings across the next 30 days so
# booked_slots/dashboard-analytics queries have real rows to aggregate,
# without colliding with the 09:00/10:00 slots the load test itself reserves.
if Booking.objects.filter(user__email__startswith='stress_user').count() < 200:
    created = 0
    for _ in range(300):
        box = random.choice(boxes)
        user = random.choice(users)
        day_offset = random.randint(1, 30)
        booking_date = date.today() + timedelta(days=day_offset)
        hour = random.choice([14, 15, 16, 17, 18, 19, 20])
        duration = random.choice([1, 2])
        start = f'{hour:02d}:00'
        end = f'{hour + duration:02d}:00'
        if Booking.objects.filter(box=box, date=booking_date, start_time=start, booking_status='Confirmed').exists():
            continue
        Booking.objects.create(
            user=user, box=box, date=booking_date, start_time=start, end_time=end,
            duration=duration, total_amount=box.price * duration, booking_status='Confirmed',
        )
        created += 1
    print(f"Bookings created this run: {created}")

print(f"Bookings: {Booking.objects.count()} total")
print(f"Users: {User.objects.filter(email__startswith='stress_').count()} stress users/owners")
print("Seed complete.")
