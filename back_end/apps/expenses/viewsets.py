from datetime import date

from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.permissions import IsAuthenticated

from apps.common.api import StandardizedModelViewSetMixin
from apps.common.authz import is_admin

from .models import GymExpense
from .permissions import IsExpenseAdminOrOwner
from .serializers import GymExpenseSerializer, GymExpenseSummarySerializer


class GymExpenseViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    lookup_value_regex = r'\d+'
    queryset = GymExpense.objects.select_related('gym', 'created_by').all()
    serializer_class = GymExpenseSerializer
    permission_classes = [IsAuthenticated, IsExpenseAdminOrOwner]

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed('PUT')

    def get_queryset(self):
        user = self.request.user
        base_queryset = GymExpense.objects.select_related('gym', 'created_by').order_by(
            '-expense_date', '-created_at'
        )
        if is_admin(user):
            return base_queryset
        return base_queryset.filter(gym__owner=user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        return self._apply_filters(queryset)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        expenses = self.filter_queryset(self.get_queryset())
        totals = expenses.aggregate(
            total_expenses=Coalesce(
                Sum('amount'),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            rent_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_RENT)),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            electricity_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_ELECTRICITY)),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            staff_salary_total=Coalesce(
                Sum('amount', filter=Q(expense_type=GymExpense.EXPENSE_STAFF_SALARY)),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )
        return self.success(data=GymExpenseSummarySerializer(totals).data)

    def _apply_filters(self, queryset):
        query_params = self.request.query_params

        gym_id = query_params.get('gym_id')
        if gym_id not in (None, ''):
            try:
                gym_id = int(gym_id)
            except (TypeError, ValueError):
                raise ValidationError({'gym_id': 'gym_id must be a valid integer.'})
            queryset = queryset.filter(gym_id=gym_id)

        expense_type = query_params.get('expense_type')
        if expense_type not in (None, ''):
            allowed_types = {choice for choice, _label in GymExpense.EXPENSE_TYPE_CHOICES}
            if expense_type not in allowed_types:
                raise ValidationError(
                    {'expense_type': 'expense_type must be one of: rent, electricity, staff_salary.'}
                )
            queryset = queryset.filter(expense_type=expense_type)

        date_from = self._parse_query_date('date_from')
        date_to = self._parse_query_date('date_to')
        if date_from and date_to and date_from > date_to:
            raise ValidationError({'date_to': 'date_to cannot be earlier than date_from.'})
        if date_from:
            queryset = queryset.filter(expense_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(expense_date__lte=date_to)

        return queryset

    def _parse_query_date(self, param_name) -> date | None:
        raw_value = self.request.query_params.get(param_name)
        if raw_value in (None, ''):
            return None

        try:
            parsed = parse_date(raw_value)
        except ValueError:
            parsed = None
        if parsed is None:
            raise ValidationError({param_name: f'{param_name} must be in YYYY-MM-DD format.'})
        return parsed
