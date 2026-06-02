# Kandahar Gyms Online System - Backend

A Django REST API backend for managing gym facilities, field bookings, tournaments, and payments in Afghanistan.

## Technical Stack

- **Django 5.x** - Web framework
- **Django REST Framework** - REST API
- **SQLite** - Database (configurable for PostgreSQL)
- **JWT Authentication** - Using djangorestframework-simplejwt

## Features

- **Users**: Phone-based authentication with roles (admin, owner, customer)
- **Gyms**: Manage gym facilities, fields, time slots, discounts, and reviews
- **Bookings**: Create bookings with time overlap prevention and optional discount codes
- **Payments**: Mock payment gateway integration for booking and tournament payments
- **Tournaments**: Create tournaments, register teams, and manage matches
- **Revenues**: Track revenue from bookings and tournaments

## Setup Instructions

### Prerequisites

- Python 3.8+
- pip

### Installation

1. **Clone the repository** and navigate to the project directory:

```bash
cd back_end
```

2. **Create a virtual environment** (optional but recommended):

```bash
python -m venv venv
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Linux/Mac
```

3. **Install dependencies**:

```bash
pip install -r requirements.txt
```

If you don't have requirements.txt, install manually:

```bash
pip install django djangorestframework djangorestframework-simplejwt
```

4. **Run migrations**:

```bash
python manage.py migrate
```

5. **Create a superuser** (optional):

```bash
python manage.py createsuperuser
```

6. **Run the development server**:

```bash
python manage.py runserver
```

The API will be available at `http://127.0.0.1:8000/`

## API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token/` | POST | Obtain JWT tokens (phone + password) |
| `/api/token/refresh/` | POST | Refresh JWT token |
| `/api/login/` | POST | Alias for token endpoint |
| `/api/users/register/` | POST | Register new customer |
| `/api/users/me/` | GET | Get current user info |
| `/api/users/change_password/` | POST | Change password |

### Gyms

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gyms/` | GET | List approved gyms (public) |
| `/api/gyms/` | POST | Create gym (owner only) |
| `/api/gyms/{id}/` | GET | Get gym details |
| `/api/gyms/{id}/` | PUT | Update gym (owner only) |
| `/api/gyms/{id}/approve/` | POST | Approve/reject gym (admin) |
| `/api/gyms/{id}/images/` | POST | Upload gym images |
| `/api/gyms/{id}/fields/` | GET/POST | List/create fields |
| `/api/gyms/{id}/slots/` | GET/POST | List/create time slots |
| `/api/gyms/{id}/reviews/` | GET/POST | List/create reviews |
| `/api/gyms/{id}/discounts/` | GET/POST | List/create discounts |
| `/api/gyms/{id}/availability/` | GET | Get dynamic availability |

### Bookings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bookings/bookings/` | GET | List user/owner bookings |
| `/api/bookings/bookings/` | POST | Create new booking |
| `/api/bookings/bookings/{id}/` | GET | Get booking details |
| `/api/bookings/bookings/{id}/cancel/` | POST | Cancel booking |
| `/api/bookings/bookings/availability/` | GET | Check available slots |

### Payments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/booking/create-intent/` | POST | Create Stripe PaymentIntent for a booking |
| `/api/payments/booking/confirm/` | POST | Confirm booking payment by PaymentIntent id |
| `/api/payments/stripe/webhook/` | POST | Stripe webhook handler (PaymentIntent) |
| `/api/payments/tournament/` | POST | Tournament payment (mock, only if enabled) |
| `/api/payments/history/` | GET | Get payment history |

### Tournaments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tournaments/` | GET | List active tournaments |
| `/api/tournaments/` | POST | Create tournament (owner) |
| `/api/tournaments/{id}/` | GET | Get tournament details |
| `/api/tournaments/{id}/register/` | POST | Register team |
| `/api/tournaments/{id}/teams/` | GET | List tournament teams |
| `/api/tournaments/{id}/matches/` | GET/POST | List/create matches |
| `/api/tournaments/{id}/start_tournament/` | POST | Start tournament |
| `/api/tournaments/{id}/finish_tournament/` | POST | Finish tournament |

### Revenues

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/revenues/revenues/` | GET | List revenues (admin/owner) |
| `/api/revenues/revenues/summary/` | GET | Get revenue summary |
| `/api/revenues/revenues/by_gym/` | GET | Get revenues by gym |
| `/api/revenues/revenues/{id}/gym_detail/` | GET | Get gym revenue detail |

## Database Validation Rules

1. **Booking Time Overlap Prevention**: Bookings cannot overlap for the same field on the same date
2. **Review Uniqueness**: One review per user per gym
3. **Discount Validation**: Percentage must be 1-100, start_date <= end_date
4. **Revenue Type Constraints**: Foreign key requirements based on revenue type

## Permission Classes

- **IsAdminUser**: Admin-only access
- **IsOwner**: Gym owner access
- **IsCustomer**: Customer access
- **IsAdminOrOwner**: Admin or owner access
- **IsAdminOrOwnerOrReadOnly**: Read for all, write for admin/owner

## JWT Configuration

- Access token lifetime: 60 minutes
- Refresh token lifetime: 1 day
- Token endpoint: POST `/api/token/` (accepts phone + password)

## Testing the API

1. **Register a user**:
```bash
curl -X POST http://127.0.0.1:8000/api/users/register/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "1234567890", "full_name": "John Doe", "password": "password123", "password_confirm": "password123", "role": "customer"}'
```

2. **Login** to get tokens:
```bash
curl -X POST http://127.0.0.1:8000/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "1234567890", "password": "password123"}'
```

3. **Use the access token** for authenticated requests:
```bash
curl -X GET http://127.0.0.1:8000/api/gyms/ \
  -H "Authorization: Bearer <your_access_token>"
```

## Project Structure

```
back_end/
├── apps/
│   ├── users/         # User authentication and management
│   ├── gyms/          # Gym, field, time slot, discount, review models
│   ├── bookings/      # Booking models and discounts
│   ├── payments/      # Payment processing
│   ├── tournaments/   # Tournament, team, match models
│   └── revenues/      # Revenue tracking
└── project_confic/    # Django project settings
```

## License

MIT License
