# Deployment Foundation (Development -> Production Path)

This repo currently targets development. The goal of this document is to provide a *standard, minimal* production path later (without adding heavy infrastructure now).

## 1) Build/run command (production-style)

From `Futsal_project/back_end/`:

```bash
gunicorn project_confic.wsgi:application --bind 0.0.0.0:8000
```

For local testing, you can install `gunicorn` using:

```bash
pip install -r requirements-prod.txt
```

## 2) Environment variables

Keep using the existing `.env` loading mechanism in `project_confic/settings.py`.

Minimum required for non-development runs:
- `DEBUG=false`
- `SECRET_KEY` (strong random value)
- `ALLOWED_HOSTS` (comma-separated)
- `ENABLE_LEGACY_API_ROUTES=false` (recommended for production mobile API surface)

This project also supports `APP_ENV` as a lightweight intent flag:
- `APP_ENV=development` (default)
- `APP_ENV=staging`
- `APP_ENV=production`

If `DEBUG` is not explicitly set in env, `APP_ENV` will infer whether `DEBUG` should be on. For clarity, templates set `DEBUG=false` for staging/production.

Stripe behavior:
- Development uses **Stripe TEST MODE** by design. Do not switch Stripe mode yet.
- Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as test keys while you are developing and testing locally.

Booking lifecycle scheduling:
- Production must run `python manage.py sync_booking_lifecycle` on a fixed interval.
- Recommended interval: every `BOOKING_LIFECYCLE_SCHEDULE_SECONDS` seconds (default `60`).
- Production health checks should also run `python manage.py check_booking_lifecycle_health`.
- `BOOKING_LIFECYCLE_MAX_STALENESS_SECONDS` defines how stale the scheduler heartbeat may become before health checks fail (default `300`).
- The recommended production deployment model is a `systemd` timer, not ad hoc cron.
- Install the provided units from `deploy/systemd/` and adjust the paths/user for your host.

Recommended systemd deployment:

```bash
sudo cp deploy/systemd/futsal-booking-lifecycle-sync.service /etc/systemd/system/
sudo cp deploy/systemd/futsal-booking-lifecycle-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now futsal-booking-lifecycle-sync.timer
sudo systemctl status futsal-booking-lifecycle-sync.timer
```

Operational checks:

```bash
python manage.py check_booking_lifecycle_health
python manage.py check_revenue_integrity
```

Fallback cron example if `systemd` timers are unavailable:

```cron
* * * * * /path/to/venv/bin/python /path/to/project/manage.py sync_booking_lifecycle
* * * * * /path/to/venv/bin/python /path/to/project/manage.py check_booking_lifecycle_health
```

Revenue migration rollout validation:
- Run the schema/data migration on staging first.
- After migration, run `python manage.py check_revenue_integrity`.
- Compare `GymRevenue` tournament totals with successful `TournamentPayment` totals.
- Confirm no legacy clients depend on deprecated routes before setting `ENABLE_LEGACY_API_ROUTES=false` in production.

## 3) Notes on staging/production separation

Use `APP_ENV` to mark intent.

Current code keeps security-related defaults primarily driven by `DEBUG` and explicit env flags, so you can evolve toward stronger production settings later.

