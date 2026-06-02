from django.test import TestCase, override_settings
from django.urls import reverse, NoReverseMatch
from django.core.cache import cache
from django.core import mail
from django.utils import timezone
from unittest.mock import patch
from rest_framework.test import APIClient
from datetime import timedelta
import re

from .models import User, EmailVerificationOTP


class UsersAPITestBase(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # SimpleJWT internally references user.id; this project uses user_id as PK.
        if not hasattr(User, "id"):
            User.id = property(lambda self: self.user_id)

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        self.register_url = reverse("users:user-register")
        self.login_url = reverse("users:user-login")
        self.me_url = reverse("users:user-me")
        self.users_list_url = reverse("users:user-list")
        self.owners_url = reverse("users:user-owners")
        self.customers_url = reverse("users:user-customers")
        self.change_password_url = reverse("users:user-change-password")
        self.verify_email_otp_url = reverse("users:user-verify-email-otp")
        self.resend_email_otp_url = reverse("users:user-resend-email-otp")
        mail.outbox = []

        self.admin_user = User.objects.create_user(
            phone="700000001",
            full_name="Admin User",
            email="admin@example.com",
            password="AdminPass123!",
            role="admin",
            is_staff=True,
            is_superuser=True,
            is_active=True,
            is_verified=True,
        )
        self.customer_user = User.objects.create_user(
            phone="700000002",
            full_name="Customer User",
            email="customer@example.com",
            password="CustomerPass123!",
            role="customer",
            is_active=True,
            is_verified=True,
        )
        self.owner_user = User.objects.create_user(
            phone="700000003",
            full_name="Owner User",
            email="owner@example.com",
            password="OwnerPass123!",
            role="owner",
            is_active=True,
            is_verified=True,
        )

    def get_access_token(self, email, password):
        response = self.client.post(
            self.login_url, {"email": email, "password": password}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        return response.data["data"]["access"]

    def get_login_payload(self, email, password, url=None):
        response = self.client.post(
            url or self.login_url, {"email": email, "password": password}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        return response.data["data"]

    def auth_with_user(self, user, password):
        self.client.force_authenticate(user=user)

    def extract_last_otp(self):
        self.assertTrue(mail.outbox)
        match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
        self.assertIsNotNone(match)
        return match.group(1)

    def latest_otp(self, user):
        return EmailVerificationOTP.objects.filter(user=user).order_by('-created_at').first()

    def get_approve_owner_url_or_skip(self):
        try:
            return reverse("users:user-approve-owner")
        except NoReverseMatch:
            self.skipTest("approve_owner endpoint does not exist in current users routes.")


@override_settings(EMAIL_HOST="smtp.example.com", DEFAULT_FROM_EMAIL="noreply@example.com")
class RegistrationTests(UsersAPITestBase):
    @override_settings(DEFAULT_FROM_EMAIL="noreply@example.com")
    def test_customer_registration_succeeds(self):
        payload = {
            "full_name": "New Customer",
            "phone": "700000010",
            "email": "new-customer@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertTrue(response.data["data"]["verification_required"])
        user = User.objects.get(phone="700000010")
        self.assertEqual(user.role, "customer")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].from_email, "noreply@example.com")
        self.assertEqual(self.latest_otp(user).email, user.email)
        self.assertEqual(
            self.latest_otp(user).delivery_status,
            EmailVerificationOTP.DeliveryStatus.SENT,
        )

    def test_owner_registration_creates_active_unverified_owner(self):
        payload = {
            "full_name": "Pending Owner",
            "phone": "700000011",
            "email": "pending-owner@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "owner",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(phone="700000011")
        self.assertEqual(user.role, "owner")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_verified)
        self.assertEqual(len(mail.outbox), 1)

    def test_owner_can_login_after_email_verification_without_admin_approval(self):
        payload = {
            "full_name": "Flow Owner",
            "phone": "700000019",
            "email": "flow-owner@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "owner",
        }

        with self.captureOnCommitCallbacks(execute=True):
            register_response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(register_response.status_code, 201)
        owner = User.objects.get(email="flow-owner@example.com")
        self.assertTrue(owner.is_active)
        self.assertFalse(owner.is_verified)

        verify_response = self.client.post(
            self.verify_email_otp_url,
            {"email": owner.email, "otp": self.extract_last_otp()},
            format="json",
        )

        self.assertEqual(verify_response.status_code, 200)
        owner.refresh_from_db()
        self.assertTrue(owner.is_verified)

        login_response = self.client.post(
            self.login_url,
            {"email": owner.email, "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data["data"]["user"]["role"], "owner")

    def test_registration_password_mismatch_returns_error(self):
        payload = {
            "full_name": "Mismatch User",
            "phone": "700000012",
            "email": "mismatch@example.com",
            "password": "StrongPass123!",
            "password_confirm": "WrongPass123!",
            "role": "customer",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("password_confirm", response.data["errors"])

    def test_registration_weak_password_rejected(self):
        payload = {
            "full_name": "Weak Password User",
            "phone": "700000013",
            "email": "weak@example.com",
            "password": "12345678",
            "password_confirm": "12345678",
            "role": "customer",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data["errors"])

    def test_registration_invalid_role_rejected(self):
        payload = {
            "full_name": "Invalid Role User",
            "phone": "700000014",
            "email": "invalid-role@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "admin",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data["errors"])

    def test_registration_requires_unique_email(self):
        payload = {
            "full_name": "Duplicate Email User",
            "phone": "700000018",
            "email": self.customer_user.email.upper(),
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data["errors"])

    def test_registration_normalizes_email_to_lowercase(self):
        payload = {
            "full_name": "Normalized User",
            "phone": "700000019",
            "email": "  MixedCase@Example.COM  ",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(phone="700000019")
        self.assertEqual(user.email, "mixedcase@example.com")


class LoginTests(UsersAPITestBase):
    def test_valid_login_returns_jwt_tokens(self):
        response = self.client.post(
            self.login_url,
            {"email": self.customer_user.email, "password": "CustomerPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

    def test_legacy_login_alias_is_disabled_by_default(self):
        response = self.client.post(
            "/api/login/",
            {"email": self.customer_user.email, "password": "CustomerPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_unverified_user_cannot_login(self):
        unverified_user = User.objects.create_user(
            phone="700000020",
            full_name="Unverified User",
            email="unverified@example.com",
            password="UnverifiedPass123!",
            role="customer",
            is_active=True,
            is_verified=False,
        )

        response = self.client.post(
            self.login_url,
            {"email": unverified_user.email, "password": "UnverifiedPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "email_not_verified")
        self.assertEqual(response.data["message"], "Email address is not verified.")

    def test_verified_owner_can_login_without_admin_approval(self):
        owner = User.objects.create_user(
            phone="700000021",
            full_name="Verified Owner",
            email="verified-owner@example.com",
            password="VerifiedOwnerPass123!",
            role="owner",
            is_active=True,
            is_verified=True,
        )

        response = self.client.post(
            self.login_url,
            {"email": owner.email, "password": "VerifiedOwnerPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["user"]["role"], "owner")
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

    def test_wrong_email_returns_error(self):
        response = self.client.post(
            self.login_url,
            {"email": "missing@example.com", "password": "CustomerPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_invalid_password_returns_error(self):
        response = self.client.post(
            self.login_url,
            {"email": self.customer_user.email, "password": "WrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_inactive_user_cannot_login(self):
        inactive_user = User.objects.create_user(
            phone="700000015",
            full_name="Inactive Owner",
            email="inactive@example.com",
            password="InactivePass123!",
            role="owner",
            is_active=False,
        )

        response = self.client.post(
            self.login_url,
            {"email": inactive_user.email, "password": "InactivePass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_login_requires_email_and_password(self):
        response = self.client.post(self.login_url, {"password": "CustomerPass123!"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data["errors"])

    def test_login_accepts_normalized_email_input(self):
        response = self.client.post(
            self.login_url,
            {"email": "  CUSTOMER@EXAMPLE.COM  ", "password": "CustomerPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)


class AuthenticationTests(UsersAPITestBase):
    def test_protected_endpoint_requires_authentication(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, 401)

    def test_authenticated_user_can_access_me_and_get_current_user_data(self):
        access = self.get_access_token(self.customer_user.email, "CustomerPass123!")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["user_id"], self.customer_user.user_id)
        self.assertEqual(response.data["data"]["phone"], self.customer_user.phone)

    def test_unverified_user_token_is_rejected_on_protected_endpoint(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        unverified_user = User.objects.create_user(
            phone="700000021",
            full_name="Token Rejected User",
            email="token-rejected@example.com",
            password="TokenReject123!",
            role="customer",
            is_active=True,
            is_verified=False,
        )
        refresh = RefreshToken.for_user(unverified_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error_code"], "email_not_verified")


@override_settings(EMAIL_HOST="smtp.example.com", DEFAULT_FROM_EMAIL="noreply@example.com")
class EmailVerificationTests(UsersAPITestBase):
    def setUp(self):
        super().setUp()
        self.pending_user = User.objects.create_user(
            phone="700000019",
            full_name="Pending Verify User",
            email="pending@example.com",
            password="PendingPass123!",
            role="customer",
            is_active=True,
            is_verified=False,
        )
        _, otp = EmailVerificationOTP.issue_for_user(self.pending_user)
        from .email_utils import send_verification_otp_email
        send_verification_otp_email(email=self.pending_user.email, otp=otp)

    def test_successful_email_otp_verification(self):
        otp = self.extract_last_otp()

        response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": otp},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.pending_user.refresh_from_db()
        self.assertTrue(self.pending_user.is_verified)
        self.assertTrue(self.latest_otp(self.pending_user).is_used)

    def test_wrong_otp_rejected(self):
        response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": "000000"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.pending_user.refresh_from_db()
        self.assertFalse(self.pending_user.is_verified)
        self.assertEqual(self.latest_otp(self.pending_user).attempts_count, 1)

    def test_expired_otp_rejected(self):
        otp_record = self.latest_otp(self.pending_user)
        otp_record.expires_at = timezone.now() - timedelta(seconds=1)
        otp_record.save(update_fields=["expires_at"])

        response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": self.extract_last_otp()},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.pending_user.refresh_from_db()
        self.assertFalse(self.pending_user.is_verified)

    def test_used_otp_rejected(self):
        otp_record = self.latest_otp(self.pending_user)
        otp = self.extract_last_otp()
        otp_record.verify_otp(otp)

        response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": otp},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_too_many_wrong_attempts_rejected(self):
        otp_record = self.latest_otp(self.pending_user)
        for _ in range(otp_record.max_attempts):
            self.client.post(
                self.verify_email_otp_url,
                {"email": self.pending_user.email, "otp": "111111"},
                format="json",
            )

        otp_record = self.latest_otp(self.pending_user)
        self.assertTrue(otp_record.is_used)
        self.assertEqual(otp_record.attempts_count, otp_record.max_attempts)

        response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": self.extract_last_otp()},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_resend_blocked_during_cooldown(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.resend_email_otp_url,
                {"email": self.pending_user.email},
                format="json",
            )

        self.assertEqual(response.status_code, 400)

    def test_resend_creates_new_otp_and_invalidates_old_one(self):
        old_otp = self.latest_otp(self.pending_user)
        old_otp.created_at = timezone.now() - EmailVerificationOTP.RESEND_COOLDOWN - timedelta(seconds=1)
        old_otp.save(update_fields=["created_at"])

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.resend_email_otp_url,
                {"email": self.pending_user.email},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 2)
        old_otp.refresh_from_db()
        self.assertTrue(old_otp.is_used)
        new_otp = self.latest_otp(self.pending_user)
        self.assertNotEqual(old_otp.pk, new_otp.pk)
        self.assertFalse(new_otp.is_used)
        self.assertEqual(
            new_otp.delivery_status,
            EmailVerificationOTP.DeliveryStatus.SENT,
        )

    @patch("apps.users.email_utils.send_mail", side_effect=RuntimeError("smtp unavailable"))
    def test_registration_persists_user_when_email_delivery_fails_after_commit(self, _mock_send_email):
        initial_outbox_count = len(mail.outbox)
        payload = {
            "full_name": "Delivery Failure User",
            "phone": "700000029",
            "email": "delivery-failure@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIn("could not send the verification email", response.data["message"])
        user = User.objects.get(phone="700000029")
        self.assertEqual(user.email, "delivery-failure@example.com")
        self.assertFalse(user.is_verified)
        otp_record = EmailVerificationOTP.objects.get(user=user)
        self.assertEqual(otp_record.delivery_status, EmailVerificationOTP.DeliveryStatus.FAILED)
        self.assertIn("smtp unavailable", otp_record.delivery_error)
        self.assertIsNotNone(otp_record.delivery_attempted_at)
        self.assertIsNotNone(otp_record.delivery_failed_at)
        self.assertIsNone(otp_record.delivery_sent_at)
        self.assertEqual(len(mail.outbox), initial_outbox_count)

    @override_settings(EMAIL_HOST="", DEFAULT_FROM_EMAIL="noreply@example.com")
    def test_registration_marks_otp_delivery_failed_when_email_service_is_unavailable(self):
        payload = {
            "full_name": "Config Failure User",
            "phone": "700000030",
            "email": "config-failure@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIn("could not send the verification email", response.data["message"])
        user = User.objects.get(phone="700000030")
        otp_record = EmailVerificationOTP.objects.get(user=user)
        self.assertEqual(otp_record.delivery_status, EmailVerificationOTP.DeliveryStatus.FAILED)
        self.assertIn("EMAIL_HOST is not configured", otp_record.delivery_error)

    @patch("apps.users.email_utils.send_mail", side_effect=[RuntimeError("smtp unavailable"), 1])
    def test_resend_after_previous_failed_delivery_remains_possible(self, _mock_send_email):
        payload = {
            "full_name": "Retry User",
            "phone": "700000031",
            "email": "retry-user@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "role": "customer",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(phone="700000031")
        failed_otp = self.latest_otp(user)
        self.assertEqual(failed_otp.delivery_status, EmailVerificationOTP.DeliveryStatus.FAILED)

        failed_otp.created_at = timezone.now() - EmailVerificationOTP.RESEND_COOLDOWN - timedelta(seconds=1)
        failed_otp.save(update_fields=["created_at"])

        with self.captureOnCommitCallbacks(execute=True):
            resend_response = self.client.post(
                self.resend_email_otp_url,
                {"email": user.email},
                format="json",
            )

        self.assertEqual(resend_response.status_code, 200)
        failed_otp.refresh_from_db()
        self.assertTrue(failed_otp.is_used)
        resent_otp = self.latest_otp(user)
        self.assertNotEqual(resent_otp.pk, failed_otp.pk)
        self.assertEqual(resent_otp.delivery_status, EmailVerificationOTP.DeliveryStatus.SENT)

    @override_settings(EMAIL_HOST="", DEFAULT_FROM_EMAIL="noreply@example.com")
    def test_resend_surfaces_email_service_failure(self):
        old_otp = self.latest_otp(self.pending_user)
        old_otp.created_at = timezone.now() - EmailVerificationOTP.RESEND_COOLDOWN - timedelta(seconds=1)
        old_otp.save(update_fields=["created_at"])

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.resend_email_otp_url,
                {"email": self.pending_user.email},
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error_code"], "email_service_unavailable")
        latest_otp = self.latest_otp(self.pending_user)
        self.assertEqual(latest_otp.delivery_status, EmailVerificationOTP.DeliveryStatus.FAILED)

    def test_already_verified_user_returns_safe_response(self):
        self.pending_user.is_verified = True
        self.pending_user.save(update_fields=["is_verified"])

        verify_response = self.client.post(
            self.verify_email_otp_url,
            {"email": self.pending_user.email, "otp": self.extract_last_otp()},
            format="json",
        )
        resend_response = self.client.post(
            self.resend_email_otp_url,
            {"email": self.pending_user.email},
            format="json",
        )

        self.assertEqual(verify_response.status_code, 200)
        self.assertEqual(resend_response.status_code, 200)


class PermissionTests(UsersAPITestBase):
    def test_admin_can_list_all_users_and_access_owners_customers(self):
        self.auth_with_user(self.admin_user, "AdminPass123!")

        list_response = self.client.get(self.users_list_url)
        owners_response = self.client.get(self.owners_url)
        customers_response = self.client.get(self.customers_url)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["data"]["count"], 3)
        self.assertEqual(owners_response.status_code, 200)
        self.assertEqual(customers_response.status_code, 200)

    def test_non_admin_limited_to_own_data_and_cannot_access_admin_only_endpoints(self):
        self.auth_with_user(self.customer_user, "CustomerPass123!")

        list_response = self.client.get(self.users_list_url)
        other_user_detail_url = reverse(
            "users:user-detail", kwargs={"pk": self.admin_user.user_id}
        )
        detail_response = self.client.get(other_user_detail_url)
        owners_response = self.client.get(self.owners_url)
        customers_response = self.client.get(self.customers_url)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["data"]["count"], 1)
        self.assertEqual(list_response.data["data"]["results"][0]["user_id"], self.customer_user.user_id)
        self.assertEqual(detail_response.status_code, 404)
        self.assertEqual(owners_response.status_code, 403)
        self.assertEqual(customers_response.status_code, 403)


class OwnerApprovalTests(UsersAPITestBase):
    def test_admin_can_approve_pending_owner_and_owner_becomes_active(self):
        pending_owner = User.objects.create_user(
            email="pending-owner-2@example.com",
            full_name="Pending Owner 2",
            phone="700000016",
            password="PendingOwner123!",
            role="owner",
            is_active=False,
        )
        approve_owner_url = self.get_approve_owner_url_or_skip()
        self.auth_with_user(self.admin_user, "AdminPass123!")

        response = self.client.post(
            approve_owner_url, {"user_id": pending_owner.user_id}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        pending_owner.refresh_from_db()
        self.assertTrue(pending_owner.is_active)

    def test_non_admin_cannot_approve_owner(self):
        pending_owner = User.objects.create_user(
            email="pending-owner-3@example.com",
            full_name="Pending Owner 3",
            phone="700000017",
            password="PendingOwner123!",
            role="owner",
            is_active=False,
        )
        approve_owner_url = self.get_approve_owner_url_or_skip()
        self.auth_with_user(self.customer_user, "CustomerPass123!")

        response = self.client.post(
            approve_owner_url, {"user_id": pending_owner.user_id}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        pending_owner.refresh_from_db()
        self.assertFalse(pending_owner.is_active)


class PasswordChangeTests(UsersAPITestBase):
    def test_authenticated_user_can_change_password_and_old_password_stops_working(self):
        self.auth_with_user(self.customer_user, "CustomerPass123!")

        response = self.client.post(
            self.change_password_url,
            {
                "old_password": "CustomerPass123!",
                "new_password": "CustomerNewPass123!",
                "new_password_confirm": "CustomerNewPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)

        self.client.credentials()
        old_login = self.client.post(
            self.login_url,
            {"email": self.customer_user.email, "password": "CustomerPass123!"},
            format="json",
        )
        new_login = self.client.post(
            self.login_url,
            {"email": self.customer_user.email, "password": "CustomerNewPass123!"},
            format="json",
        )

        self.assertEqual(old_login.status_code, 400)
        self.assertEqual(new_login.status_code, 200)


class LogoutOwnershipBoundaryTests(UsersAPITestBase):
    def test_user_cannot_blacklist_another_users_refresh_token(self):
        # Get a refresh token for admin_user, then attempt to revoke it while authenticated as customer.
        login_response = self.client.post(
            self.login_url,
            {"email": self.admin_user.email, "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        victim_refresh = login_response.data["data"]["refresh"]

        self.auth_with_user(self.customer_user, "CustomerPass123!")
        response = self.client.post(
            reverse("users:user-logout"),
            {"refresh": victim_refresh},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_user_can_blacklist_own_refresh_token(self):
        login_response = self.client.post(
            self.login_url,
            {"email": self.customer_user.email, "password": "CustomerPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        own_refresh = login_response.data["data"]["refresh"]

        # authenticate as that user and logout
        access = login_response.data["data"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post(
            reverse("users:user-logout"),
            {"refresh": own_refresh},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_legacy_token_obtain_alias_is_disabled_by_default(self):
        response = self.client.post(
            "/api/token/",
            {"email": self.customer_user.email, "password": "CustomerPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_token_refresh_uses_wrapped_contract(self):
        login_payload = self.get_login_payload(
            self.customer_user.email,
            "CustomerPass123!",
        )
        response = self.client.post(
            "/api/token/refresh/",
            {"refresh": login_payload["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("access", response.data["data"])


class UserManagerTests(TestCase):
    def test_create_superuser_uses_email_as_username_field(self):
        user = User.objects.create_superuser(
            email="super@example.com",
            full_name="Super User",
            phone="700000099",
            password="SuperPass123!",
        )

        self.assertEqual(user.email, "super@example.com")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.role, "admin")
