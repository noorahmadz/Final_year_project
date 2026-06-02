from datetime import datetime, timedelta
from decimal import Decimal
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.db import IntegrityError
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.gyms.models import Discount, Field, Gym, TimeSlot
from .models import Booking, BookingAuditLog, BookingLifecycleMonitor
from apps.payments.models import BookingPayment


class BookingAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            email='admin@example.com',
            phone='0790000001',
            full_name='Admin',
            password='pass1234',
            role='admin',
        )
        self.owner = user_model.objects.create_user(
            email='owner@example.com',
            phone='0790000002',
            full_name='Owner',
            password='pass1234',
            role='owner',
        )
        self.customer = user_model.objects.create_user(
            email='customer@example.com',
            phone='0790000003',
            full_name='Customer',
            password='pass1234',
            role='customer',
        )
        self.other_customer = user_model.objects.create_user(
            email='other-customer@example.com',
            phone='0790000004',
            full_name='Other Customer',
            password='pass1234',
            role='customer',
        )

        self.gym = Gym.objects.create(
            owner=self.owner,
            name='Test Gym',
            address='Addr',
            city='Kabul',
            phone='0788000000',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=10),
        )
        self.field = Field.objects.create(
            gym=self.gym,
            field_name='Field 1',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1000.00'),
            is_available=True,
        )

        target_date = timezone.localdate() + timedelta(days=1)
        self.target_date = target_date
        TimeSlot.objects.create(
            field=self.field,
            day_of_week=target_date.weekday(),
            start_time=datetime.strptime('09:00:00', '%H:%M:%S').time(),
            end_time=datetime.strptime('12:00:00', '%H:%M:%S').time(),
            is_available=True,
        )

    def unwrap(self, response):
        if isinstance(response.data, dict) and 'data' in response.data:
            return response.data['data']
        return response.data

    def results(self, response):
        payload = self.unwrap(response)
        if isinstance(payload, dict) and 'results' in payload:
            return payload['results']
        return payload

    def test_booking_creation(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.unwrap(response)['status'], 'pending')

    def test_overlap_prevention(self):
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:30:00',
            end_time='10:30:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )
        self.client.force_authenticate(self.other_customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '10:00:00',
                'end_time': '11:00:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_time_validation(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '11:00:00',
                'end_time': '10:00:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_based_access_list(self):
        own = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.create(
            user=self.other_customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('bookings:booking-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['booking_id'] for item in self.results(response)}
        self.assertIn(own.booking_id, ids)
        self.assertEqual(len(ids), 1)

        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('bookings:booking-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_owner_booking = self.results(response)[0]
        self.assertIn('customer_email', first_owner_booking)
        self.assertIn('customer_phone', first_owner_booking)
        owner_ids = {item['booking_id'] for item in self.results(response)}
        self.assertEqual(len(owner_ids), 2)

        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('bookings:booking-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        admin_ids = {item['booking_id'] for item in self.results(response)}
        self.assertEqual(len(admin_ids), 2)

    def test_cancellation_rules(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='completed',
        )
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-cancel', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        booking.status = 'pending'
        booking.save(update_fields=['status'])
        Booking.objects.filter(pk=booking.pk).update(created_at=timezone.now() - timedelta(minutes=10))
        response = self.client.post(
            reverse('bookings:booking-cancel', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'cancelled')

    def test_confirm_action_without_successful_payment_is_blocked(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        BookingPayment.objects.create(
            booking=booking,
            amount=booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_test_confirm_without_success',
            payment_status='failed',
            paid_at=None,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('bookings:booking-confirm', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['message'], 'Booking cannot be confirmed without successful payment.')
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'pending')

    def test_cancel_after_20_minutes_is_blocked(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='11:00:00',
            end_time='12:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.filter(pk=booking.pk).update(created_at=timezone.now() - timedelta(minutes=21))

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-cancel', args=[booking.booking_id]),
            {'reason': 'Too late'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['message'],
            'Booking has expired because payment was not completed in time.',
        )
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'expired')
        self.assertFalse(
            BookingAuditLog.objects.filter(booking=booking, action='booking_cancelled').exists()
        )

    def test_cancel_after_20_minutes_is_blocked_for_user_owner_and_admin(self):
        actors = [self.customer, self.owner, self.admin]

        for index, actor in enumerate(actors, start=1):
            booking = Booking.objects.create(
                user=self.customer,
                field=self.field,
                booking_date=self.target_date,
                start_time=f'{8 + index:02d}:00:00',
                end_time=f'{9 + index:02d}:00:00',
                total_price=Decimal('1000.00'),
                status='pending',
            )
            Booking.objects.filter(pk=booking.pk).update(created_at=timezone.now() - timedelta(minutes=25))

            self.client.force_authenticate(actor)
            response = self.client.post(
                reverse('bookings:booking-cancel', args=[booking.booking_id]),
                {'reason': 'Too late'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(
                response.data['message'],
                'Booking has expired because payment was not completed in time.',
            )
            booking.refresh_from_db()
            self.assertEqual(booking.status, 'expired')

    def test_availability_calculation(self):
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:30:00',
            end_time='10:00:00',
            total_price=Decimal('500.00'),
            status='confirmed',
        )
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:15:00',
            end_time='11:00:00',
            total_price=Decimal('750.00'),
            status='pending',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.get(
            reverse('bookings:booking-availability'),
            {'field_id': self.field.field_id, 'date': self.target_date.isoformat()},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.unwrap(response)['available_slots'],
            [
                {'start': '09:00:00', 'end': '09:30:00'},
                {'start': '10:00:00', 'end': '10:15:00'},
                {'start': '11:00:00', 'end': '12:00:00'},
            ],
        )

    def test_confirm_action_admin_can_confirm_pending(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        BookingPayment.objects.create(
            booking=booking,
            amount=booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_test_confirm_pending',
            payment_status='success',
            paid_at=timezone.now(),
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('bookings:booking-confirm', args=[booking.booking_id]), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'confirmed')

    def test_confirm_action_owner_and_customer_forbidden(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        self.client.force_authenticate(self.owner)
        owner_response = self.client.post(reverse('bookings:booking-confirm', args=[booking.booking_id]), {}, format='json')
        self.assertEqual(owner_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.customer)
        customer_response = self.client.post(reverse('bookings:booking-confirm', args=[booking.booking_id]), {}, format='json')
        self.assertEqual(customer_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_confirm_action_rejects_cancelled_completed_and_already_confirmed(self):
        self.client.force_authenticate(self.admin)
        cancelled = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='09:30:00',
            total_price=Decimal('500.00'),
            status='cancelled',
        )
        completed = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:30:00',
            end_time='10:00:00',
            total_price=Decimal('500.00'),
            status='completed',
        )
        confirmed = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='10:30:00',
            total_price=Decimal('500.00'),
            status='confirmed',
        )
        for booking, transaction_id in [
            (cancelled, 'pi_test_cancelled_confirm'),
            (completed, 'pi_test_completed_confirm'),
            (confirmed, 'pi_test_confirmed_confirm'),
        ]:
            BookingPayment.objects.create(
                booking=booking,
                amount=booking.total_price,
                currency='USD',
                gateway_name='stripe',
                transaction_id=transaction_id,
                payment_status='success',
                paid_at=timezone.now(),
            )

        self.assertEqual(
            self.client.post(reverse('bookings:booking-confirm', args=[cancelled.booking_id]), {}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(reverse('bookings:booking-confirm', args=[completed.booking_id]), {}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(reverse('bookings:booking-confirm', args=[confirmed.booking_id]), {}, format='json').status_code,
            status.HTTP_200_OK,
        )

    def test_owner_cannot_update_booking_for_own_gym(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking.booking_id]),
            {'start_time': '10:30:00', 'end_time': '11:30:00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_can_update_own_editable_booking(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking.booking_id]),
            {'start_time': '10:30:00', 'end_time': '11:30:00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_confirmed_or_completed_booking_cannot_be_updated(self):
        self.client.force_authenticate(self.customer)
        for state in ['confirmed', 'completed']:
            booking = Booking.objects.create(
                user=self.customer,
                field=self.field,
                booking_date=self.target_date,
                start_time='09:00:00',
                end_time='10:00:00',
                total_price=Decimal('1000.00'),
                status=state,
            )
            response = self.client.patch(
                reverse('bookings:booking-detail', args=[booking.booking_id]),
                {'start_time': '10:30:00', 'end_time': '11:30:00'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancelled_booking_cannot_be_updated(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='cancelled',
        )
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking.booking_id]),
            {'start_time': '10:30:00', 'end_time': '11:30:00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_rejects_overlap(self):
        base = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.create(
            user=self.other_customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:15:00',
            end_time='11:15:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[base.booking_id]),
            {'start_time': '10:30:00', 'end_time': '11:00:00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_rejects_outside_timeslot(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking.booking_id]),
            {'start_time': '08:00:00', 'end_time': '09:00:00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_for_today_with_past_start_time_rejected(self):
        today = timezone.localdate()
        TimeSlot.objects.filter(field=self.field).delete()
        TimeSlot.objects.create(
            field=self.field,
            day_of_week=today.weekday(),
            start_time='00:00:00',
            end_time='23:59:59',
            is_available=True,
        )

        now_local = timezone.localtime()
        start = (now_local + timedelta(minutes=30)).time().replace(microsecond=0)
        end = (now_local + timedelta(minutes=60)).time().replace(microsecond=0)
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=today,
            start_time=start,
            end_time=end,
            total_price=Decimal('500.00'),
            status='pending',
        )

        past_start = (now_local - timedelta(minutes=30)).time().replace(microsecond=0)
        future_end = (now_local + timedelta(minutes=30)).time().replace(microsecond=0)

        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking.booking_id]),
            {'start_time': past_start.strftime('%H:%M:%S'), 'end_time': future_end.strftime('%H:%M:%S')},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_discount_title_fallback_not_used(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
                'discount_code': 'Weekend',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount_code', response.data['errors'])

    def test_complete_action_admin_can_complete_confirmed(self):
        past_date = timezone.localdate() - timedelta(days=1)
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=past_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('bookings:booking-complete', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'completed')

    def test_complete_action_rejects_pending_cancelled_completed(self):
        self.client.force_authenticate(self.admin)

        pending = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='09:30:00',
            total_price=Decimal('500.00'),
            status='pending',
        )
        cancelled = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:30:00',
            end_time='10:00:00',
            total_price=Decimal('500.00'),
            status='cancelled',
        )
        completed = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='10:30:00',
            total_price=Decimal('500.00'),
            status='completed',
        )

        self.assertEqual(
            self.client.post(reverse('bookings:booking-complete', args=[pending.booking_id]), {}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(reverse('bookings:booking-complete', args=[cancelled.booking_id]), {}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(reverse('bookings:booking-complete', args=[completed.booking_id]), {}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_complete_action_owner_and_customer_forbidden(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:30:00',
            end_time='11:00:00',
            total_price=Decimal('500.00'),
            status='confirmed',
        )

        self.client.force_authenticate(self.owner)
        owner_response = self.client.post(
            reverse('bookings:booking-complete', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(owner_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.customer)
        customer_response = self.client.post(
            reverse('bookings:booking-complete', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(customer_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manual_confirm_requires_successful_payment(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='11:00:00',
            end_time='12:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('bookings:booking-confirm', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['message'],
            'Booking cannot be confirmed without successful payment.',
        )

    def test_manual_confirm_allowed_after_successful_payment(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='08:00:00',
            end_time='09:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        BookingPayment.objects.create(
            booking=booking,
            amount=booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_booking_confirm_after_success',
            payment_status='success',
            paid_at=timezone.now(),
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('bookings:booking-confirm', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'confirmed')
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Your booking is confirmed')

    def test_complete_action_rejects_before_end_time(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('bookings:booking-complete', args=[booking.booking_id]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['message'],
            'Booking cannot be completed before its end time.',
        )

    def test_list_does_not_auto_complete_due_confirmed_bookings(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=yesterday,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('bookings:booking-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'confirmed')

    def test_sync_booking_lifecycle_completes_due_confirmed_bookings(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=yesterday,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )

        call_command('sync_booking_lifecycle')
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'completed')

    def test_booking_audit_logs_created_for_lifecycle_events(self):
        self.client.force_authenticate(self.customer)
        create_response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        booking_id = self.unwrap(create_response)['booking_id']

        booking = Booking.objects.get(booking_id=booking_id)
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_created').exists()
        )

        update_response = self.client.patch(
            reverse('bookings:booking-detail', args=[booking_id]),
            {'start_time': '10:00:00', 'end_time': '11:00:00'},
            format='json',
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_updated').exists()
        )

        BookingPayment.objects.create(
            booking=booking,
            amount=booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_test_audit_confirm',
            payment_status='success',
            paid_at=timezone.now(),
        )

        self.client.force_authenticate(self.admin)
        confirm_response = self.client.post(
            reverse('bookings:booking-confirm', args=[booking_id]),
            {},
            format='json',
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_confirmed').exists()
        )

        booking.booking_date = timezone.localdate() - timedelta(days=1)
        booking.save(update_fields=['booking_date'])

        complete_response = self.client.post(
            reverse('bookings:booking-complete', args=[booking_id]),
            {},
            format='json',
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_completed').exists()
        )

    def test_cancel_action_logs_event(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='11:00:00',
            end_time='12:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-cancel', args=[booking.booking_id]),
            {'reason': 'Plans changed'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_cancelled').exists()
        )

    def test_expiry_command_expires_unpaid_pending_booking(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='11:00:00',
            end_time='12:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.filter(pk=booking.pk).update(created_at=timezone.now() - timedelta(minutes=25))

        call_command('sync_expired_bookings')

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'expired')
        self.assertTrue(
            BookingAuditLog.objects.filter(booking=booking, action='booking_expired').exists()
        )

    def test_expired_booking_releases_slot_for_new_booking(self):
        expired = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.filter(pk=expired.pk).update(created_at=timezone.now() - timedelta(minutes=25))
        call_command('sync_expired_bookings')

        self.client.force_authenticate(self.other_customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_paid_booking_cannot_be_cancelled(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        BookingPayment.objects.create(
            booking=booking,
            amount=booking.total_price,
            currency='USD',
            gateway_name='stripe',
            transaction_id='pi_paid_cancel_blocked',
            payment_status='success',
            paid_at=timezone.now(),
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-cancel', args=[booking.booking_id]),
            {'reason': 'try cancel paid'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['message'], 'Paid bookings cannot be cancelled through this endpoint.')
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'pending')

    def test_booking_serializer_exposes_mobile_metadata(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('bookings:booking-detail', args=[booking.booking_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data['data']
        self.assertEqual(payload['payment_status'], 'unpaid')
        self.assertTrue(payload['can_pay'])
        self.assertTrue(payload['can_cancel'])
        self.assertIn('pay', payload['next_actions'])

    def test_past_booking_date_rejected(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': (timezone.localdate() - timedelta(days=1)).isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_today_with_past_start_time_rejected(self):
        now_local = timezone.localtime()
        past_start = (now_local - timedelta(minutes=30)).time().replace(microsecond=0)
        future_end = (now_local + timedelta(minutes=30)).time().replace(microsecond=0)
        TimeSlot.objects.get(field=self.field, day_of_week=self.target_date.weekday()).delete()
        TimeSlot.objects.create(
            field=self.field,
            day_of_week=timezone.localdate().weekday(),
            start_time='00:00:00',
            end_time='23:59:59',
            is_available=True,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': timezone.localdate().isoformat(),
                'start_time': past_start.strftime('%H:%M:%S'),
                'end_time': future_end.strftime('%H:%M:%S'),
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_today_with_future_start_time_accepted(self):
        now_local = timezone.localtime()
        start = (now_local + timedelta(minutes=30)).time().replace(microsecond=0)
        end = (now_local + timedelta(minutes=90)).time().replace(microsecond=0)
        TimeSlot.objects.get(field=self.field, day_of_week=self.target_date.weekday()).delete()
        TimeSlot.objects.create(
            field=self.field,
            day_of_week=timezone.localdate().weekday(),
            start_time='00:00:00',
            end_time='23:59:59',
            is_available=True,
        )

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': timezone.localdate().isoformat(),
                'start_time': start.strftime('%H:%M:%S'),
                'end_time': end.strftime('%H:%M:%S'),
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_db_level_exact_active_interval_uniqueness(self):
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        with self.assertRaises(IntegrityError):
            Booking.objects.create(
                user=self.other_customer,
                field=self.field,
                booking_date=self.target_date,
                start_time='09:00:00',
                end_time='10:00:00',
                total_price=Decimal('1000.00'),
                status='confirmed',
            )

    def test_booking_interval_datetimes_populated_on_create(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        expected_start, expected_end = Booking.build_interval_datetimes(
            self.target_date,
            datetime.strptime('09:00:00', '%H:%M:%S').time(),
            datetime.strptime('10:00:00', '%H:%M:%S').time(),
        )
        self.assertEqual(booking.start_datetime, expected_start)
        self.assertEqual(booking.end_datetime, expected_end)

    def test_booking_interval_datetimes_sync_on_save(self):
        booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        updated_date = self.target_date + timedelta(days=1)
        booking.booking_date = updated_date
        booking.start_time = datetime.strptime('10:30:00', '%H:%M:%S').time()
        booking.end_time = datetime.strptime('11:30:00', '%H:%M:%S').time()
        booking.save(update_fields=['booking_date', 'start_time', 'end_time'])
        booking.refresh_from_db()

        expected_start, expected_end = Booking.build_interval_datetimes(
            updated_date,
            datetime.strptime('10:30:00', '%H:%M:%S').time(),
            datetime.strptime('11:30:00', '%H:%M:%S').time(),
        )
        self.assertEqual(booking.start_datetime, expected_start)
        self.assertEqual(booking.end_datetime, expected_end)

    @skipUnless(connection.vendor == 'postgresql', 'PostgreSQL exclusion constraint only.')
    def test_db_level_postgres_overlap_exclusion_blocks_serializer_bypass_overlap(self):
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        with self.assertRaises(IntegrityError):
            Booking.objects.create(
                user=self.other_customer,
                field=self.field,
                booking_date=self.target_date,
                start_time='09:30:00',
                end_time='10:30:00',
                total_price=Decimal('1000.00'),
                status='confirmed',
            )

    @skipUnless(connection.vendor == 'postgresql', 'PostgreSQL exclusion constraint only.')
    def test_db_level_postgres_overlap_exclusion_allows_adjacent_active_bookings(self):
        Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )

        adjacent = Booking.objects.create(
            user=self.other_customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )
        self.assertIsNotNone(adjacent.booking_id)

    def test_idempotency_same_key_same_payload_returns_same_booking(self):
        self.client.force_authenticate(self.customer)
        payload = {
            'field': self.field.field_id,
            'booking_date': self.target_date.isoformat(),
            'start_time': '09:00:00',
            'end_time': '10:00:00',
        }

        first = self.client.post(
            reverse('bookings:booking-list'),
            payload,
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-1',
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            reverse('bookings:booking-list'),
            payload,
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-1',
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(first)['booking_id'], self.unwrap(second)['booking_id'])
        self.assertEqual(Booking.objects.count(), 1)

    def test_idempotency_same_key_different_payload_returns_conflict(self):
        self.client.force_authenticate(self.customer)

        first = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-2',
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '10:00:00',
                'end_time': '11:00:00',
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-2',
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Booking.objects.count(), 1)

    def test_idempotency_key_in_body_supported(self):
        self.client.force_authenticate(self.customer)
        payload = {
            'field': self.field.field_id,
            'booking_date': self.target_date.isoformat(),
            'start_time': '09:00:00',
            'end_time': '10:00:00',
            'idempotency_key': 'book-body-1',
        }

        first = self.client.post(reverse('bookings:booking-list'), payload, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(reverse('bookings:booking-list'), payload, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(first)['booking_id'], self.unwrap(second)['booking_id'])

    def test_different_idempotency_keys_can_create_different_valid_bookings(self):
        self.client.force_authenticate(self.customer)

        first = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-3-a',
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '10:00:00',
                'end_time': '11:00:00',
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY='book-3-b',
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(self.unwrap(first)['booking_id'], self.unwrap(second)['booking_id'])
        self.assertEqual(Booking.objects.count(), 2)

    def test_create_rate_throttle_limits_requests(self):
        self.client.force_authenticate(self.customer)

        for i in range(5):
            start_hour = 9 + i
            response = self.client.post(
                reverse('bookings:booking-list'),
                {
                    'field': self.field.field_id,
                    'booking_date': self.target_date.isoformat(),
                    'start_time': f'{start_hour:02d}:00:00',
                    'end_time': f'{start_hour:02d}:10:00',
                },
                format='json',
            )
            self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])

        throttled = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '11:00:00',
                'end_time': '11:10:00',
            },
            format='json',
        )
        self.assertEqual(throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_availability_rate_throttle_limits_requests(self):
        self.client.force_authenticate(self.customer)

        for _ in range(60):
            response = self.client.get(
                reverse('bookings:booking-availability'),
                {'field_id': self.field.field_id, 'date': self.target_date.isoformat()},
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        throttled = self.client.get(
            reverse('bookings:booking-availability'),
            {'field_id': self.field.field_id, 'date': self.target_date.isoformat()},
        )
        self.assertEqual(throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @skipUnless(any(f.name == 'code' for f in Discount._meta.fields), 'Discount model has no code field.')
    def test_discount_code_valid_applies_when_supported(self):
        discount_kwargs = {
            'gym': self.gym,
            'title': 'Weekend',
            'percentage': 10,
            'start_date': timezone.localdate() - timedelta(days=1),
            'end_date': timezone.localdate() + timedelta(days=5),
            'is_active': True,
            'code': 'WEEK10',
        }
        discount = Discount.objects.create(**discount_kwargs)

        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
                'discount_code': 'WEEK10',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(booking_id=self.unwrap(response)['booking_id'])
        self.assertTrue(booking.booking_discounts.filter(discount=discount).exists())

    @skipUnless(any(f.name == 'code' for f in Discount._meta.fields), 'Discount model has no code field.')
    def test_discount_code_invalid_rejected_when_supported(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('bookings:booking-list'),
            {
                'field': self.field.field_id,
                'booking_date': self.target_date.isoformat(),
                'start_time': '09:00:00',
                'end_time': '10:00:00',
                'discount_code': 'INVALIDCODE',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount_code', response.data['errors'])

    def test_booking_legacy_route_disabled_by_default(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get('/api/bookings/bookings/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(BOOKING_LIFECYCLE_MAX_STALENESS_SECONDS=300)
    def test_sync_booking_lifecycle_updates_monitor_and_health_check(self):
        expired_booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        due_booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=timezone.localdate() - timedelta(days=1),
            start_time='10:00:00',
            end_time='11:00:00',
            total_price=Decimal('1000.00'),
            status='confirmed',
        )
        Booking.objects.filter(pk=expired_booking.pk).update(created_at=timezone.now() - timedelta(minutes=25))

        call_command('sync_booking_lifecycle')
        call_command('check_booking_lifecycle_health')

        expired_booking.refresh_from_db()
        due_booking.refresh_from_db()
        monitor = BookingLifecycleMonitor.objects.get(monitor_key='booking_lifecycle')

        self.assertEqual(expired_booking.status, 'expired')
        self.assertEqual(due_booking.status, 'completed')
        self.assertIsNotNone(monitor.last_success_at)
        self.assertEqual(monitor.last_expired_count, 1)
        self.assertEqual(monitor.last_completed_count, 1)

    def test_sync_booking_lifecycle_is_idempotent_across_repeated_runs(self):
        expired_booking = Booking.objects.create(
            user=self.customer,
            field=self.field,
            booking_date=self.target_date,
            start_time='09:00:00',
            end_time='10:00:00',
            total_price=Decimal('1000.00'),
            status='pending',
        )
        Booking.objects.filter(pk=expired_booking.pk).update(created_at=timezone.now() - timedelta(minutes=25))

        call_command('sync_booking_lifecycle')
        first_monitor = BookingLifecycleMonitor.objects.get(monitor_key='booking_lifecycle')
        first_counts = (first_monitor.last_expired_count, first_monitor.last_completed_count)

        call_command('sync_booking_lifecycle')
        second_monitor = BookingLifecycleMonitor.objects.get(monitor_key='booking_lifecycle')
        second_counts = (second_monitor.last_expired_count, second_monitor.last_completed_count)

        expired_booking.refresh_from_db()
        self.assertEqual(expired_booking.status, 'expired')
        self.assertEqual(first_counts, (1, 0))
        self.assertEqual(second_counts, (0, 0))
