# bookings_data.py

from datetime import date, timedelta, datetime
import random
import itertools
import uuid

# IMPORTANT: Use ACTUAL user emails that exist in your database!
# These should match the emails you used or verified for reviews_data.py
actual_existing_user_emails = ['khush@gmail.com', 'kp@gmail.com', 'mahesh@gmail.com', 'maheshpatel@gmail.com', 'meet@gmail.com', 'mm@gmail.com', 'ms@gmail.com', 'shahrochan05@gmail.com', 'shahrochan15@gmail.com', 'tirth@gmail.com', 'viraj@gmail.com']

# Create a cycle to ensure we don't run out of users for bookings
user_email_cycler = itertools.cycle(actual_existing_user_emails)

# Define some common time slots
time_slots = [
    ("08:00", "09:00", 1),
    ("09:00", "10:00", 1),
    ("10:00", "11:00", 1),
    ("11:00", "12:00", 1),
    ("14:00", "16:00", 2), # 2-hour slot
    ("17:00", "18:00", 1),
    ("19:00", "20:00", 1),
    ("20:00", "21:00", 1),
    ("21:00", "22:00", 1),
]

# Mock hourly rates for different types of boxes (in INR)
# These rates are just examples. Adjust as per your actual business logic.
HOURLY_RATES = {
    "cricket": 500,
    "football": 600,
    "badminton": 350,
    "padel": 450,
    "squash": 400,
    "basketball": 300,
    "multisport": 550,
    "skating": 250, # Per session, not strictly hourly
    "cycling": 150, # Per hour/session
    "futsal": 500,
    "watersports": 1000, # Per activity, not hourly
    "yoga": 200, # Per session
    "archery": 300, # Per session
}

# Helper function to calculate total amount based on box type and duration
def calculate_amount(box_name, duration):
    # Simple logic to determine box type for rate lookup
    box_name_lower = box_name.lower()
    if "cricket" in box_name_lower:
        rate = HOURLY_RATES["cricket"]
    elif "football" in box_name_lower or "futsal" in box_name_lower:
        rate = HOURLY_RATES["football"] # Use football rate for futsal too
    elif "badminton" in box_name_lower:
        rate = HOURLY_RATES["badminton"]
    elif "padel" in box_name_lower:
        rate = HOURLY_RATES["padel"]
    elif "squash" in box_name_lower:
        rate = HOURLY_RATES["squash"]
    elif "basketball" in box_name_lower:
        rate = HOURLY_RATES["basketball"]
    elif "multisport" in box_name_lower or "arena" in box_name_lower:
        rate = HOURLY_RATES["multisport"]
    elif "skating" in box_name_lower:
        rate = HOURLY_RATES["skating"]
    elif "cycle" in box_name_lower:
        rate = HOURLY_RATES["cycling"]
    elif "watersports" in box_name_lower:
        rate = HOURLY_RATES["watersports"]
    elif "yoga" in box_name_lower:
        rate = HOURLY_RATES["yoga"]
    elif "archery" in box_name_lower:
        rate = HOURLY_RATES["archery"]
    else:
        rate = 400 # Default rate if type not matched

    # For watersports, yoga, archery, skating, cycling, treat duration as number of sessions/activities
    # For others, it's hourly
    if any(keyword in box_name_lower for keyword in ["watersports", "yoga", "archery", "skating", "cycle"]):
        return float(rate) # Flat rate per activity/session
    else:
        return float(rate * duration)


# Generate booking dates for the past 60 days and next 30 days
today = date.today()
booking_dates = [today - timedelta(days=random.randint(0, 59)) for _ in range(50)] + \
                [today + timedelta(days=random.randint(0, 29)) for _ in range(20)]
random.shuffle(booking_dates)


bookings_data = []

# --- Bookings for existing 23 boxes ---

# Box 1: Super Sixes Cricket Arena, Thaltej, Ahmedabad
for _ in range(3): # 3 bookings for this box
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Super Sixes Cricket Arena",
        "location": "Thaltej, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']),
    })

# Box 2: Ace Badminton Court, Satellite, Ahmedabad
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Ace Badminton Court",
        "location": "Satellite, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Confirmed', 'Cancelled']),
    })

# Box 3: The Football Turf, SG Highway, Ahmedabad
for _ in range(3):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "The Football Turf, SG Highway",
        "location": "SG Highway, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Failed']),
        "booking_status": random.choice(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']),
    })

# Box 4: Paddle Pro Ahmedabad, Science City Road, Ahmedabad
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Paddle Pro Ahmedabad",
        "location": "Science City Road, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Confirmed', 'Cancelled']),
    })

# Box 5: Ahmedabad Squash Arena, Bodakdev, Ahmedabad
for _ in range(1):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Ahmedabad Squash Arena",
        "location": "Bodakdev, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 6: GTU Basketball Court, GTU Campus, Gandhinagar Rd, Ahmedabad
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "GTU Basketball Court",
        "location": "GTU Campus, Gandhinagar Rd, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Confirmed', 'Cancelled']),
    })

# Box 7: Adani Arena Multisport, SG Road, Ahmedabad
for _ in range(3):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Adani Arena Multisport",
        "location": "SG Road, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Completed', 'Pending']),
        "booking_status": 'Confirmed',
    })

# Box 8: Kankaria Lakeside Skating Rink, Kankaria, Ahmedabad
for _ in range(1):
    slot = random.choice(time_slots) # Slot duration might not strictly apply to skating
    bookings_data.append({
        "box_name": "Kankaria Lakeside Skating Rink",
        "location": "Kankaria, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "17:00", # Specific time for session
        "end_time": "18:00",
        "duration": 1, # Represents 1 session
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 9: Sabarmati Riverfront Cycle Track, Sabarmati Riverfront, Ahmedabad
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Sabarmati Riverfront Cycle Track",
        "location": "Sabarmati Riverfront, Ahmedabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "07:00", # Morning specific
        "end_time": "08:00",
        "duration": 1, # Represents 1 hour cycle rental
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 10: Salt Lake Futsal Courts, Salt Lake, Kolkata
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Salt Lake Futsal Courts",
        "location": "Salt Lake, Kolkata",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Cancelled']),
    })

# Box 11: Goa Watersports Hub, Baga Beach, Goa
for _ in range(2):
    bookings_data.append({
        "box_name": "Goa Watersports Hub",
        "location": "Baga Beach, Goa",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "10:00", # Arbitrary start for activity
        "end_time": "11:00",
        "duration": 1, # Represents 1 activity booking
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 12: Jaipur Yoga Studio, C Scheme, Jaipur
for _ in range(1):
    bookings_data.append({
        "box_name": "Jaipur Yoga Studio",
        "location": "C Scheme, Jaipur",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "07:30", # Yoga session start
        "end_time": "08:30",
        "duration": 1, # Represents 1 session
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 13: Lucknow Archery Range, Gomti Nagar, Lucknow
for _ in range(1):
    bookings_data.append({
        "box_name": "Lucknow Archery Range",
        "location": "Gomti Nagar, Lucknow",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "16:00",
        "end_time": "17:00",
        "duration": 1,
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 14: Bhopal Skating Park, Arera Colony, Bhopal
for _ in range(1):
    bookings_data.append({
        "box_name": "Bhopal Skating Park",
        "location": "Arera Colony, Bhopal",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "18:00",
        "end_time": "19:00",
        "duration": 1,
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": random.choice(['Confirmed', 'Cancelled']),
    })

# Box 15: Indore Cricket Academy Nets, Vijay Nagar, Indore
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Indore Cricket Academy Nets",
        "location": "Vijay Nagar, Indore",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 16: Chandigarh Cycling Track, Leisure Valley, Chandigarh
for _ in range(1):
    bookings_data.append({
        "box_name": "Chandigarh Cycling Track",
        "location": "Leisure Valley, Chandigarh",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "06:30",
        "end_time": "07:30",
        "duration": 1,
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Placeholder Boxes (Assuming these exist based on prior discussions or you'll add them)
# These won't have reviews, but need bookings to illustrate data.

# Box 17: Hyderabad Football Turf, Gachibowli, Hyderabad
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Hyderabad Football Turf",
        "location": "Gachibowli, Hyderabad",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": 'Confirmed',
    })

# Box 18: Chennai Badminton Hub, Anna Nagar, Chennai
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Chennai Badminton Hub",
        "location": "Anna Nagar, Chennai",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": random.choice(['Confirmed', 'Cancelled']),
    })

# Box 19: Bengaluru Cricket Nets, Koramangala, Bengaluru
for _ in range(3):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Bengaluru Cricket Nets",
        "location": "Koramangala, Bengaluru",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 20: Pune Multisport Complex, Wakad, Pune
for _ in range(2):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Pune Multisport Complex",
        "location": "Wakad, Pune",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": random.choice(['Completed', 'Pending']),
        "booking_status": 'Confirmed',
    })

# Box 21: Delhi Padel Club, Vasant Kunj, Delhi
for _ in range(1):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Delhi Padel Club",
        "location": "Vasant Kunj, Delhi",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 22: Kolkata Table Tennis Arena, Hazra, Kolkata
for _ in range(1):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Kolkata Table Tennis Arena",
        "location": "Hazra, Kolkata",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": slot[0],
        "end_time": slot[1],
        "duration": slot[2],
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })

# Box 23: Mumbai Beach Volleyball, Juhu Beach, Mumbai
for _ in range(1):
    slot = random.choice(time_slots)
    bookings_data.append({
        "box_name": "Mumbai Beach Volleyball",
        "location": "Juhu Beach, Mumbai",
        "user_email": next(user_email_cycler),
        "date": booking_dates.pop() if booking_dates else today,
        "start_time": "17:00", # Evening beach sport
        "end_time": "19:00",
        "duration": 2,
        "payment_status": 'Completed',
        "booking_status": 'Confirmed',
    })


# Calculate total_amount for each booking
for booking in bookings_data:
    booking['total_amount'] = calculate_amount(booking['box_name'], booking['duration'])
    # Assign a dummy payment_id if payment is completed
    if booking['payment_status'] == 'Completed':
        booking['payment_id'] = f"ch_{uuid.uuid4().hex[:20]}" # Generate a mock Stripe-like ID
    else:
        booking['payment_id'] = None # No payment ID if not completed