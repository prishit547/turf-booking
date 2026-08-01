# One-off data-seeding scripts

These are historical, manually-run scripts used to seed demo data into
`db.sqlite3` early in the project — not part of the running application,
not imported by any app, and not wired into any management command. The
dev database already has their data loaded, so these are kept for
reference / to reseed a fresh database, not something you need to run
day-to-day.

- `populate_bookings.py` + `bookings_data.py` — seeds demo `Booking` rows.
- `populate_reviews.py` + `reviews_data.py` — seeds demo `Review` rows.
- `data_for_boxes.py` — demo `Box` data. No corresponding `populate_*.py`
  script exists for it (unclear whether boxes were seeded some other way,
  e.g. via the admin, or via a script that was since lost) — kept as-is
  rather than guessed at.
- `seed_stress_test.py` — not historical, actively used. Seeds a
  load-test-scale dataset (100 boxes, 55 users, ~300 bookings, all
  `stress_*@loadtest.local`) for `stress-test/loadtest.py` — see
  `stress-test/README.md` at the repo root.

## Running

Each script imports its sibling data file with a bare `from x_data import
x_data`, so `scripts/` needs to be on `sys.path` before executing it —
running the file directly (`python scripts/populate_bookings.py`) won't
work on its own since Django needs to be bootstrapped first. From
`backend/BookMyBox/`:

```bash
python manage.py shell -c "
import sys
sys.path.insert(0, 'scripts')
exec(open('scripts/populate_bookings.py').read())
"
```

Same pattern for `populate_reviews.py`. Both scripts expect specific
`Box`/user records (by name+location, or by email) to already exist in
the target database — check `bookings_data.py`/`reviews_data.py` for the
exact records they assume, and adjust before running against a database
that doesn't already have matching seed data.
