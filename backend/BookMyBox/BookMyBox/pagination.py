from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """Pagination for admin/owner dashboard list endpoints (users, bookings).

    The project-wide default (PAGE_SIZE=100 in settings.py) was tuned for
    "return everything" endpoints like the public box listing, not a UI
    table — this gives those tables a sane page size instead.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
