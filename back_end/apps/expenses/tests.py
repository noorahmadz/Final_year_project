from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.gyms.models import Gym

from .models import GymExpense


class ExpenseApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            phone='0709000101',
            full_name='Admin',
            email='admin-expenses@example.com',
            password='pass1234',
            role='admin',
        )
        self.owner = user_model.objects.create_user(
            phone='0709000102',
            full_name='Owner',
            email='owner-expenses@example.com',
            password='pass1234',
            role='owner',
        )
        self.other_owner = user_model.objects.create_user(
            phone='0709000103',
            full_name='Other Owner',
            email='other-owner-expenses@example.com',
            password='pass1234',
            role='owner',
        )
        self.customer = user_model.objects.create_user(
            phone='0709000104',
            full_name='Customer',
            email='customer-expenses@example.com',
            password='pass1234',
            role='customer',
        )

        self.gym1 = Gym.objects.create(
            owner=self.owner,
            name='Owner Gym',
            address='Addr 1',
            city='Kabul',
            phone='0799000101',
            status='approved',
        )
        self.gym2 = Gym.objects.create(
            owner=self.other_owner,
            name='Other Gym',
            address='Addr 2',
            city='Herat',
            phone='0799000102',
            status='approved',
        )

        self.expense1 = GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_RENT,
            amount=Decimal('8000.00'),
            expense_date=date(2026, 4, 5),
            notes='April rent',
            created_by=self.owner,
        )
        self.expense2 = GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_ELECTRICITY,
            amount=Decimal('3000.00'),
            expense_date=date(2026, 4, 10),
            notes='Power bill',
            created_by=self.owner,
        )
        self.expense3 = GymExpense.objects.create(
            gym=self.gym2,
            expense_type=GymExpense.EXPENSE_STAFF_SALARY,
            amount=Decimal('4000.00'),
            expense_date=date(2026, 4, 12),
            notes='Staff payroll',
            created_by=self.other_owner,
        )

    @staticmethod
    def unwrap(response):
        if isinstance(response.data, dict) and 'data' in response.data:
            return response.data['data']
        return response.data

    def test_owner_can_create_expense_for_own_gym(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            reverse('expenses:expense-list'),
            {
                'gym': self.gym1.gym_id,
                'expense_type': GymExpense.EXPENSE_STAFF_SALARY,
                'amount': '4500.00',
                'expense_date': '2026-04-15',
                'notes': 'Referee support staff',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = GymExpense.objects.get(notes='Referee support staff')
        self.assertEqual(created.created_by_id, self.owner.user_id)
        self.assertEqual(created.gym_id, self.gym1.gym_id)
        self.assertEqual(created.amount, Decimal('4500.00'))

    def test_owner_cannot_create_expense_for_another_owners_gym(self):
        self.client.force_authenticate(self.owner)
        original_count = GymExpense.objects.count()
        response = self.client.post(
            reverse('expenses:expense-list'),
            {
                'gym': self.gym2.gym_id,
                'expense_type': GymExpense.EXPENSE_RENT,
                'amount': '2000.00',
                'expense_date': '2026-04-20',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('gym', response.data['errors'])
        self.assertEqual(GymExpense.objects.count(), original_count)
        self.assertIn('your own gyms', response.data['errors']['gym'][0].lower())

    def test_owner_list_returns_only_own_gym_expenses(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('expenses:expense-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self.unwrap(response)['results']
        self.assertEqual(len(results), 2)
        self.assertTrue(all(item['gym'] == self.gym1.gym_id for item in results))

    def test_admin_list_returns_all_expenses(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('expenses:expense-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(response)['count'], 3)

    def test_customer_cannot_list_or_create_expenses(self):
        self.client.force_authenticate(self.customer)
        list_response = self.client.get(reverse('expenses:expense-list'))
        create_response = self.client.post(
            reverse('expenses:expense-list'),
            {
                'gym': self.gym1.gym_id,
                'expense_type': GymExpense.EXPENSE_RENT,
                'amount': '1200.00',
                'expense_date': '2026-04-22',
            },
            format='json',
        )

        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_cannot_access_expense_summary(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse('expenses:expense-summary'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_respects_owner_scope(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(reverse('expenses:expense-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('11000.00'))
        self.assertEqual(Decimal(payload['rent_total']), Decimal('8000.00'))
        self.assertEqual(Decimal(payload['electricity_total']), Decimal('3000.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('0.00'))

    def test_summary_supports_date_filters(self):
        GymExpense.objects.create(
            gym=self.gym1,
            expense_type=GymExpense.EXPENSE_STAFF_SALARY,
            amount=Decimal('2500.00'),
            expense_date=date(2026, 3, 28),
            notes='March payroll',
            created_by=self.owner,
        )

        self.client.force_authenticate(self.owner)
        response = self.client.get(
            reverse('expenses:expense-summary'),
            {
                'date_from': '2026-04-01',
                'date_to': '2026-04-30',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(Decimal(payload['total_expenses']), Decimal('11000.00'))
        self.assertEqual(Decimal(payload['rent_total']), Decimal('8000.00'))
        self.assertEqual(Decimal(payload['electricity_total']), Decimal('3000.00'))
        self.assertEqual(Decimal(payload['staff_salary_total']), Decimal('0.00'))

    def test_summary_returns_zero_totals_for_owner_with_no_expenses(self):
        user_model = get_user_model()
        empty_owner = user_model.objects.create_user(
            phone='0709000105',
            full_name='Empty Owner',
            email='empty-owner-expenses@example.com',
            password='pass1234',
            role='owner',
        )
        Gym.objects.create(
            owner=empty_owner,
            name='Empty Gym',
            address='Addr 3',
            city='Mazar',
            phone='0799000103',
            status='approved',
        )

        self.client.force_authenticate(empty_owner)
        response = self.client.get(reverse('expenses:expense-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.unwrap(response)
        self.assertEqual(payload['total_expenses'], '0.00')
        self.assertEqual(payload['rent_total'], '0.00')
        self.assertEqual(payload['electricity_total'], '0.00')
        self.assertEqual(payload['staff_salary_total'], '0.00')

    def test_filters_work_for_gym_type_and_date_range(self):
        self.client.force_authenticate(self.admin)

        by_gym = self.client.get(reverse('expenses:expense-list'), {'gym_id': self.gym1.gym_id})
        by_type = self.client.get(
            reverse('expenses:expense-list'),
            {'expense_type': GymExpense.EXPENSE_ELECTRICITY},
        )
        by_date = self.client.get(
            reverse('expenses:expense-list'),
            {'date_from': '2026-04-06', 'date_to': '2026-04-12'},
        )

        self.assertEqual(by_gym.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(by_gym)['count'], 2)
        self.assertEqual(by_type.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(by_type)['count'], 1)
        self.assertEqual(by_date.status_code, status.HTTP_200_OK)
        self.assertEqual(self.unwrap(by_date)['count'], 2)

    def test_invalid_date_filter_returns_400(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('expenses:expense-list'), {'date_from': '2026-99-01'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('date_from', response.data['errors'])

    def test_non_positive_amount_is_rejected(self):
        self.client.force_authenticate(self.owner)
        for amount in ('0.00', '-100.00'):
            with self.subTest(amount=amount):
                original_count = GymExpense.objects.count()
                response = self.client.post(
                    reverse('expenses:expense-list'),
                    {
                        'gym': self.gym1.gym_id,
                        'expense_type': GymExpense.EXPENSE_RENT,
                        'amount': amount,
                        'expense_date': '2026-04-25',
                    },
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('amount', response.data['errors'])
                self.assertEqual(GymExpense.objects.count(), original_count)

    def test_invalid_expense_type_is_rejected(self):
        self.client.force_authenticate(self.owner)
        original_count = GymExpense.objects.count()
        response = self.client.post(
            reverse('expenses:expense-list'),
            {
                'gym': self.gym1.gym_id,
                'expense_type': 'marketing',
                'amount': '1200.00',
                'expense_date': '2026-04-25',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expense_type', response.data['errors'])
        self.assertEqual(GymExpense.objects.count(), original_count)
