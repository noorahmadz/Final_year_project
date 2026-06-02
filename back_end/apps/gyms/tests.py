from decimal import Decimal
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.bookings.models import Booking
from .models import Gym, Field, TimeSlot, Discount, GymAuditLog, Review


class GymsSecurityTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            email='admin-gyms@example.com',
            phone='0700000001',
            full_name='Admin User',
            password='pass1234',
            role='admin'
        )
        self.owner = user_model.objects.create_user(
            email='owner-gyms@example.com',
            phone='0700000002',
            full_name='Owner User',
            password='pass1234',
            role='owner'
        )
        self.customer = user_model.objects.create_user(
            email='customer-gyms@example.com',
            phone='0700000003',
            full_name='Customer User',
            password='pass1234',
            role='customer'
        )

        self.owner_gym = Gym.objects.create(
            owner=self.owner,
            name='Owner Gym',
            address='Owner Address',
            city='Kabul',
            phone='0799000000',
            status='pending'
        )
        self.approved_gym = Gym.objects.create(
            owner=self.owner,
            name='Approved Gym',
            address='Approved Address',
            city='Kabul',
            phone='0799000001',
            status='approved'
        )
        self.field = Field.objects.create(
            gym=self.approved_gym,
            field_name='Court A',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1000.00'),
            is_available=True
        )

    def _gym_payload(self, name='New Gym'):
        return {
            'owner': self.owner.user_id,
            'name': name,
            'address': 'Some Address',
            'city': 'Kabul',
            'description': 'Test',
            'phone': '0788000000',
            'status': 'pending'
        }

    def test_gym_creation_permission(self):
        url = reverse('gyms:gym-list')

        self.client.force_authenticate(user=self.customer)
        response = self.client.post(url, self._gym_payload('Customer Gym'), format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(url, self._gym_payload('Owner Gym 2'), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(url, self._gym_payload('Admin Gym 2'), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_gym_deletion_permission(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Delete Gym',
            address='Addr',
            city='Kabul',
            phone='0777000000',
            status='approved'
        )
        url = reverse('gyms:gym-detail', args=[gym.gym_id])

        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Gym.objects.filter(gym_id=gym.gym_id).exists())

        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        gym.refresh_from_db()
        self.assertTrue(gym.is_deleted)

    def test_field_creation_permission(self):
        url = reverse('gyms:field-list')
        payload = {
            'gym': self.approved_gym.gym_id,
            'field_name': 'Court B',
            'field_type': 'futsal',
            'capacity': 10,
            'price_per_hour': '1200.00',
            'is_available': True
        }

        self.client.force_authenticate(user=self.customer)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_slot_creation_permission(self):
        url = reverse('gyms:timeslot-list')
        payload = {
            'field': self.field.field_id,
            'day_of_week': 0,
            'start_time': '09:00:00',
            'end_time': '10:00:00',
            'is_available': True
        }

        self.client.force_authenticate(user=self.customer)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_discount_creation_permission(self):
        url = reverse('gyms:discount-list')
        payload = {
            'gym': self.approved_gym.gym_id,
            'title': 'Weekend',
            'percentage': 10,
            'start_date': '2026-03-01',
            'end_date': '2026-03-31',
            'is_active': True
        }

        self.client.force_authenticate(user=self.customer)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_gym_approval_workflow(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Approval Gym',
            address='Addr',
            city='Kabul',
            phone='0766000000',
            status='pending'
        )
        url = reverse('gyms:gym-approve', args=[gym.gym_id])

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(url, {'status': 'approved'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(url, {'status': 'approved'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        gym.refresh_from_db()
        self.assertEqual(gym.status, 'approved')
        self.assertEqual(gym.approved_by, self.admin)
        self.assertIsNotNone(gym.approved_at)

    def test_public_access_filtering(self):
        pending_gym = Gym.objects.create(
            owner=self.owner,
            name='Pending Gym',
            address='Addr',
            city='Kabul',
            phone='0755000000',
            status='pending'
        )

        list_url = reverse('gyms:gym-list')
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        returned_ids = {item['gym_id'] for item in results}
        self.assertIn(self.approved_gym.gym_id, returned_ids)
        self.assertNotIn(pending_gym.gym_id, returned_ids)

        retrieve_url = reverse('gyms:gym-detail', args=[pending_gym.gym_id])
        response = self.client.get(retrieve_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        nested_fields_url = reverse('gyms:gym-fields', args=[pending_gym.gym_id])
        response = self.client.get(nested_fields_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_gym_list_is_ordered_by_newest_first(self):
        older_approved_gym = Gym.objects.create(
            owner=self.owner,
            name='Older Approved Gym',
            address='Older Addr',
            city='Kabul',
            phone='0755000001',
            status='approved'
        )
        newest_approved_gym = Gym.objects.create(
            owner=self.owner,
            name='Newest Approved Gym',
            address='Newest Addr',
            city='Kabul',
            phone='0755000002',
            status='approved'
        )

        response = self.client.get(reverse('gyms:gym-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data['data']['results']
        returned_ids = [item['gym_id'] for item in results]

        self.assertEqual(
            returned_ids,
            [
                newest_approved_gym.gym_id,
                older_approved_gym.gym_id,
                self.approved_gym.gym_id,
            ],
        )

    def test_availability_endpoint_correctness(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Availability Gym',
            address='Addr',
            city='Kabul',
            phone='0744000000',
            status='approved'
        )
        field = Field.objects.create(
            gym=gym,
            field_name='Court Availability',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1300.00'),
            is_available=True
        )
        TimeSlot.objects.create(
            field=field,
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(12, 0),
            is_available=True
        )

        target_date = date(2026, 3, 9)
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(9, 30),
            end_time=time(10, 0),
            total_price=Decimal('100.00'),
            status='pending'
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(9, 45),
            end_time=time(10, 45),
            total_price=Decimal('100.00'),
            status='confirmed'
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(10, 30),
            end_time=time(11, 0),
            total_price=Decimal('100.00'),
            status='confirmed'
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(11, 30),
            end_time=time(12, 0),
            total_price=Decimal('100.00'),
            status='pending'
        )

        url = reverse('gyms:gym-availability', args=[gym.gym_id])
        response = self.client.get(url, {'date': '2026-03-09'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        ranges = response.data[0]['available_slots']
        self.assertEqual(
            ranges,
            [
                {'start': '09:00:00', 'end': '09:30:00'},
                {'start': '11:00:00', 'end': '11:30:00'}
            ]
        )

    def test_booking_and_gym_availability_use_consistent_interval_logic(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Consistency Gym',
            address='Addr',
            city='Kabul',
            phone='0703999000',
            status='approved'
        )
        field = Field.objects.create(
            gym=gym,
            field_name='Court',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('1300.00'),
            is_available=True
        )
        TimeSlot.objects.create(
            field=field,
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(12, 0),
            is_available=True
        )
        target_date = date(2026, 3, 9)  # Monday
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(9, 30),
            end_time=time(10, 0),
            total_price=Decimal('100.00'),
            status='confirmed'
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=target_date,
            start_time=time(10, 15),
            end_time=time(11, 0),
            total_price=Decimal('100.00'),
            status='pending'
        )

        self.client.force_authenticate(user=self.customer)
        booking_avail = self.client.get(
            reverse('bookings:booking-availability'),
            {'field_id': field.field_id, 'date': '2026-03-09'}
        )
        self.assertEqual(booking_avail.status_code, status.HTTP_200_OK)

        gym_avail = self.client.get(
            reverse('gyms:gym-availability', args=[gym.gym_id]),
            {'date': '2026-03-09'}
        )
        self.assertEqual(gym_avail.status_code, status.HTTP_200_OK)
        self.assertEqual(len(gym_avail.data), 1)
        gym_ranges = gym_avail.data[0]['available_slots']

        self.assertEqual(
            gym_ranges,
            booking_avail.data['available_slots']
        )

    def test_admin_can_approve_gym_with_expiry_time(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Expiry Approval Gym',
            address='Addr',
            city='Kabul',
            phone='0733000000',
            status='pending'
        )
        expiry = timezone.now() + timedelta(days=30)
        url = reverse('gyms:gym-approve', args=[gym.gym_id])

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            url,
            {'status': 'approved', 'approval_expires_at': expiry.isoformat()},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        gym.refresh_from_db()
        self.assertEqual(gym.status, 'approved')
        self.assertIsNotNone(gym.approval_expires_at)

    def test_approved_gym_visible_before_expiry(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Visible Before Expiry',
            address='Addr',
            city='Kabul',
            phone='0722000000',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=1)
        )

        list_url = reverse('gyms:gym-list')
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        returned_ids = {item['gym_id'] for item in results}
        self.assertIn(gym.gym_id, returned_ids)

    def test_expired_approved_gym_not_visible_to_public(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Expired Gym',
            address='Addr',
            city='Kabul',
            phone='0711000000',
            status='approved',
            approval_expires_at=timezone.now() - timedelta(hours=1)
        )

        list_url = reverse('gyms:gym-list')
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        returned_ids = {item['gym_id'] for item in results}
        self.assertNotIn(gym.gym_id, returned_ids)

        retrieve_url = reverse('gyms:gym-detail', args=[gym.gym_id])
        response = self.client.get(retrieve_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_expired_gym_visibility_check_does_not_mutate_status(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Pending Transition Gym',
            address='Addr',
            city='Kabul',
            phone='0701000000',
            status='approved',
            approval_expires_at=timezone.now() - timedelta(minutes=5)
        )

        # GET should remain read-only and not synchronize state.
        self.client.get(reverse('gyms:gym-list'))

        gym.refresh_from_db()
        self.assertEqual(gym.status, 'approved')

    def test_rejected_gym_not_visible_to_public(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Rejected Gym',
            address='Addr',
            city='Kabul',
            phone='0702000002',
            status='rejected'
        )
        list_response = self.client.get(reverse('gyms:gym-list'))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        results = list_response.data['results'] if isinstance(list_response.data, dict) else list_response.data
        returned_ids = {item['gym_id'] for item in results}
        self.assertNotIn(gym.gym_id, returned_ids)

    def test_reject_flow_still_works_normally(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Reject Gym',
            address='Addr',
            city='Kabul',
            phone='0702000000',
            status='pending'
        )
        url = reverse('gyms:gym-approve', args=[gym.gym_id])

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(url, {'status': 'rejected'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        gym.refresh_from_db()
        self.assertEqual(gym.status, 'rejected')

    def test_soft_deleted_gym_hidden_from_public_list_and_retrieve(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Soft Deleted Public',
            address='Addr',
            city='Kabul',
            phone='0703000000',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=5),
            is_deleted=True
        )

        list_response = self.client.get(reverse('gyms:gym-list'))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        results = list_response.data['results'] if isinstance(list_response.data, dict) else list_response.data
        returned_ids = {item['gym_id'] for item in results}
        self.assertNotIn(gym.gym_id, returned_ids)

        detail_response = self.client.get(reverse('gyms:gym-detail', args=[gym.gym_id]))
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_cannot_manage_other_owner_gym_via_direct_or_nested_routes(self):
        other_owner = get_user_model().objects.create_user(
            email='other-owner-gyms@example.com',
            phone='0700000099',
            full_name='Other Owner',
            password='pass1234',
            role='owner'
        )
        other_gym = Gym.objects.create(
            owner=other_owner,
            name='Other Gym',
            address='Addr',
            city='Kabul',
            phone='0703000001',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=3)
        )
        other_field = Field.objects.create(
            gym=other_gym,
            field_name='Other Court',
            field_type='futsal',
            capacity=8,
            price_per_hour=Decimal('900.00'),
            is_available=True
        )

        self.client.force_authenticate(user=self.owner)

        direct_field_response = self.client.post(
            reverse('gyms:field-list'),
            {
                'gym': other_gym.gym_id,
                'field_name': 'Should Fail',
                'field_type': 'futsal',
                'capacity': 8,
                'price_per_hour': '800.00',
                'is_available': True,
            },
            format='json'
        )
        self.assertEqual(direct_field_response.status_code, status.HTTP_403_FORBIDDEN)

        nested_field_response = self.client.post(
            reverse('gyms:gym-fields', args=[other_gym.gym_id]),
            {
                'field_name': 'Should Fail Nested',
                'field_type': 'futsal',
                'capacity': 8,
                'price_per_hour': '800.00',
                'is_available': True,
            },
            format='json'
        )
        self.assertEqual(nested_field_response.status_code, status.HTTP_404_NOT_FOUND)

        direct_slot_response = self.client.post(
            reverse('gyms:timeslot-list'),
            {
                'field': other_field.field_id,
                'day_of_week': 1,
                'start_time': '10:00:00',
                'end_time': '11:00:00',
                'is_available': True
            },
            format='json'
        )
        self.assertEqual(direct_slot_response.status_code, status.HTTP_403_FORBIDDEN)

        direct_discount_response = self.client.post(
            reverse('gyms:discount-list'),
            {
                'gym': other_gym.gym_id,
                'title': 'Should Fail',
                'percentage': 12,
                'start_date': '2026-03-01',
                'end_date': '2026-03-30',
                'is_active': True,
            },
            format='json'
        )
        # Canonical behavior: forbidden because gym is not owned by request.user.
        self.assertEqual(direct_discount_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_cannot_manage_fields_slots_or_discounts_via_nested_routes(self):
        self.client.force_authenticate(user=self.customer)

        nested_field_response = self.client.post(
            reverse('gyms:gym-fields', args=[self.approved_gym.gym_id]),
            {
                'field_name': 'Customer Field',
                'field_type': 'futsal',
                'capacity': 8,
                'price_per_hour': '800.00',
                'is_available': True,
            },
            format='json'
        )
        self.assertEqual(nested_field_response.status_code, status.HTTP_403_FORBIDDEN)

        nested_slot_response = self.client.post(
            reverse('gyms:gym-slots', args=[self.approved_gym.gym_id]),
            {
                'field': self.field.field_id,
                'day_of_week': 0,
                'start_time': '10:00:00',
                'end_time': '11:00:00',
                'is_available': True,
            },
            format='json'
        )
        self.assertEqual(nested_slot_response.status_code, status.HTTP_403_FORBIDDEN)

        nested_discount_response = self.client.post(
            reverse('gyms:gym-discounts', args=[self.approved_gym.gym_id]),
            {
                'title': 'Customer Discount',
                'percentage': 5,
                'start_date': '2026-03-01',
                'end_date': '2026-03-31',
                'is_active': True,
            },
            format='json'
        )
        self.assertEqual(nested_discount_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_manage_own_resources(self):
        self.client.force_authenticate(user=self.owner)
        field_response = self.client.post(
            reverse('gyms:field-list'),
            {
                'gym': self.approved_gym.gym_id,
                'field_name': 'Owner New Field',
                'field_type': 'futsal',
                'capacity': 10,
                'price_per_hour': '950.00',
                'is_available': True
            },
            format='json'
        )
        self.assertEqual(field_response.status_code, status.HTTP_201_CREATED)
        new_field_id = field_response.data['field_id']

        slot_response = self.client.post(
            reverse('gyms:timeslot-list'),
            {
                'field': new_field_id,
                'day_of_week': 2,
                'start_time': '09:00:00',
                'end_time': '10:00:00',
                'is_available': True
            },
            format='json'
        )
        self.assertEqual(slot_response.status_code, status.HTTP_201_CREATED)

        discount_response = self.client.post(
            reverse('gyms:gym-discounts', args=[self.approved_gym.gym_id]),
            {
                'title': 'Owner Discount',
                'percentage': 15,
                'start_date': '2026-03-01',
                'end_date': '2026-03-31',
                'is_active': True
            },
            format='json'
        )
        self.assertEqual(discount_response.status_code, status.HTTP_201_CREATED)

    def test_invalid_slot_range_is_rejected(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            reverse('gyms:timeslot-list'),
            {
                'field': self.field.field_id,
                'day_of_week': 2,
                'start_time': '13:00:00',
                'end_time': '12:00:00',
                'is_available': True
            },
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_time', response.data)

    def test_availability_ignores_past_day_bookings_for_requested_date(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Past Booking Gym',
            address='Addr',
            city='Kabul',
            phone='0703000002',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=2)
        )
        field = Field.objects.create(
            gym=gym,
            field_name='Past Court',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('700.00'),
            is_available=True
        )
        TimeSlot.objects.create(
            field=field,
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(11, 0),
            is_available=True
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=date(2026, 3, 2),
            start_time=time(9, 0),
            end_time=time(11, 0),
            total_price=Decimal('200.00'),
            status='confirmed'
        )

        response = self.client.get(
            reverse('gyms:gym-availability', args=[gym.gym_id]),
            {'date': '2026-03-10'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data[0]['available_slots'],
            [{'start': '09:00:00', 'end': '11:00:00'}]
        )

    def test_availability_boundary_bookings_do_not_create_false_gaps(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Boundary Gym',
            address='Addr',
            city='Kabul',
            phone='0703000003',
            status='approved',
            approval_expires_at=timezone.now() + timedelta(days=2)
        )
        field = Field.objects.create(
            gym=gym,
            field_name='Boundary Court',
            field_type='futsal',
            capacity=10,
            price_per_hour=Decimal('750.00'),
            is_available=True
        )
        TimeSlot.objects.create(
            field=field,
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(12, 0),
            is_available=True
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=date(2026, 3, 9),
            start_time=time(9, 0),
            end_time=time(10, 0),
            total_price=Decimal('100.00'),
            status='confirmed'
        )
        Booking.objects.create(
            user=self.customer,
            field=field,
            booking_date=date(2026, 3, 9),
            start_time=time(11, 0),
            end_time=time(12, 0),
            total_price=Decimal('100.00'),
            status='pending'
        )

        response = self.client.get(
            reverse('gyms:gym-availability', args=[gym.gym_id]),
            {'date': '2026-03-09'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data[0]['available_slots'],
            [{'start': '10:00:00', 'end': '11:00:00'}]
        )

    def test_owner_free_onboarding_pending_then_admin_approval(self):
        self.client.force_authenticate(user=self.owner)
        create_response = self.client.post(
            reverse('gyms:gym-list'),
            self._gym_payload('Free Onboarding Gym'),
            format='json'
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        gym_id = create_response.data['gym_id']

        gym = Gym.objects.get(gym_id=gym_id)
        self.assertEqual(gym.status, 'pending')

        self.client.force_authenticate(user=None)
        public_before_approval = self.client.get(reverse('gyms:gym-list'))
        self.assertEqual(public_before_approval.status_code, status.HTTP_200_OK)
        before_results = public_before_approval.data['results'] if isinstance(public_before_approval.data, dict) else public_before_approval.data
        before_ids = {item['gym_id'] for item in before_results}
        self.assertNotIn(gym_id, before_ids)

        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            reverse('gyms:gym-approve', args=[gym_id]),
            {'status': 'approved'},
            format='json'
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        gym.refresh_from_db()
        self.assertEqual(gym.status, 'approved')

        self.client.force_authenticate(user=None)
        public_list_response = self.client.get(reverse('gyms:gym-list'))
        self.assertEqual(public_list_response.status_code, status.HTTP_200_OK)
        public_results = public_list_response.data['results'] if isinstance(public_list_response.data, dict) else public_list_response.data
        public_ids = {item['gym_id'] for item in public_results}
        self.assertIn(gym_id, public_ids)

    def test_audit_logs_created_for_gym_approval_and_updates(self):
        gym = Gym.objects.create(
            owner=self.owner,
            name='Audit Gym',
            address='Addr',
            city='Kabul',
            phone='0703000005',
            status='pending'
        )
        self.client.force_authenticate(user=self.admin)
        approve_response = self.client.post(
            reverse('gyms:gym-approve', args=[gym.gym_id]),
            {'status': 'approved', 'approval_expires_at': (timezone.now() + timedelta(days=1)).isoformat()},
            format='json'
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            GymAuditLog.objects.filter(
                gym=gym,
                actor=self.admin,
                action='gym_approved'
            ).exists()
        )

        update_response = self.client.patch(
            reverse('gyms:gym-detail', args=[gym.gym_id]),
            {'description': 'Updated by admin'},
            format='json'
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            GymAuditLog.objects.filter(
                gym=gym,
                actor=self.admin,
                action='gym_updated'
            ).exists()
        )

    def test_owner_cannot_review_own_gym(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            reverse('gyms:gym-reviews', args=[self.approved_gym.gym_id]),
            {'gym': self.approved_gym.gym_id, 'rating': 5, 'comment': 'Great'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_review_prevention(self):
        Review.objects.create(
            user=self.customer,
            gym=self.approved_gym,
            rating=4,
            comment='First review'
        )
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            reverse('gyms:gym-reviews', args=[self.approved_gym.gym_id]),
            {'gym': self.approved_gym.gym_id, 'rating': 5, 'comment': 'Second review'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_review_prevention_cannot_be_bypassed_by_omitting_gym_field(self):
        Review.objects.create(
            user=self.customer,
            gym=self.approved_gym,
            rating=4,
            comment='First review'
        )
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            reverse('gyms:gym-reviews', args=[self.approved_gym.gym_id]),
            # gym omitted intentionally
            {'rating': 5, 'comment': 'Second review'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_create_review_via_nested_endpoint_without_gym_in_payload(self):
        other_customer = get_user_model().objects.create_user(
            email='other-customer-gyms@example.com',
            phone='0700000088',
            full_name='Other Customer',
            password='pass1234',
            role='customer'
        )
        self.client.force_authenticate(user=other_customer)
        response = self.client.post(
            reverse('gyms:gym-reviews', args=[self.approved_gym.gym_id]),
            {'rating': 5, 'comment': 'Great'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['rating'], 5)

    def test_review_owner_can_update_own_review(self):
        review = Review.objects.create(
            user=self.customer,
            gym=self.approved_gym,
            rating=4,
            comment='Initial review'
        )
        self.client.force_authenticate(user=self.customer)
        response = self.client.patch(
            reverse('gyms:legacy-review-detail', args=[review.review_id]),
            {'rating': 5, 'comment': 'Updated review'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        review.refresh_from_db()
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.comment, 'Updated review')

    def test_other_user_cannot_update_or_delete_someone_elses_review(self):
        other_customer = get_user_model().objects.create_user(
            email='other-customer-two-gyms@example.com',
            phone='0700000089',
            full_name='Other Customer Two',
            password='pass1234',
            role='customer'
        )
        review = Review.objects.create(
            user=self.customer,
            gym=self.approved_gym,
            rating=4,
            comment='Owned review'
        )

        self.client.force_authenticate(user=other_customer)
        update_response = self.client.patch(
            reverse('gyms:legacy-review-detail', args=[review.review_id]),
            {'comment': 'Tampered'},
            format='json'
        )
        delete_response = self.client.delete(
            reverse('gyms:legacy-review-detail', args=[review.review_id])
        )

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)
        review.refresh_from_db()
        self.assertEqual(review.comment, 'Owned review')

    def test_admin_can_delete_review(self):
        review = Review.objects.create(
            user=self.customer,
            gym=self.approved_gym,
            rating=3,
            comment='Admin can remove this'
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(
            reverse('gyms:legacy-review-detail', args=[review.review_id])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Review.objects.filter(review_id=review.review_id).exists())
