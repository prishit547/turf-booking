from django.core.cache import cache


def check_rate_limit(key, limit, window):
    """Fixed-window per-key rate limit backed by Django's cache (Redis in
    this project, see settings.py's CACHES). Returns True and counts this
    call toward the limit if the caller is still within `limit` calls in
    the last `window` seconds; returns False (and does not count) once
    they've hit it.

    Shared by every endpoint that needs simple per-user rate limiting —
    originally the chatbot's alone, now also bookings' reserve() — so the
    mechanism can't drift between them.
    """
    current = cache.get(key, 0)
    if current >= limit:
        return False
    cache.set(key, current + 1, timeout=window)
    return True
