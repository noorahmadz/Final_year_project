from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.bookings.models import Booking
from apps.expenses.models import GymExpense
from apps.gyms.models import Field, Gym
from apps.payments.models import BookingPayment, TournamentPayment
from apps.revenues.models import GymRevenue
from apps.tournaments.models import Team, Tournament
from apps.users.models import User


class RevenueBaseTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-revenue@example.com',
            phone='710000001',
            full_name='Admin',
            password='pass123',
            role='admin',
            is_staff=True,
            is_verified=True,
        )
        self.owner = User.objects.create_user(
            email='owner-revenue@example.com',
            phone='710000002',
            full_name='Owner 1',
            password='pass123',
            role='owner',
            is_verified=True,
        )
        self.owner_two = User.objects.create_user(
            email='owner-two-revenue@example.com',
            phone='710000003',
            full_name='Owner 2',
            password='pass123',
            role='owner',
            is_verified=True,
        )
        self.customer = User.objects.create_user(
            email='customer-revenue@example.com',
            phone='710000004',
            full_name='Customer',
            password='pass123',
            role='customer',
            is_verified=True,
        )

        self.gym1 = Gym.objects.create(
            owner=self.owner,
            name='Gym One',
            address='A',
            city='Kandahar',
            phone='0700000101',
            status='approved',
        )
        self.gym2 = Gym.objects.create(
            owner=self.owner_two,
            name='Gym Two',
            address='B',
            city='Kandahar',
            phone='0700000102',
            status='approved',
        )

        self.field1 = Field.objects.create(
            gym=self.gym1,
            field_name='Field 1',
            field_type='futsal',
            price_per_hour=Decimal('800'),
        )
        self.field2 = Field.objects.create(
            gym=self.gym2,
            field_name='Field 2',
            field_type='futsal',
            price_per_hour=Decimal('900'),
        )

        self.booking1 = Booking.objects.create(
            user=self.customer,
            field=self.field1,
            booking_date=date.today(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            total_price=Decimal('1000'),
            status='confirmed',
        )
        self.booking2 = Booking.objects.create(
            user=self.customer,
            field=self.field2,
            booking_date=date.today(),
            start_time=time(10, 0),
            end_time=time(11, 0),
            total_price=Decimal('1200'),
            status='confirmed',
        )

        self.payment1 = BookingPayment.objects.create(
            booking=self.booking1,
            amount=Decimal('1000'),
            gateway_name='stripe',
            transaction_id='txn-1',
            payment_status='success',
        )
        self.payment2 = BookingPayment.objects.create(
            booking=self.booking2,
            amount=Decimal('1200'),
            gateway_name='stripe',
            transaction_id='txn-2',
            payment_status='success',
        )

        self.tournament = Tournament.objects.create(
            gym=self.gym1,
            created_by=self.owner,
            name='Cup',
            sport_type='futsal',
            start_date=date.today(),
            end_date=date.today(),
            registration_fee=Decimal('500'),
            prize_amount=Decimal('1000'),
            max_teams=4,
            status='upcoming',
        )
        self.champion = Team.objects.create(
            tournament=self.tournament,
            team_name='Champion',
            captain_name='Cap',
            captain_phone='0790000001',
        )
        self.runner_up = Team.objects.create(
            tournament=self.tournament,
            team_name='Runner Up',
            captain_name='Cap Two',
            captain_phone='0790000002',
        )
        self.tournament.status = 'finished'
        self.tournament.champion_team = self.champion
        self.tournament.runner_up_team = self.runner_up
        self.tournament.save(update_fields=['status', 'champion_team', 'runner_up_team'])

        self.tournament_payment = TournamentPayment.objects.create(
            tournament=self.tournament,
            team=self.champion,
            payer=self.customer,
            gym=self.gym1,
            amount=Decimal('500'),
            currency='USD',
            payment_gateway='stripe',
            transaction_id='tourn-txn-1',
            payment_status='success',
        )

    def set_revenue_created_at(self, revenue, created_at):
        GymRevenue.objects.filter(revenue_id=revenue.revenue_id).update(created_at=created_at)
        revenue.refresh_from_db()
        return revenue

    def unwrap(self, response):
        if isinstance(response.data, dict) and 'data' in response.data:
            return response.data['data']
        return response.data


class RevenuePermissionAndWriteSafetyTests(RevenueBaseTestCase):
    def test_public_writes_are_blocked(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('revenues:revenue-list'), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_customer_cannot_view_revenue_summary(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('revenues:revenue-summary'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_only_sees_own_gym_revenue(self):
        GymRevenue.sync_from_booking_payment(self.payment1, commission_amount=Decimal('100'))
        GymRevenue.sync_from_booking_payment(self.payment2, commission_amount=Decimal('120'))

        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('revenues:revenue-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self.unwrap(response)['results']), 1)
        self.assertEqual(self.unwrap(response)['results'][0]['gym'], self.gym1.gym_id)

    def test_sync_endpoints_are_admin_only(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            reverse('revenues:revenue-sync-booking'),
            {'booking_payment_id': self.payment1.booking_payment_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RevenueSyncAndIdempotencyTests(RevenueBaseTestCase):
    def test_sync_booking_creates_and_is_idempotent(self):
        self.client.force_authenticate(self.admin)
        payload = {
            'booking_payment_id': self.payment1.booking_payment_id,
            'commission_amount': '100.00',
        }
        first = self.client.post(reverse('revenues:revenue-sync-booking'), payload, format='json')
        second = self.client.post(reverse('revenues:revenue-sync-booking'), payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(GymRevenue.objects.filter(booking_payment=self.payment1).count(), 1)

    def test_sync_booking_rejects_non_success_payment(self):
        failed_payment = BookingPayment.objects.create(
            booking=self.booking1,
            amount=Decimal('1000'),
            gateway_name='stripe',
            transaction_id='txn-failed',
            payment_status='failed',
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('revenues:revenue-sync-booking'),
            {'booking_payment_id': failed_payment.booking_payment_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sync_tournament_creates_and_is_idempotent(self):
        self.client.force_authenticate(self.admin)
        payload = {
            'tournament_id': self.tournament.tournament_id,
            'commission_amount': '50.00',
        }
        first = self.client.post(reverse('revenues:revenue-sync-tournament'), payload, format='json')
        second = self.client.post(reverse('revenues:revenue-sync-tournament'), payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(GymRevenue.objects.filter(tournament_payment=self.tournament_payment).count(), 1)

    def test_revenue_integrity_command_passes_for_traceable_rows(self):
        GymRevenue.sync_from_booking_payment(self.payment1, commission_amount=Decimal('100'))
        GymRevenue.sync_from_tournament(self.tournament, commission_amount=Decimal('50'))
        call_command('check_revenue_integrity')


class RevenueIntegrityTests(RevenueBaseTestCase):
    def test_db_enforces_net_formula(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GymRevenue.objects.create(
                    gym=self.gym1,
                    revenue_type='booking',
                    booking_payment=self.payment1,
                    amount=Decimal('1000'),
                    commission_amount=Decimal('100'),
                    net_amount=Decimal('950'),
                    status='completed',
                )

    def test_db_enforces_non_negative_amounts(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GymRevenue.objects.create(
                    gym=self.gym1,
                    revenue_type='booking',
                    booking_payment=self.payment1,
                    amount=Decimal('-1'),
                    commission_amount=Decimal('0'),
                    net_amount=Decimal('-1'),
                    status='completed',
                )

    def test_model_clean_validates_source_gym_consistency(self):
        revenue = GymRevenue(
            gym=self.gym2,
            revenue_type='booking',
            booking_payment=self.payment1,
            amount=Decimal('1000'),
            commission_amount=Decimal('100'),
            net_amount=Decimal('900'),
            status='completed',
        )
        with self.assertRaises(ValidationError):
            revenue.clean()


class RevenueReportingTests(RevenueBaseTestCase):
    def setUp(self):
        super().setUp()
        GymRevenue.sync_from_booking_payment(self.payment1, commission_amount=Decimal('100'))
        GymRevenue.sync_from_booking_payment(self.payment2, commission_amount=Decimal('120'))
        GymRevenue.sync_from_tournament(self.tournament, commission_amount=Decimal('50'))

    def test_summary_endpoint_returns_reliable_totals(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2700'))
        self.assertEqual(Decimal(payload['total_commission']), Decimal('270'))
        self.assertEqual(Decimal(payload['total_net']), Decimal('2430'))

    def test_by_gym_endpoint_counts_are_correct(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-by-gym'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(len(payload['results']), 2)
        first = [row for row in payload['results'] if row['gym__gym_id'] == self.gym1.gym_id][0]
        self.assertEqual(first['booking_count'], 1)
        self.assertEqual(first['tournament_count'], 1)

    def test_clean_gym_report_endpoint_works(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            reverse('revenues:revenue-gym-report', kwargs={'gym_id': self.gym1.gym_id})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response)['gym']['gym_id'], self.gym1.gym_id)


class RevenuePeriodReportingTests(RevenueBaseTestCase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone

        self.booking_revenue_recent = GymRevenue.sync_from_booking_payment(
            self.payment1,
            commission_amount=Decimal('100'),
        )
        self.booking_revenue_old = GymRevenue.sync_from_booking_payment(
            self.payment2,
            commission_amount=Decimal('120'),
        )
        self.tournament_revenue = GymRevenue.sync_from_tournament(
            self.tournament,
            commission_amount=Decimal('50'),
        )[0]

        now = timezone.now()
        self.set_revenue_created_at(self.booking_revenue_recent, now)
        self.set_revenue_created_at(self.booking_revenue_old, now - timezone.timedelta(days=10))
        self.set_revenue_created_at(self.tournament_revenue, now - timezone.timedelta(days=40))

    def test_summary_supports_delay_period(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'delay', 'days': '7'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'delay')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('1000'))
        self.assertIsNotNone(payload['range']['date_from'])
        self.assertIsNotNone(payload['range']['date_to'])

    def test_summary_supports_weekly_period(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'weekly'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'weekly')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('1000'))

    def test_summary_supports_monthly_period_with_multiple_weeks(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'weekly', 'weeks': '4'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'weekly')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2200'))

    def test_summary_supports_monthly_period(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'monthly'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'monthly')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2200'))

    def test_summary_supports_multi_month_period(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'monthly', 'months': '6'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'monthly')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2700'))

    def test_invalid_period_is_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'yearly'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('period must be one of', response.data['message'])

    def test_invalid_days_weeks_months_are_rejected(self):
        self.client.force_authenticate(self.admin)

        bad_days = self.client.get(reverse('revenues:revenue-summary'), {'period': 'delay', 'days': '0'})
        bad_weeks = self.client.get(reverse('revenues:revenue-summary'), {'period': 'weekly', 'weeks': '-1'})
        bad_months = self.client.get(reverse('revenues:revenue-summary'), {'period': 'monthly', 'months': 'abc'})

        self.assertEqual(bad_days.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_weeks.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_months.status_code, status.HTTP_400_BAD_REQUEST)

    def test_explicit_date_filters_override_period_logic(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            reverse('revenues:revenue-summary'),
            {
                'date_from': str(date.today() - timedelta(days=20)),
                'date_to': str(date.today()),
                'period': 'monthly',
                'months': '6',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'custom')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2200'))

    def test_owner_scope_is_preserved_for_period_summary(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'monthly', 'months': '6'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(self.unwrap(response)['total_revenue']), Decimal('1500'))

    def test_customer_is_still_blocked_for_period_summary(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('revenues:revenue-summary'), {'period': 'monthly'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_gym_report_includes_period_metadata(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            reverse('revenues:revenue-gym-report', kwargs={'gym_id': self.gym1.gym_id}),
            {'period': 'monthly', 'months': '6'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'monthly')
        self.assertIn('range', payload)


class OwnerFinanceSummaryTests(RevenueBaseTestCase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone

        self.booking_revenue = GymRevenue.sync_from_booking_payment(
            self.payment1,
            commission_amount=Decimal('100'),
        )
        self.other_owner_revenue = GymRevenue.sync_from_booking_payment(
            self.payment2,
            commission_amount=Decimal('120'),
        )
        self.tournament_revenue = GymRevenue.sync_from_tournament(
            self.tournament,
            commission_amount=Decimal('50'),
        )[0]

        now = timezone.now()
        self.set_revenue_created_at(self.booking_revenue, now)
        self.set_revenue_created_at(self.other_owner_revenue, now)
        self.set_revenue_created_at(self.tournament_revenue, now - timezone.timedelta(days=20))

        self.owner_rent = GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_RENT,
            amount=Decimal('8000.00'),
            expense_date=date.today(),
            notes='Owner rent',
            created_by=self.owner,
        )
        self.owner_electricity = GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_ELECTRICITY,
            amount=Decimal('3000.00'),
            expense_date=date.today() - timedelta(days=2),
            notes='Owner electricity',
            created_by=self.owner,
        )
        self.other_owner_salary = GymExpense.objects.create(
            gym=self.gym2,
            expense_type=GymExpense.EXPENSE_STAFF_SALARY,
            amount=Decimal('4000.00'),
            expense_date=date.today(),
            notes='Other owner staff salary',
            created_by=self.owner_two,
        )

    def test_owner_finance_summary_is_owner_scoped(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('revenues:revenue-owner-finance-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('1500.00'))
        self.assertEqual(Decimal(payload['booking_revenue']), Decimal('1000.00'))
        self.assertEqual(Decimal(payload['tournament_revenue']), Decimal('500.00'))
        self.assertEqual(Decimal(payload['total_commission']), Decimal('150.00'))
        self.assertEqual(Decimal(payload['total_net']), Decimal('1350.00'))
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('11000.00'))
        self.assertEqual(Decimal(payload['rent_total']), Decimal('8000.00'))
        self.assertEqual(Decimal(payload['electricity_total']), Decimal('3000.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('0.00'))

    def test_admin_finance_summary_includes_all_gyms(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('revenues:revenue-owner-finance-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('2700.00'))
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('15000.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('4000.00'))

    def test_customer_cannot_access_owner_finance_summary(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('revenues:revenue-owner-finance-summary'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_finance_summary_supports_gym_filter(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            reverse('revenues:revenue-owner-finance-summary'),
            {'gym_id': str(self.gym1.gym_id)},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('1500.00'))
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('11000.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('0.00'))

    def test_owner_finance_summary_supports_date_filters(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            reverse('revenues:revenue-owner-finance-summary'),
            {
                'date_from': str(date.today() - timedelta(days=7)),
                'date_to': str(date.today()),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'custom')
        self.assertEqual(Decimal(payload['total_revenue']), Decimal('1000.00'))
        self.assertEqual(Decimal(payload['tournament_revenue']), Decimal('0.00'))
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('11000.00'))

    def test_owner_finance_summary_returns_zero_expenses_when_none_match(self):
        self.client.force_authenticate(self.owner_two)
        response = self.client.get(
            reverse('revenues:revenue-owner-finance-summary'),
            {
                'date_from': str(date.today() - timedelta(days=30)),
                'date_to': str(date.today() - timedelta(days=10)),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('0.00'))
        self.assertEqual(Decimal(payload['rent_total']), Decimal('0.00'))
        self.assertEqual(Decimal(payload['electricity_total']), Decimal('0.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('0.00'))


class OwnerFinanceSummaryProfitTests(RevenueBaseTestCase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone

        self.payment1.amount = Decimal('30000.00')
        self.payment1.save(update_fields=['amount'])
        self.tournament_payment.amount = Decimal('24000.00')
        self.tournament_payment.save(update_fields=['amount'])

        self.owner_booking_revenue = GymRevenue.sync_from_booking_payment(
            self.payment1,
            commission_amount=Decimal('0.00'),
        )
        self.other_owner_revenue = GymRevenue.sync_from_booking_payment(
            self.payment2,
            commission_amount=Decimal('0.00'),
        )
        self.owner_tournament_revenue = GymRevenue.sync_from_tournament(
            self.tournament,
            commission_amount=Decimal('0.00'),
        )[0]

        self.set_revenue_created_at(
            self.owner_booking_revenue,
            timezone.make_aware(datetime(2026, 4, 5, 9, 0, 0)),
        )
        self.set_revenue_created_at(
            self.owner_tournament_revenue,
            timezone.make_aware(datetime(2026, 4, 18, 12, 0, 0)),
        )
        self.set_revenue_created_at(
            self.other_owner_revenue,
            timezone.make_aware(datetime(2026, 4, 7, 15, 0, 0)),
        )

        GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_RENT,
            amount=Decimal('8000.00'),
            expense_date=date(2026, 4, 1),
            notes='April rent',
            created_by=self.owner,
        )
        GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_ELECTRICITY,
            amount=Decimal('3000.00'),
            expense_date=date(2026, 4, 8),
            notes='April electricity',
            created_by=self.owner,
        )
        GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_STAFF_SALARY,
            amount=Decimal('4000.00'),
            expense_date=date(2026, 4, 14),
            notes='April salary',
            created_by=self.owner,
        )
        GymExpense.objects.create(
            gym=self.gym2,
            expense_type=GymExpense.EXPENSE_RENT,
            amount=Decimal('9000.00'),
            expense_date=date(2026, 4, 6),
            notes='Other owner rent',
            created_by=self.owner_two,
        )

    def test_owner_finance_summary_calculates_final_profit(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('revenues:revenue-owner-finance-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['booking_revenue'], '30000.00')
        self.assertEqual(payload['tournament_revenue'], '24000.00')
        self.assertEqual(payload['total_revenue'], '54000.00')
        self.assertEqual(payload['total_commission'], '0.00')
        self.assertEqual(payload['total_net'], '54000.00')
        self.assertEqual(payload['total_expenses'], '15000.00')
        self.assertEqual(payload['final_profit'], '39000.00')

    def test_owner_finance_summary_date_filters_exclude_outside_records(self):
        from django.utils import timezone

        march_booking = Booking.objects.create(
            user=self.customer,
            field=self.field1,
            booking_date=date(2026, 3, 28),
            start_time=time(11, 0),
            end_time=time(12, 0),
            total_price=Decimal('7000.00'),
            status='confirmed',
        )
        march_payment = BookingPayment.objects.create(
            booking=march_booking,
            amount=Decimal('7000.00'),
            gateway_name='stripe',
            transaction_id='txn-march-owner',
            payment_status='success',
        )
        march_revenue = GymRevenue.sync_from_booking_payment(
            march_payment,
            commission_amount=Decimal('0.00'),
        )
        self.set_revenue_created_at(
            march_revenue,
            timezone.make_aware(datetime(2026, 3, 28, 10, 0, 0)),
        )
        GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_RENT,
            amount=Decimal('2500.00'),
            expense_date=date(2026, 3, 29),
            notes='March rent carryover',
            created_by=self.owner,
        )

        self.client.force_authenticate(self.owner)
        response = self.client.get(
            reverse('revenues:revenue-owner-finance-summary'),
            {
                'date_from': '2026-04-01',
                'date_to': '2026-04-30',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['period'], 'custom')
        self.assertEqual(payload['total_revenue'], '54000.00')
        self.assertEqual(payload['total_net'], '54000.00')
        self.assertEqual(payload['total_expenses'], '15000.00')
        self.assertEqual(payload['final_profit'], '39000.00')
