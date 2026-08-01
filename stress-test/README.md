# Stress testing

`loadtest.py` drives the full API through `docker-compose.prod.yml`, resource-limited by
`docker-compose.stress.yml` to simulate a 2 vCPU / 2GB VM. It requires `httpx` (`pip install httpx`).

## Running it

```bash
# From the repo root:
cp .env.docker.example .env.docker   # fill in real values; set DB_CONN_MAX_AGE=0
docker compose -f docker-compose.prod.yml -f docker-compose.stress.yml --env-file .env.docker up --build -d

docker cp backend/BookMyBox/scripts/seed_stress_test.py $(docker compose -f docker-compose.prod.yml ps -q backend):/app/scripts/seed_stress_test.py
docker compose -f docker-compose.prod.yml --env-file .env.docker exec backend python manage.py shell -c "
import sys; sys.path.insert(0, 'scripts'); exec(open('scripts/seed_stress_test.py').read())
"

python3 stress-test/loadtest.py   # hits http://localhost (nginx), takes ~5 minutes

docker compose -f docker-compose.prod.yml -f docker-compose.stress.yml --env-file .env.docker down -v
rm .env.docker
```

Results print to stdout scenario-by-scenario and are also written to `/tmp/loadtest_results.json`.
To watch container resource usage during a run, sample `docker stats --no-stream` in a background
loop while `loadtest.py` runs (see the report for what this surfaced last time — CPU-bound
saturation on the `backend` container, not memory).

## What it covers

Every public and authenticated read endpoint, login/register (password hashing cost), the
reservation rate limiter, a single-slot reservation race across many concurrent users (the
same guarantee `bookings/tests/test_reserve_confirm_flow.py`'s `ConcurrencyProofTestCase`
proves locally, re-run here under real resource constraints), and a mixed-traffic concurrency
ramp (10 → 150 concurrent virtual users) to find the practical throughput ceiling.

The chatbot endpoint is tested without `GEMINI_API_KEY` set, so it measures the endpoint's own
overhead and rate limiter, not real Gemini latency — there's no way to load-test a third-party
LLM API here without it costing real money per request.

## Last results

See the report shared alongside this tooling for the full write-up. Two real bugs and one real
perf issue were found and fixed this way, all now in the main codebase — see the comments above
`DATABASES` and `SECURE_PROXY_SSL_HEADER`/`SECURE_SSL_REDIRECT` in `settings.py`,
`get_permissions()` in `bookings/views.py`, and `get_queryset()` in `boxes/views.py`.
