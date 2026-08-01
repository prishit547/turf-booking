# reviews_data.py (Place this file at your project root, next to manage.py)

from datetime import date, timedelta
import random

# IMPORTANT: Replace these with ACTUAL usernames from your database!
# Example placeholder usernames:
# If you have 'admin', 'user_john', 'member_jane', 'customer_1', 'customer_2', etc.
# Use those here.
actual_existing_usernames = ['rochan', 'mahesh', 'mahesh', 'shubham', 'tirth', 'ROCHAN', 'viraj', 'khush', 'khush', 'mahesh', 'meet']

# Generate a list of recent dates for reviews
today = date.today()
review_dates = [today - timedelta(days=random.randint(0, 90)) for _ in range(30)] # Generate enough dates
random.shuffle(review_dates)

reviews_data = [
    # Super Sixes Cricket Arena, Thaltej, Ahmedabad
    {
        "box_name": "Super Sixes Cricket Arena",
        "location": "Thaltej, Ahmedabad",
        "user_username": actual_existing_usernames[0], # Assign from your list
        "rating": 5,
        "comment": "Fantastic turf and lighting! Perfect for evening matches. Highly recommended for cricket lovers.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Super Sixes Cricket Arena",
        "location": "Thaltej, Ahmedabad",
        "user_username": actual_existing_usernames[1], # Assign from your list
        "rating": 4,
        "comment": "Great facility, but parking can be a bit tight during peak hours. Otherwise, excellent.",
        "date": review_dates.pop() if review_dates else today,
    },
    # ... continue for all reviews, assigning a username from your actual_existing_usernames list
    # Make sure you have enough unique usernames or rotate them if you have fewer users than reviews.
    # You can use random.choice(actual_existing_usernames) if you want to randomly assign.
    {
        "box_name": "Super Sixes Cricket Arena",
        "location": "Thaltej, Ahmedabad",
        "user_username": actual_existing_usernames[2],
        "rating": 5,
        "comment": "Best cricket ground in Ahmedabad! The turf is amazing and amenities are clean.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Ace Badminton Court, Satellite, Ahmedabad
    {
        "box_name": "Ace Badminton Court",
        "location": "Satellite, Ahmedabad",
        "user_username": actual_existing_usernames[3],
        "rating": 4,
        "comment": "Good wooden flooring and AC. Can get busy, so book well in advance.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Ace Badminton Court",
        "location": "Satellite, Ahmedabad",
        "user_username": actual_existing_usernames[4],
        "rating": 3,
        "comment": "Decent court, but the water cooler was out of order during my visit. Hope they fix it.",
        "date": review_dates.pop() if review_dates else today,
    },

    # The Football Turf, SG Highway, Ahmedabad
    {
        "box_name": "The Football Turf, SG Highway",
        "location": "SG Highway, Ahmedabad",
        "user_username": actual_existing_usernames[5],
        "rating": 5,
        "comment": "Top-notch turf and lighting. Perfect for intense football matches. Love the cafe too!",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "The Football Turf, SG Highway",
        "location": "SG Highway, Ahmedabad",
        "user_username": actual_existing_usernames[6],
        "rating": 4,
        "comment": "Excellent facility, but the spectator area could use more shading.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Paddle Pro Ahmedabad, Science City Road, Ahmedabad
    {
        "box_name": "Paddle Pro Ahmedabad",
        "location": "Science City Road, Ahmedabad",
        "user_username": actual_existing_usernames[7],
        "rating": 5,
        "comment": "Awesome padel courts! Racket rental makes it super easy to just show up and play. Friendly staff.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Paddle Pro Ahmedabad",
        "location": "Science City Road, Ahmedabad",
        "user_username": actual_existing_usernames[8],
        "rating": 4,
        "comment": "Good courts for padel. Wish they had more availability during weekends.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Ahmedabad Squash Arena, Bodakdev, Ahmedabad
    {
        "box_name": "Ahmedabad Squash Arena",
        "location": "Bodakdev, Ahmedabad",
        "user_username": actual_existing_usernames[9],
        "rating": 4,
        "comment": "Clean and well-maintained squash court. AC is a blessing! Pro shop is handy.",
        "date": review_dates.pop() if review_dates else today,
    },

    # GTU Basketball Court, GTU Campus, Gandhinagar Rd, Ahmedabad
    {
        "box_name": "GTU Basketball Court",
        "location": "GTU Campus, Gandhinagar Rd, Ahmedabad",
        "user_username": actual_existing_usernames[10],
        "rating": 3,
        "comment": "It's a good outdoor court, but sometimes gets overcrowded. Could use better lighting at night.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "GTU Basketball Court",
        "location": "GTU Campus, Gandhinagar Rd, Ahmedabad",
        "user_username": actual_existing_usernames[0], # Reusing users
        "rating": 4,
        "comment": "Nice place for a casual game. Love the open space.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Adani Arena Multisport, SG Road, Ahmedabad
    {
        "box_name": "Adani Arena Multisport",
        "location": "SG Road, Ahmedabad",
        "user_username": actual_existing_usernames[1],
        "rating": 5,
        "comment": "World-class facility! Multiple sports, great AC, and clean showers. A true gem.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Adani Arena Multisport",
        "location": "SG Road, Ahmedabad",
        "user_username": actual_existing_usernames[2],
        "rating": 5,
        "comment": "My go-to place for sports. The staff is very helpful and the amenities are excellent.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Kankaria Lakeside Skating Rink, Kankaria, Ahmedabad
    {
        "box_name": "Kankaria Lakeside Skating Rink",
        "location": "Kankaria, Ahmedabad",
        "user_username": actual_existing_usernames[3],
        "rating": 4,
        "comment": "Fun place for skating. The lake view is a bonus. Rental skates are a bit old but work.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Sabarmati Riverfront Cycle Track, Sabarmati Riverfront, Ahmedabad
    {
        "box_name": "Sabarmati Riverfront Cycle Track",
        "location": "Sabarmati Riverfront, Ahmedabad",
        "user_username": actual_existing_usernames[4],
        "rating": 5,
        "comment": "Beautiful track for cycling! Love the rentals and the views. A must-do in Ahmedabad.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Sabarmati Riverfront Cycle Track",
        "location": "Sabarmati Riverfront, Ahmedabad",
        "user_username": actual_existing_usernames[5],
        "rating": 4,
        "comment": "Great experience. Cycles are well-maintained. Can get crowded on weekends.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Salt Lake Futsal Courts, Salt Lake, Kolkata
    {
        "box_name": "Salt Lake Futsal Courts",
        "location": "Salt Lake, Kolkata",
        "user_username": actual_existing_usernames[6],
        "rating": 4,
        "comment": "Good indoor futsal courts. Turf quality is nice. Booking online is easy.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Goa Watersports Hub, Baga Beach, Goa
    {
        "box_name": "Goa Watersports Hub",
        "location": "Baga Beach, Goa",
        "user_username": actual_existing_usernames[7],
        "rating": 5,
        "comment": "Amazing watersports experience! The instructors are very professional and ensure safety. Highly recommend the jet skiing!",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Goa Watersports Hub",
        "location": "Baga Beach, Goa",
        "user_username": actual_existing_usernames[8],
        "rating": 4,
        "comment": "Fun activities, but a bit pricey. Still, worth it for the adventure.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Jaipur Yoga Studio, C Scheme, Jaipur
    {
        "box_name": "Jaipur Yoga Studio",
        "location": "C Scheme, Jaipur",
        "user_username": actual_existing_usernames[9],
        "rating": 5,
        "comment": "A truly calming and professional yoga studio. The instructors are excellent and the ambiance is perfect.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Lucknow Archery Range, Gomti Nagar, Lucknow
    {
        "box_name": "Lucknow Archery Range",
        "location": "Gomti Nagar, Lucknow",
        "user_username": actual_existing_usernames[10],
        "rating": 4,
        "comment": "Great place to try archery. The coaching for beginners is very helpful.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Bhopal Skating Park, Arera Colony, Bhopal
    {
        "box_name": "Bhopal Skating Park",
        "location": "Arera Colony, Bhopal",
        "user_username": actual_existing_usernames[0], # Reusing users
        "rating": 3,
        "comment": "Decent park for skating, but some ramps are a bit worn out. Good for casual use.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Indore Cricket Academy Nets, Vijay Nagar, Indore
    {
        "box_name": "Indore Cricket Academy Nets",
        "location": "Vijay Nagar, Indore",
        "user_username": actual_existing_usernames[1],
        "rating": 5,
        "comment": "Excellent nets for practice! Bowling machines are a great addition. Highly recommend for serious cricketers.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Chandigarh Cycling Track, Leisure Valley, Chandigarh
    {
        "box_name": "Chandigarh Cycling Track",
        "location": "Leisure Valley, Chandigarh",
        "user_username": actual_existing_usernames[2],
        "rating": 4,
        "comment": "Lovely track, very scenic. Cycle rentals are convenient. A great way to spend a morning.",
        "date": review_dates.pop() if review_dates else today,
    },

    # Additional reviews (to make up to 28 reviews total for 23 boxes)
    {
        "box_name": "Super Sixes Cricket Arena",
        "location": "Thaltej, Ahmedabad",
        "user_username": actual_existing_usernames[3],
        "rating": 4,
        "comment": "Always a good time here, well-maintained. The staff is cooperative.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "The Football Turf, SG Highway",
        "location": "SG Highway, Ahmedabad",
        "user_username": actual_existing_usernames[4],
        "rating": 5,
        "comment": "Best turf in Ahmedabad for football. Always prefer this place for weekend games.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Adani Arena Multisport",
        "location": "SG Road, Ahmedabad",
        "user_username": actual_existing_usernames[5],
        "rating": 5,
        "comment": "So many options under one roof. Truly a world-class sports complex.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Paddle Pro Ahmedabad",
        "location": "Science City Road, Ahmedabad",
        "user_username": actual_existing_usernames[6],
        "rating": 5,
        "comment": "Padel is picking up and this place is doing it right. Good courts and community.",
        "date": review_dates.pop() if review_dates else today,
    },
    {
        "box_name": "Sabarmati Riverfront Cycle Track",
        "location": "Sabarmati Riverfront, Ahmedabad",
        "user_username": actual_existing_usernames[7],
        "rating": 5,
        "comment": "Peaceful cycling experience. I go here every morning for my ride. Highly recommend!",
        "date": review_dates.pop() if review_dates else today,
    },
]