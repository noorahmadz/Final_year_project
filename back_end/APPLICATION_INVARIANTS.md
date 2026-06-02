## Application-layer invariant ownership map (authoritative)

This document defines **where key invariants live** in the application layer, to reduce duplication drift while preserving defense-in-depth.

### Rule ownership layers

- **DB constraint invariants**
  - Purpose: *hard* persistence correctness; protects against races and out-of-band writes.
  - Location: model `Meta.constraints` + migrations.
  - Examples: uniqueness, non-negative amounts, formula constraints.

- **Model/domain invariants**
  - Purpose: idempotent state transitions and domain semantics reusable by multiple entrypoints.
  - Location: model methods (e.g., `mark_success`, `mark_failed`) and small domain ops modules.

- **Serializer/request-shape validation**
  - Purpose: validate client input shape and business preconditions; return friendly errors.
  - Location: serializers `validate()` and field validators.

- **Transaction/service orchestration**
  - Purpose: locking, retries, idempotency keys, “read-validate-write” under `atomic()`.
  - Location: viewsets/actions or domain ops that explicitly wrap `transaction.atomic()`.

- **Viewset/action entrypoint checks**
  - Purpose: permissions, endpoint semantics, response shaping, legacy aliasing.
  - Location: viewsets/actions and function views.

---

## Bookings

- **Overlap prevention**
  - **Serializer**: `BookingCreateSerializer._validate_booking_window()` checks overlap via query.
  - **Transaction/service**: `_assert_no_overlap_with_lock()` under `atomic()` enforces overlap with row locking (defense-in-depth).
  - **DB constraint**: `Booking.booking_exact_active_interval_unique` blocks exact duplicate active intervals (portable fallback).

- **Gym eligibility gating**
  - **Serializer**: booking creation validates gym `status`, `is_deleted`, and `approval_expires_at`.

- **Idempotent creation**
  - **Transaction/service**: `BookingViewSet.create()` uses `BookingIdempotencyKey` + request hash under `atomic()`.

## Payments (booking payments)

- **Amount/currency invariants**
  - **Domain/helper**: expected amount/currency computed from `Booking.total_price` and `STRIPE_CURRENCY`.
  - **Transaction/service**: confirm and webhook both validate before marking success (defense-in-depth).

- **Webhook idempotency**
  - **DB/model**: `StripeWebhookEvent.stripe_event_id` unique.
  - **Transaction/service**: webhook uses `StripeWebhookEvent` lock + processed marker.

## Payments (tournament payments)

- **Payer attribution**
  - **Domain/helper**: derived from existing `TournamentPayment` row or validated Stripe metadata `user_id`.
  - **Webhook**: never depends on `request.user`.

- **Duplicate protection**
  - **DB constraint**:
    - single pending/success per `(tournament, team, payer)` when `team` is present
    - single pending/success per `(tournament, payer)` when `team IS NULL`

- **Payment state transitions**
  - **Model/domain**: `TournamentPayment.mark_success()` and `TournamentPayment.mark_failed()` are the single source of truth for idempotent transitions.
  - **Transaction/service**: confirm and webhook lock the row then call model methods.

- **Tournament webhook auditability**
  - **DB/model**: `TournamentStripeWebhookAudit` attaches tournament context to `StripeWebhookEvent` dedupe records.

## Revenues

- **Source linkage + math**
  - **DB constraint**: `GymRevenue` constraints enforce correct source association and net formula.
  - **Model/domain**: `GymRevenue.sync_from_*` provides controlled idempotent sync surfaces.

## Tournaments

- **Match overlap + result integrity**
  - **Serializer**: `MatchSerializer.validate()` enforces tournament/field/teams correctness and overlap checks.
  - **Transaction/service**: match creation locks field and re-checks overlap under `atomic()` (defense-in-depth).
  - **DB constraint**: match uniqueness and non-draw/result constraints protect persistence.

