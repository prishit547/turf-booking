from celery import shared_task


@shared_task
def ping():
    """Trivial round-trip check for the Celery+Redis broker wiring."""
    return 'pong'
