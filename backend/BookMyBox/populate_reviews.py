from boxes.models import Box, Review
from reviews_data import reviews_data
from django.db import transaction
from django.contrib.auth import get_user_model

User = get_user_model()

with transaction.atomic():
    print("🚀 Starting Review data population...")

    for review_item in reviews_data:
        box_name = review_item.get('box_name')
        box_location = review_item.get('location')
        user_first_name = review_item.get('user_username')  # still using 'user_username' key from reviews_data

        try:
            # Get the Box object
            box = Box.objects.get(name=box_name, location=box_location)

            # Get the user by first_name (instead of username)
            user = User.objects.filter(first_name=user_first_name).first()

            if not user:
                print(f'❗ User with first_name "{user_first_name}" not found. Skipping.')
                continue

            # Prevent duplicate reviews
            if not Review.objects.filter(box=box, user=user, comment=review_item['comment']).exists():
                review = Review(
                    box=box,
                    user=user,
                    rating=review_item['rating'],
                    comment=review_item['comment'],
                    date=review_item['date'],
                )
                review.save()
                print(f'✅ Review added for "{box.name}" by user "{user.first_name}"')
            else:
                print(f'⚠️ Review already exists for "{box_name}" by "{user_first_name}". Skipping.')

        except Box.DoesNotExist:
            print(f'❗ Box "{box_name}" at "{box_location}" not found. Skipping.')
        except Exception as e:
            print(f'❌ Error adding review for "{box_name}" by "{user_first_name}": {e}')

    print("✅ Review data population complete.")
