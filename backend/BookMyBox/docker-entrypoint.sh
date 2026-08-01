#!/bin/sh
# Shared entrypoint for the backend image — docker-compose.prod.yml picks
# the mode via the command it passes (migrate / web / worker), so the
# migration step runs exactly once as its own short-lived service instead
# of racing between the web and worker containers on startup.
set -e

case "$1" in
  migrate)
    exec python manage.py migrate --noinput
    ;;
  web)
    python manage.py collectstatic --noinput
    exec daphne -b 0.0.0.0 -p 8000 BookMyBox.asgi:application
    ;;
  worker)
    exec celery -A BookMyBox worker -l info
    ;;
  *)
    exec "$@"
    ;;
esac
