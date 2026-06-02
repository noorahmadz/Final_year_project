# Development setup (active backend)

Use **`Futsal_project/back_end/`** as the only runtime backend (see `ACTIVE_BACKEND.md` at repo root).

## 1. Environment

```bash
cd Futsal_project/back_end
copy .env.example .env
```

Edit `.env`:

- **`DEBUG=true`** for local development.
- **`SECRET_KEY`**: optional when `DEBUG=true` (settings apply a fixed dev fallback). Set a random value if you share a dev server or need stable secrets across machines.
- **`SECRET_KEY`**: **required** when `DEBUG=false` (staging/production-like runs).
- **Stripe (test mode)**: set `STRIPE_SECRET_KEY` (e.g. `sk_test_...`) and `STRIPE_WEBHOOK_SECRET` (e.g. `whsec_...`) when exercising payments/webhooks locally.

If you want staging/production templates:
- `.env.staging.example`
- `.env.production.example`

## 2. Install and database

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## 3. Tests (optional)

```bash
set SECRET_KEY=test-secret-key-for-ci-only
set DEBUG=True
python manage.py check
python manage.py test
```

## 4. Production later

- Set `DEBUG=false`, a strong `SECRET_KEY`, real `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS`, and database URL.
- Turn on TLS-related settings when behind HTTPS.
- Stripe: keep test keys until you intentionally switch to live keys.
