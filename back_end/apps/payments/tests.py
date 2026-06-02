from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
import threading
import time

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.core import mail
from django.test import override_settings, TransactionTestCase
from django.test.testcases import skipUnlessDBFeature
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from apps.bookings.models import Booking, BookingAuditLog
from apps.gyms.models import Field, Gym
from .models import BookingPayment, StripeWebhookEvent, TournamentPayment, TournamentStripeWebhookAudit
from apps.revenues.models import GymRevenue
from .viewsets import _get_or_create_booking_payment_with_retry
from apps.tournaments.models import Tournament


class PaymentStripeFlowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            phone='0709000001',
            full_name='Admin',
            email='admin@example.com',
            password='pass1234',
            role='admin',
        )
        self.owner = user_model.objects.create_user(
            phone='0709000002',
            full_name='Owner',
            email='owner@example.com',
            password='pass1234',
            role='owner',
        )
        self.customer = user_model.objects.create_user(
            phone='0709000003',
            full_name='Customer',
            email='customer@example.com',
            password='pass1234',
            role='customer',
        )
        self.other_customer = user_model.objects.create_user(
            phone='0709000004',
            full_name='Other',
            email='other@example.com',
            password='pass1234',
            role='customer',
        )
        mail.outbox = []

        gym = Gym.objects.create(
            owner=self.owner,
            name='Stripe Gym',
            address='Addr',
            city='Kabul',
            phone='0799000999',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=3),
        )
        field = Field.objects.create(
            gym=gym,
            field_name='A',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1000.00'),
            is_available=True,
        )

        self.booking = Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=timezone.localdate() + timedelta(days=1),
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.tournament = Tournament.objects.create(
            gym=gym,
            created_by=self.owner,
            name='Spring Cup',
            sport_type='futsal',
            start_date=timezone.localdate() + timedelta(days=7),
            end_date=timezone.localdate() + timedelta(days=8),
            registration_fee=Decimal('500.00'),
            prize_amount=Decimal('1000.00'),
            max_teams=8,
            status='upcoming',
        )

    def unwrap(self, response):
        if isinstance(response.data, dict) and 'data' in response.data:
            return response.data['data']
        return response.data

    def team_members_payload(self):
        return [
            {'name': f'Player {index}', 'role': 'player'}
            for index in range(1, 8)
        ]

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_intent_creates_pending_payment_record(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_test_123', 'client_secret': 'cs_test_123'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.unwrap(response)['payment_intent_id'], 'pi_test_123')

        payment = BookingPayment.objects.get(booking=self.booking)
        self.assertEqual(payment.payment_status, 'pending')
        self.assertEqual(payment.gateway_name, 'stripe')
        self.assertEqual(payment.transaction_id, 'pi_test_123')

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_intent_rejects_nonexistent_booking(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_test_missing', 'client_secret': 'cs_test_missing'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': 999999},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_user_cannot_create_intent_for_other_users_booking(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_test_111', 'client_secret': 'cs_test_111'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.other_customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_intent_rejects_non_pending_booking(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_test_nonpending', 'client_secret': 'cs_test_nonpending'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.booking.status = 'confirmed'
        self.booking.save(update_fields=['status'])

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_duplicate_payment_prevention_for_success(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_test_a', 'client_secret': 'cs_test_a'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_existing_success',
            payment_status='success',
            paid_at=timezone.now(),
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_existing_pending_returns_same_intent(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_pending', 'client_secret': 'cs_pending'}
        )()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_pending', 'client_secret': 'cs_pending', 'status': 'requires_payment_method'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_pending',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response)['payment_intent_id'], 'pi_pending')
        self.assertEqual(
            BookingPayment.objects.filter(
                booking=self.booking,
                payment_status='pending',
            ).count(),
            1,
        )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', DEFAULT_FROM_EMAIL='bookings@example.com')
    def test_confirm_succeeded_marks_payment_success_and_booking_confirmed(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_confirm', 'status': 'succeeded', 'amount_received': 100000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_confirm',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                '/api/payments/booking/confirm/',
                {'payment_intent_id': 'pi_confirm'},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(payment.payment_status, 'success')
        self.assertEqual(self.booking.status, 'confirmed')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 1)
        self.assertEqual(
            BookingAuditLog.objects.filter(
                booking=self.booking,
                action='booking_confirmed',
                metadata__trigger='payment_success',
            ).count(),
            1,
        )
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Your booking is confirmed')
        self.assertEqual(self.unwrap(response)['booking']['status'], 'confirmed')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, 'Booking Confirmation')
        self.assertEqual(mail.outbox[0].from_email, 'bookings@example.com')
        self.assertIn(self.customer.full_name, mail.outbox[0].body)
        self.assertIn(str(self.booking.booking_id), mail.outbox[0].body)
        self.assertIn(self.booking.field.gym.name, mail.outbox[0].body)
        self.assertIn(self.booking.field.field_name, mail.outbox[0].body)
        self.assertIn(str(self.booking.booking_date), mail.outbox[0].body)
        self.assertIn(str(self.booking.start_time), mail.outbox[0].body)
        self.assertIn(str(self.booking.end_time), mail.outbox[0].body)
        self.assertIn(str(payment.amount), mail.outbox[0].body)
        self.assertIn(payment.currency, mail.outbox[0].body)
        self.assertIn(payment.payment_status, mail.outbox[0].body)
        self.assertIn(self.booking.status, mail.outbox[0].body)
        self.assertEqual(payment.confirmation_email_queued_at is not None, True)
        self.assertEqual(
            payment.confirmation_email_delivery_status,
            BookingPayment.ConfirmationEmailStatus.SENT,
        )
        self.assertEqual(payment.confirmation_email_last_error, '')

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_non_succeeded_rejected(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_pending_confirm', 'status': 'requires_action'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_pending_confirm',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/confirm/',
            {'payment_intent_id': 'pi_pending_confirm'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_stripe_error_response_is_sanitized(self, mock_get_stripe):
        class StripeError(Exception):
            pass

        stripe_module = type('StripeModule', (), {})()
        stripe_module.error = type('StripeErrorModule', (), {'StripeError': StripeError})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda _pid: (_ for _ in ()).throw(
            StripeError('provider-internal-token')
        )
        mock_get_stripe.return_value = (stripe_module, None)

        BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_confirm_stripe_error',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/confirm/',
            {'payment_intent_id': 'pi_confirm_stripe_error'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data['message'], 'Unable to verify payment status at this time.')
        self.assertNotIn('provider-internal-token', response.data['message'])

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_succeeded_with_amount_mismatch_marks_failed(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_confirm_mismatch', 'status': 'succeeded', 'amount_received': 99999, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_confirm_mismatch',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/confirm/',
            {'payment_intent_id': 'pi_confirm_mismatch'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Payment validation failed', response.data['message'])

        payment.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(payment.payment_status, 'failed')
        self.assertEqual(self.booking.status, 'pending')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    @patch(
        'apps.payments.viewsets.get_stripe_module',
        return_value=(None, 'Stripe SDK is not installed on the server.'),
    )
    def test_create_intent_returns_503_when_stripe_sdk_missing(self, _mock_get_stripe):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_intent_stripe_error_response_is_sanitized(self, mock_get_stripe):
        class StripeError(Exception):
            pass

        stripe_module = type('StripeModule', (), {})()
        stripe_module.error = type('StripeErrorModule', (), {'StripeError': StripeError})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: (_ for _ in ()).throw(
            StripeError('provider-secret-details')
        )
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data['message'],
            'Stripe is temporarily unreachable. Check the server internet or DNS connection and try again.',
        )
        self.assertEqual(response.data['error_code'], 'payment_provider_unavailable')
        self.assertNotIn('provider-secret-details', response.data['message'])

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_payment_intent_succeeded_updates_booking_and_payment(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_webhook_success',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_webhook_success',
                    'currency': 'usd',
                    'amount_received': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                '/api/payments/stripe/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='sig_test',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment = BookingPayment.objects.get(transaction_id='pi_webhook_success')
        self.assertEqual(payment.payment_status, 'success')
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'confirmed')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 1)
        self.assertEqual(
            BookingAuditLog.objects.filter(
                booking=self.booking,
                action='booking_confirmed',
                metadata__trigger='payment_success',
            ).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(str(self.booking.booking_id), mail.outbox[0].body)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_tournament_missing_payer_metadata_is_acknowledged_without_crash(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_tourn_missing_payer',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_tourn_missing_payer',
                    'currency': 'usd',
                    'amount_received': 50000,
                    'metadata': {
                        'tournament_id': str(self.tournament.tournament_id),
                        # user_id intentionally missing
                    },
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response), {'received': True})
        self.assertFalse(TournamentPayment.objects.filter(transaction_id='pi_tourn_missing_payer').exists())
        self.assertFalse(TournamentStripeWebhookAudit.objects.filter(payment_intent_id='pi_tourn_missing_payer').exists())

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_tournament_invalid_payer_metadata_is_acknowledged_without_crash(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_tourn_invalid_payer',
            'type': 'payment_intent.payment_failed',
            'data': {
                'object': {
                    'id': 'pi_tourn_invalid_payer',
                    'currency': 'usd',
                    'amount': 50000,
                    'metadata': {
                        'tournament_id': str(self.tournament.tournament_id),
                        'user_id': 'not-an-int',
                    },
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response), {'received': True})
        self.assertFalse(TournamentPayment.objects.filter(transaction_id='pi_tourn_invalid_payer').exists())
        self.assertFalse(TournamentStripeWebhookAudit.objects.filter(payment_intent_id='pi_tourn_invalid_payer').exists())

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_tournament_succeeded_creates_audit_record(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_tourn_success_audit',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_tourn_success_audit',
                    'currency': 'usd',
                    'amount_received': 50000,
                    'metadata': {
                        'tournament_id': str(self.tournament.tournament_id),
                        'user_id': str(self.customer.user_id),
                    },
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            TournamentStripeWebhookAudit.objects.filter(
                stripe_event__stripe_event_id='evt_tourn_success_audit',
                payment_intent_id='pi_tourn_success_audit',
                tournament=self.tournament,
                payer=self.customer,
                processed_at__isnull=False,
            ).exists()
        )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_tournament_intent_rejects_already_confirmed_team(self, mock_get_stripe):
        from apps.tournaments.models import Team

        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_should_not_be_created', 'client_secret': 'cs_should_not_be_created'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        confirmed_team = Team.objects.create(
            tournament=self.tournament,
            team_name='Confirmed Team',
            captain_name='Captain C',
            captain_phone='0797000001',
            status='confirmed',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/create-intent/',
            {
                'tournament_id': self.tournament.tournament_id,
                'team_id': confirmed_team.team_id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already paid and confirmed', response.data['message'])
        self.assertFalse(
            TournamentPayment.objects.filter(transaction_id='pi_should_not_be_created').exists()
        )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_tournament_intent_rejects_team_pending_owner_approval(self, mock_get_stripe):
        from apps.tournaments.models import Team

        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_should_not_be_created_pending', 'client_secret': 'cs_should_not_be_created_pending'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        pending_team = Team.objects.create(
            tournament=self.tournament,
            team_name='Pending Approval Team',
            captain_name='Captain P',
            captain_phone='0797000002',
            status='pending_owner_approval',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/create-intent/',
            {
                'tournament_id': self.tournament.tournament_id,
                'team_id': pending_team.team_id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pending owner approval', response.data['message'])

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_tournament_intent_stores_roster_for_new_registration(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_tourn_roster', 'client_secret': 'cs_tourn_roster'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/create-intent/',
            {
                'tournament_id': self.tournament.tournament_id,
                'team_name': 'Roster FC',
                'captain_name': 'Captain Roster',
                'captain_phone': '0797000100',
                'members': self.team_members_payload(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, msg=getattr(response, 'data', None))
        payment = TournamentPayment.objects.get(transaction_id='pi_tourn_roster')
        self.assertEqual(len(payment.metadata['members']), 7)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_tournament_intent_requires_exact_roster_for_new_registration(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_tourn_missing_roster', 'client_secret': 'cs_tourn_missing_roster'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/create-intent/',
            {
                'tournament_id': self.tournament.tournament_id,
                'team_name': 'Missing Roster FC',
                'captain_name': 'Captain Missing',
                'captain_phone': '0797000101',
                'members': self.team_members_payload()[:6],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(TournamentPayment.objects.filter(transaction_id='pi_tourn_missing_roster').exists())

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_create_tournament_intent_stripe_connection_error_is_retryable(self, mock_get_stripe):
        class StripeError(Exception):
            pass

        stripe_module = type('StripeModule', (), {})()
        stripe_module.error = type('StripeErrorModule', (), {'StripeError': StripeError})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: (_ for _ in ()).throw(
            StripeError('api.stripe.com dns failed')
        )
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/create-intent/',
            {
                'tournament_id': self.tournament.tournament_id,
                'team_name': 'Stripe Down FC',
                'captain_name': 'Captain Stripe',
                'captain_phone': '0797000102',
                'members': self.team_members_payload(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['error_code'], 'payment_provider_unavailable')
        self.assertNotIn('api.stripe.com dns failed', response.data['message'])

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_tournament_payment_marks_team_pending_owner_approval(self, mock_get_stripe):
        from apps.tournaments.models import Team

        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': payment_intent_id, 'status': 'succeeded', 'amount_received': 50000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = TournamentPayment.objects.create(
            tournament=self.tournament,
            team=None,
            payer=self.customer,
            gym=self.tournament.gym,
            amount=self.tournament.registration_fee,
            currency='USD',
            payment_gateway='stripe',
            transaction_id='pi_tourn_confirm_pending_owner',
            purpose=TournamentPayment.Purpose.REGISTRATION,
            metadata={
                'tournament_id': self.tournament.tournament_id,
                'team_name': 'Approval FC',
                'captain_name': 'Captain Approval',
                'captain_phone': '0797000003',
                'members': self.team_members_payload(),
            },
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/confirm/',
            {'payment_intent_id': 'pi_tourn_confirm_pending_owner'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response)['registration_status'], 'pending_owner_approval')

        payment.refresh_from_db()
        self.assertEqual(payment.payment_status, 'success')
        team = Team.objects.get(team_id=payment.team_id)
        self.assertEqual(team.status, 'pending_owner_approval')
        self.assertEqual(team.members.count(), 7)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_tournament_payment_missing_registration_meta_marks_failed(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': payment_intent_id, 'status': 'succeeded', 'amount_received': 50000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = TournamentPayment.objects.create(
            tournament=self.tournament,
            team=None,
            payer=self.customer,
            gym=self.tournament.gym,
            amount=self.tournament.registration_fee,
            currency='USD',
            payment_gateway='stripe',
            transaction_id='pi_tourn_confirm_missing_meta',
            purpose=TournamentPayment.Purpose.REGISTRATION,
            metadata={'tournament_id': self.tournament.tournament_id},
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/tournament/confirm/',
            {'payment_intent_id': 'pi_tourn_confirm_missing_meta'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Missing team registration details', response.data['message'])

        payment.refresh_from_db()
        self.assertEqual(payment.payment_status, 'failed')

    def test_tournamentpayment_null_team_pending_is_unique_per_tournament_and_payer(self):
        TournamentPayment.objects.create(
            tournament=self.tournament,
            team=None,
            payer=self.customer,
            gym=self.tournament.gym,
            amount=self.tournament.registration_fee,
            currency='USD',
            payment_gateway='stripe',
            transaction_id='pi_null_team_pending_1',
            payment_status='pending',
            paid_at=None,
        )
        with self.assertRaises(IntegrityError):
            TournamentPayment.objects.create(
                tournament=self.tournament,
                team=None,
                payer=self.customer,
                gym=self.tournament.gym,
                amount=self.tournament.registration_fee,
                currency='USD',
                payment_gateway='stripe',
                transaction_id='pi_null_team_pending_2',
                payment_status='pending',
                paid_at=None,
            )

    def test_tournamentpayment_null_team_success_is_unique_per_tournament_and_payer(self):
        TournamentPayment.objects.create(
            tournament=self.tournament,
            team=None,
            payer=self.customer,
            gym=self.tournament.gym,
            amount=self.tournament.registration_fee,
            currency='USD',
            payment_gateway='stripe',
            transaction_id='pi_null_team_success_1',
            payment_status='success',
            paid_at=timezone.now(),
        )
        with self.assertRaises(IntegrityError):
            TournamentPayment.objects.create(
                tournament=self.tournament,
                team=None,
                payer=self.customer,
                gym=self.tournament.gym,
                amount=self.tournament.registration_fee,
                currency='USD',
                payment_gateway='stripe',
                transaction_id='pi_null_team_success_2',
                payment_status='success',
                paid_at=timezone.now(),
            )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(
        STRIPE_SECRET_KEY='sk_test_123',
        STRIPE_WEBHOOK_SECRET='whsec_test',
        STRIPE_CURRENCY='usd',
    )
    def test_webhook_succeeded_with_currency_mismatch_marks_failed(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_webhook_currency_mismatch',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_webhook_currency_mismatch',
                    'currency': 'AFN',
                    'amount_received': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment = BookingPayment.objects.get(transaction_id='pi_webhook_currency_mismatch')
        self.assertEqual(payment.payment_status, 'failed')
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'pending')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 0)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_payment_intent_failed_marks_failed_and_keeps_booking_pending(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_webhook_failed',
            'type': 'payment_intent.payment_failed',
            'data': {
                'object': {
                    'id': 'pi_webhook_failed',
                    'currency': 'usd',
                    'amount': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment = BookingPayment.objects.get(transaction_id='pi_webhook_failed')
        self.assertEqual(payment.payment_status, 'failed')
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'pending')

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_invalid_signature_rejected(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()

        def _raise_invalid(_payload, _sig, _secret):
            raise ValueError('invalid signature')

        stripe_module.Webhook.construct_event = _raise_invalid
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='bad_sig',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_duplicate_webhook_delivery_is_idempotent_for_success(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_webhook_dup',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_webhook_dup',
                    'currency': 'usd',
                    'amount_received': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(
                '/api/payments/stripe/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='sig_test',
            )
            second = self.client.post(
                '/api/payments/stripe/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='sig_test',
            )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        self.assertEqual(BookingPayment.objects.filter(transaction_id='pi_webhook_dup').count(), 1)
        payment = BookingPayment.objects.get(transaction_id='pi_webhook_dup')
        self.assertEqual(payment.payment_status, 'success')
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'confirmed')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 1)
        self.assertEqual(StripeWebhookEvent.objects.filter(stripe_event_id='evt_webhook_dup').count(), 1)
        self.assertEqual(
            BookingAuditLog.objects.filter(
                booking=self.booking,
                action='booking_confirmed',
                metadata__trigger='payment_success',
            ).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_after_webhook_success_does_not_duplicate_email(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_confirm_after_webhook', 'status': 'succeeded', 'amount_received': 100000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_confirm_after_webhook',
            payment_status='success',
            confirmation_email_delivery_status=BookingPayment.ConfirmationEmailStatus.SENT,
            paid_at=timezone.now(),
            confirmation_email_queued_at=timezone.now(),
        )
        self.booking.status = 'confirmed'
        self.booking.save(update_fields=['status'])

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/confirm/',
            {'payment_intent_id': 'pi_confirm_after_webhook'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)
        payment.refresh_from_db()
        self.assertIsNotNone(payment.confirmation_email_queued_at)
        self.assertEqual(
            payment.confirmation_email_delivery_status,
            BookingPayment.ConfirmationEmailStatus.SENT,
        )

    @patch('apps.payments.email_utils.send_mail', side_effect=RuntimeError('smtp unavailable'))
    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_email_failure_does_not_mark_email_as_sent(self, mock_get_stripe, _mock_send_mail):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_confirm_email_fail', 'status': 'succeeded', 'amount_received': 100000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_confirm_email_fail',
            payment_status='pending',
            paid_at=None,
        )

        self.client.force_authenticate(self.customer)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                '/api/payments/booking/confirm/',
                {'payment_intent_id': 'pi_confirm_email_fail'},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(payment.payment_status, 'success')
        self.assertEqual(self.booking.status, 'confirmed')
        self.assertIsNone(payment.confirmation_email_queued_at)
        self.assertEqual(
            payment.confirmation_email_delivery_status,
            BookingPayment.ConfirmationEmailStatus.FAILED,
        )
        self.assertIn('smtp unavailable', payment.confirmation_email_last_error)
        self.assertEqual(len(mail.outbox), 0)

    @patch('apps.payments.email_utils.send_mail', side_effect=[RuntimeError('smtp unavailable'), 1])
    def test_booking_confirmation_email_retries_after_failed_delivery(self, _mock_send_mail):
        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_retry_email',
            payment_status='success',
            paid_at=timezone.now(),
        )
        self.booking.status = 'confirmed'
        self.booking.save(update_fields=['status'])

        from .email_utils import send_booking_confirmation_email

        send_booking_confirmation_email(booking_payment_id=payment.booking_payment_id)
        payment.refresh_from_db()
        self.assertEqual(
            payment.confirmation_email_delivery_status,
            BookingPayment.ConfirmationEmailStatus.FAILED,
        )
        self.assertIsNone(payment.confirmation_email_queued_at)

        send_booking_confirmation_email(booking_payment_id=payment.booking_payment_id)
        payment.refresh_from_db()
        self.assertEqual(
            payment.confirmation_email_delivery_status,
            BookingPayment.ConfirmationEmailStatus.SENT,
        )
        self.assertIsNotNone(payment.confirmation_email_queued_at)
        self.assertEqual(payment.confirmation_email_last_error, '')

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_duplicate_event_id_is_ignored(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_duplicate_once',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_duplicate_once',
                    'currency': 'usd',
                    'amount_received': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        first = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        second = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(BookingPayment.objects.filter(transaction_id='pi_duplicate_once').count(), 1)
        self.assertEqual(StripeWebhookEvent.objects.filter(stripe_event_id='evt_duplicate_once').count(), 1)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_missing_booking_mapping_is_acknowledged_without_retry(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_missing_booking',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_missing_booking',
                    'currency': 'usd',
                    'amount_received': 100000,
                    'metadata': {'booking_id': '99999999'},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response), {'received': True})
        self.assertTrue(
            StripeWebhookEvent.objects.filter(
                stripe_event_id='evt_missing_booking',
                processed_at__isnull=False,
            ).exists()
        )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_webhook_missing_payment_intent_id_is_acknowledged_without_retry(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_missing_pi',
            'type': 'payment_intent.succeeded',
            'data': {'object': {'currency': 'usd', 'metadata': {'booking_id': str(self.booking.booking_id)}}},
        }
        mock_get_stripe.return_value = (stripe_module, None)

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response), {'received': True})
        self.assertTrue(
            StripeWebhookEvent.objects.filter(
                stripe_event_id='evt_missing_pi',
                processed_at__isnull=False,
            ).exists()
        )

    def test_booking_payment_direct_create_endpoint_not_allowed(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/',
            {
                'booking': self.booking.booking_id,
                'amount': '1000.00',
                'currency': 'USD',
                'gateway_name': 'stripe',
                'transaction_id': 'pi_manual_forbidden',
                'payment_status': 'success',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    @override_settings(STRIPE_SECRET_KEY='sk_live_123')
    @patch('apps.payments.viewsets.get_stripe_module')
    def test_create_intent_allows_live_like_secret_key_format(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.create = lambda **kwargs: type(
            'Intent',
            (object,),
            {'id': 'pi_live_like_123', 'client_secret': 'cs_live_like_123'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.unwrap(response)['payment_intent_id'], 'pi_live_like_123')

    @override_settings(STRIPE_SECRET_KEY='')
    def test_create_intent_returns_503_for_missing_stripe_secret_key(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/create-intent/',
            {'booking_id': self.booking.booking_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Stripe secret key is not configured', response.data['message'])

    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='bad_webhook_key')
    def test_webhook_returns_503_for_invalid_webhook_secret(self):
        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Invalid Stripe webhook secret format', response.data['message'])

    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='')
    def test_webhook_returns_503_for_missing_webhook_secret(self):
        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Stripe webhook secret is not configured', response.data['message'])

    def test_booking_payment_get_or_create_race_recovers_existing_row(self):
        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_race_existing',
            payment_status='pending',
            paid_at=None,
        )

        with patch(
            'apps.payments.viewsets.BookingPayment.objects.get_or_create',
            side_effect=IntegrityError('duplicate key'),
        ):
            resolved, created = _get_or_create_booking_payment_with_retry(
                booking=self.booking,
                payment_intent_id='pi_race_existing',
                currency='usd',
                status_value='success',
            )

        self.assertFalse(created)
        self.assertEqual(resolved.booking_payment_id, payment.booking_payment_id)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_late_webhook_success_for_cancelled_booking_does_not_confirm_or_create_revenue(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.Webhook = type('Webhook', (), {})()
        stripe_module.Webhook.construct_event = lambda payload, sig, secret: {
            'id': 'evt_cancelled_late_success',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_cancelled_late_success',
                    'currency': 'usd',
                    'amount_received': 100000,
                    'metadata': {'booking_id': str(self.booking.booking_id)},
                }
            }
        }
        mock_get_stripe.return_value = (stripe_module, None)

        self.booking.status = 'cancelled'
        self.booking.save(update_fields=['status'])
        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_cancelled_late_success',
            payment_status='pending',
            paid_at=None,
        )

        response = self.client.post(
            '/api/payments/stripe/webhook/',
            data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='sig_test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.booking.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(self.booking.status, 'cancelled')
        self.assertEqual(payment.payment_status, 'failed')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 0)

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    def test_confirm_rejects_expired_unpaid_booking(self, mock_get_stripe):
        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {'id': 'pi_expired_confirm', 'status': 'succeeded', 'amount_received': 100000, 'currency': 'usd'}
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        payment = BookingPayment.objects.create(
            booking=self.booking,
            amount=self.booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_expired_confirm',
            payment_status='pending',
            paid_at=None,
        )
        Booking.objects.filter(pk=self.booking.pk).update(created_at=timezone.now() - timedelta(minutes=25))

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            '/api/payments/booking/confirm/',
            {'payment_intent_id': 'pi_expired_confirm'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['message'], 'Booking has expired because payment was not completed in time.')

        self.booking.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(self.booking.status, 'expired')
        self.assertEqual(payment.payment_status, 'failed')
        self.assertEqual(GymRevenue.objects.filter(booking_payment=payment).count(), 0)


class PaymentStripeConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(
            phone='0719000002',
            full_name='Owner',
            email='owner-concurrency@example.com',
            password='pass1234',
            role='owner',
            is_verified=True,
        )
        self.customer = user_model.objects.create_user(
            phone='0719000003',
            full_name='Customer',
            email='customer-concurrency@example.com',
            password='pass1234',
            role='customer',
            is_verified=True,
        )

        gym = Gym.objects.create(
            owner=self.owner,
            name='Stripe Gym Concurrent',
            address='Addr',
            city='Kabul',
            phone='0799111000',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=3),
        )
        field = Field.objects.create(
            gym=gym,
            field_name='B',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1000.00'),
            is_available=True,
        )

        self.booking = Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=timezone.localdate() + timedelta(days=1),
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

    @patch('apps.payments.viewsets.get_stripe_module')
    @override_settings(STRIPE_SECRET_KEY='sk_test_123')
    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_create_intent_creates_single_pending_row(self, mock_get_stripe):
        lock = threading.Lock()
        call_count = {'create': 0}

        stripe_module = type('StripeModule', (), {})()
        stripe_module.PaymentIntent = type('PaymentIntent', (), {})()

        def _create(**kwargs):
            with lock:
                call_count['create'] += 1
            # Keep create slow so the second request overlaps while first is in-flight.
            time.sleep(0.15)
            return type(
                'Intent',
                (object,),
                {'id': 'pi_concurrent_single', 'client_secret': 'cs_concurrent_single'}
            )()

        stripe_module.PaymentIntent.create = _create
        stripe_module.PaymentIntent.retrieve = lambda payment_intent_id: type(
            'Intent',
            (object,),
            {
                'id': 'pi_concurrent_single',
                'client_secret': 'cs_concurrent_single',
                'status': 'requires_payment_method',
            }
        )()
        mock_get_stripe.return_value = (stripe_module, None)

        def _request_create_intent():
            client = APIClient()
            client.force_authenticate(self.customer)
            return client.post(
                '/api/payments/booking/create-intent/',
                {'booking_id': self.booking.booking_id},
                format='json',
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _i: _request_create_intent(), [1, 2]))

        status_codes = sorted(response.status_code for response in responses)
        self.assertEqual(status_codes, [200, 201])
        self.assertEqual(call_count['create'], 1)
        self.assertEqual(
            BookingPayment.objects.filter(
                booking=self.booking,
                payment_status='pending',
            ).count(),
            1,
        )
