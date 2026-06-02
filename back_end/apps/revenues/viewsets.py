from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, DecimalField, Sum, Q, Value
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.permissions import IsAuthenticated
from apps.common.api import StandardizedModelViewSetMixin
from apps.expenses.models import GymExpense
from apps.gyms.models import Gym
from apps.payments.models import BookingPayment
from apps.tournaments.models import Tournament
from .models import GymRevenue
from .reporting import apply_report_range, report_metadata, resolve_report_range
from .serializers import (
    BookingRevenueSyncSerializer,
    GymRevenueSerializer,
    GymRevenueSummarySerializer,
    OwnerFinanceSummarySerializer,
    TournamentRevenueSyncSerializer,
)


class GymRevenueViewSet(StandardizedModelViewSetMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only public revenue reporting APIs with controlled sync actions.
    """

    queryset = GymRevenue.objects.select_related(
        'gym',
        'booking_payment__booking__field',
        'tournament_payment__tournament',
        'tournament_payment__team',
        'tournament_payment__payer',
    ).all()
    serializer_class = GymRevenueSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed('PUT')

    def partial_update(self, request, *args, **kwargs):
        raise MethodNotAllowed('PATCH')

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed('DELETE')

    def _queryset_for_user(self, user):
        if user.role == 'admin':
            return GymRevenue.objects.all()
        if user.role == 'owner':
            return GymRevenue.objects.filter(gym__owner=user)
        return GymRevenue.objects.none()

    def _apply_date_filters(self, queryset, request):
        report_range, error_response = resolve_report_range(request.query_params)
        if error_response:
            return None, None, error_response
        return apply_report_range(queryset, report_range), report_range, None

    def _expense_queryset_for_user(self, user):
        if user.role == 'admin':
            return GymExpense.objects.all()
        if user.role == 'owner':
            return GymExpense.objects.filter(gym__owner=user)
        return GymExpense.objects.none()

    def _apply_finance_filters(self, revenues, expenses, request):
        gym_id_raw = request.query_params.get('gym_id')
        if gym_id_raw not in (None, ''):
            try:
                gym_id = int(gym_id_raw)
            except (TypeError, ValueError):
                return None, None, None, self.error(
                    message='gym_id must be a valid integer.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='validation_error',
                )
            revenues = revenues.filter(gym_id=gym_id)
            expenses = expenses.filter(gym_id=gym_id)

        report_range, error_response = resolve_report_range(request.query_params)
        if error_response:
            return None, None, None, error_response

        revenues = apply_report_range(revenues, report_range)
        if report_range.get('date_from') is not None:
            expenses = expenses.filter(expense_date__gte=report_range['date_from'])
        if report_range.get('date_to') is not None:
            expenses = expenses.filter(expense_date__lte=report_range['date_to'])
        return revenues, expenses, report_range, None

    def _build_summary(self, revenues):
        totals = revenues.aggregate(
            total_revenue=Sum('amount'),
            total_commission=Sum('commission_amount'),
            total_net=Sum('net_amount'),
            booking_revenue=Sum('amount', filter=Q(revenue_type='booking')),
            tournament_revenue=Sum('amount', filter=Q(revenue_type='tournament')),
            total_bookings=Count('revenue_id', filter=Q(revenue_type='booking')),
            total_tournaments=Count('revenue_id', filter=Q(revenue_type='tournament')),
        )
        return {
            'total_revenue': totals['total_revenue'] or 0,
            'total_commission': totals['total_commission'] or 0,
            'total_net': totals['total_net'] or 0,
            'booking_revenue': totals['booking_revenue'] or 0,
            'tournament_revenue': totals['tournament_revenue'] or 0,
            'total_bookings': totals['total_bookings'] or 0,
            'total_tournaments': totals['total_tournaments'] or 0,
        }

    def _build_finance_summary(self, revenues, expenses):
        money_field = DecimalField(max_digits=12, decimal_places=2)
        revenue_totals = revenues.aggregate(
            total_revenue=Coalesce(Sum('amount'), Value(0), output_field=money_field),
            total_commission=Coalesce(Sum('commission_amount'), Value(0), output_field=money_field),
            total_net=Coalesce(Sum('net_amount'), Value(0), output_field=money_field),
            booking_revenue=Coalesce(
                Sum('amount', filter=Q(revenue_type='booking')),
                Value(0),
                output_field=money_field,
            ),
            tournament_revenue=Coalesce(
                Sum('amount', filter=Q(revenue_type='tournament')),
                Value(0),
                output_field=money_field,
            ),
        )
        expense_totals = expenses.aggregate(
            total_expenses=Coalesce(Sum('amount'), Value(0), output_field=money_field),
            rent_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_RENT)),
                Value(0),
                output_field=money_field,
            ),
            electricity_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_ELECTRICITY)),
                Value(0),
                output_field=money_field,
            ),
            staff_salary_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_STAFF_SALARY)),
                Value(0),
                output_field=money_field,
            ),
        )
        final_profit = revenue_totals['total_net'] - expense_totals['total_expenses']
        return {**revenue_totals, **expense_totals, 'final_profit': final_profit}

    def _gym_detail_response(self, request, gym_id):
        try:
            gym = Gym.objects.get(gym_id=gym_id)
        except Gym.DoesNotExist:
            return self.error(
                message='Gym not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='gym_not_found',
            )

        user = request.user
        if user.role != 'admin' and gym.owner_id != user.user_id:
            return self.error(
                message='You do not have permission to view this gym revenue.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        revenues = GymRevenue.objects.filter(gym=gym)
        revenues, report_range, error_response = self._apply_date_filters(revenues, request)
        if error_response:
            return error_response

        return self.success(
            data={
                **report_metadata(report_range),
                'gym': {
                    'gym_id': gym.gym_id,
                    'name': gym.name,
                    'city': gym.city,
                },
                'summary': self._build_summary(revenues),
                'revenues': GymRevenueSerializer(revenues, many=True).data,
            }
        )

    def get_queryset(self):
        return self._queryset_for_user(self.request.user).select_related(
            'gym',
            'booking_payment__booking__field',
            'tournament_payment__tournament',
            'tournament_payment__team',
            'tournament_payment__payer',
        ).order_by('-created_at')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get revenue summary scoped to the authenticated role."""
        user = request.user
        if user.role not in ['admin', 'owner']:
            return self.error(
                message='You do not have permission to view revenue.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        revenues = self._queryset_for_user(user)
        revenues, report_range, error_response = self._apply_date_filters(revenues, request)
        if error_response:
            return error_response

        return self.success(
            data={
                **report_metadata(report_range),
                **GymRevenueSummarySerializer(self._build_summary(revenues)).data,
            }
        )

    @action(detail=False, methods=['get'], url_path='owner-finance-summary')
    def owner_finance_summary(self, request):
        user = request.user
        if user.role not in ['admin', 'owner']:
            return self.error(
                message='You do not have permission to view finance summary.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        revenues = self._queryset_for_user(user)
        expenses = self._expense_queryset_for_user(user)
        revenues, expenses, report_range, error_response = self._apply_finance_filters(
            revenues,
            expenses,
            request,
        )
        if error_response:
            return error_response

        return self.success(
            data={
                **report_metadata(report_range),
                **OwnerFinanceSummarySerializer(
                    self._build_finance_summary(revenues, expenses)
                ).data,
            }
        )

    @action(detail=False, methods=['get'])
    def by_gym(self, request):
        """Get revenues grouped by gym for admin/owner."""
        user = request.user
        if user.role not in ['admin', 'owner']:
            return self.error(
                message='You do not have permission to view revenue.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        revenues = self._queryset_for_user(user)
        revenues, _report_range, error_response = self._apply_date_filters(revenues, request)
        if error_response:
            return error_response

        gym_summary = revenues.values('gym__gym_id', 'gym__name').annotate(
            total_revenue=Sum('amount'),
            total_commission=Sum('commission_amount'),
            total_net=Sum('net_amount'),
            booking_count=Count('revenue_id', filter=Q(revenue_type='booking')),
            tournament_count=Count('revenue_id', filter=Q(revenue_type='tournament')),
        ).order_by('gym__name')

        return self.success(data={'results': list(gym_summary)})

    @action(detail=False, methods=['get'], url_path=r'gyms/(?P<gym_id>[^/.]+)')
    def gym_report(self, request, gym_id=None):
        """Clean gym-scoped revenue endpoint."""
        return self._gym_detail_response(request, gym_id)

    @action(detail=True, methods=['get'])
    def gym_detail(self, request, pk=None):
        """
        Legacy compatibility endpoint: keeps existing behavior where pk is treated as gym_id.
        """
        return self._gym_detail_response(request, pk)

    @action(detail=False, methods=['post'])
    def sync_booking(self, request):
        """
        Controlled sync: create/update revenue from a successful booking payment.
        Admin-only to keep financial row creation internal.
        """
        if request.user.role != 'admin':
            return self.error(
                message='Only admin can sync revenues.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        serializer = BookingRevenueSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            booking_payment = BookingPayment.objects.select_related('booking__field__gym').get(
                booking_payment_id=data['booking_payment_id']
            )
        except BookingPayment.DoesNotExist:
            return self.error(
                message='Booking payment not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='booking_payment_not_found',
            )

        try:
            with transaction.atomic():
                revenue = GymRevenue.sync_from_booking_payment(
                    booking_payment=booking_payment,
                    commission_amount=data['commission_amount'],
                )
        except DjangoValidationError as exc:
            return self.error(
                message=exc.message,
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='revenue_sync_failed',
            )

        return self.success(
            data={'revenue': GymRevenueSerializer(revenue).data},
            message='Booking revenue synced successfully.',
        )

    @action(detail=False, methods=['post'])
    def sync_tournament(self, request):
        """
        Controlled sync: create/update revenue from a finished tournament.
        Admin-only to keep financial row creation internal.
        """
        if request.user.role != 'admin':
            return self.error(
                message='Only admin can sync revenues.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )

        serializer = TournamentRevenueSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            tournament = Tournament.objects.select_related('gym').get(
                tournament_id=data['tournament_id']
            )
        except Tournament.DoesNotExist:
            return self.error(
                message='Tournament not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='tournament_not_found',
            )

        try:
            with transaction.atomic():
                revenues = GymRevenue.sync_from_tournament(
                    tournament=tournament,
                    commission_amount=data['commission_amount'],
                )
        except DjangoValidationError as exc:
            return self.error(
                message=exc.message,
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='revenue_sync_failed',
            )

        return self.success(
            data={'revenues': GymRevenueSerializer(revenues, many=True).data},
            message='Tournament revenues synced successfully.',
        )
