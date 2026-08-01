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
    # A single Daphne process is one Python process on one core — a stress
    # test found the backend GIL/CPU-saturated with throughput flat
    # regardless of concurrency. Multiple gunicorn-managed worker processes
    # (each running uvicorn's ASGI3 implementation, which still handles the
    # WebSocket scope Channels needs) let concurrent requests actually run
    # in parallel across whatever CPU is available instead of queueing
    # behind one process. WEB_CONCURRENCY defaults to 2; raise it if more
    # CPU is allocated to this container than the default stress profile.
    exec gunicorn BookMyBox.asgi:application \
      -k uvicorn.workers.UvicornWorker \
      --workers "${WEB_CONCURRENCY:-2}" \
      --bind 0.0.0.0:8000 \
      --timeout 60
    ;;
  worker)
    # Celery's prefork pool defaults its --concurrency to the HOST's CPU
    # count (multiprocessing.cpu_count() doesn't see cgroup limits), not
    # this container's allocation — a stress test found it forking 8 worker
    # processes inside a container capped at a fraction of one core, each a
    # full Django process, sitting right at the memory limit for no
    # throughput benefit (there was never CPU to run 8 of them on).
    exec celery -A BookMyBox worker -l info --concurrency="${CELERY_CONCURRENCY:-2}"
    ;;
  *)
    exec "$@"
    ;;
esac
