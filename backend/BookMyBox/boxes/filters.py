# boxes/filters.py
import django_filters
from .models import Box

class BoxFilter(django_filters.FilterSet):
    # For price range:
    # Frontend sends 'min_price' and 'max_price'
    min_price = django_filters.NumberFilter(field_name='price', lookup_expr='gte') # Greater than or equal to
    max_price = django_filters.NumberFilter(field_name='price', lookup_expr='lte') # Less than or equal to

    # For minimum rating:
    # Frontend sends 'min_rating'
    min_rating = django_filters.NumberFilter(field_name='rating', lookup_expr='gte') # Rating greater than or equal to

    # For sport (contains, case-insensitive):
    # Frontend sends 'sport'
    # Changed from 'iexact' to 'icontains' for more flexible matching.
    # This will match, for example, 'Cricket' if the DB has 'Indoor Cricket Court'.
    sport = django_filters.CharFilter(field_name='sport', lookup_expr='icontains')

    # For location (contains, case-insensitive):
    # Frontend sends 'location'
    # 'icontains' is generally ideal for location fields.
    location = django_filters.CharFilter(field_name='location', lookup_expr='icontains')

    class Meta:
        model = Box
        # List all the fields that you want to enable filtering on through the DjangoFilterBackend.
        # These are the *model field names*. The custom filter definitions above map the URL parameters
        # (like min_price, max_price, min_rating, sport, location) to these model fields.
        fields = ['sport', 'location', 'price', 'rating']