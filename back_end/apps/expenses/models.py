from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.gyms.models import Gym


class GymExpense(models.Model):
    EXPENSE_RENT = 'rent'
    EXPENSE_ELECTRICITY = 'electricity'
    EXPENSE_STAFF_SALARY = 'staff_salary'

    EXPENSE_TYPE_CHOICES = (
        (EXPENSE_RENT, 'Rent'),
        (EXPENSE_ELECTRICITY, 'Electricity'),
        (EXPENSE_STAFF_SALARY, 'Staff Salary'),
    )

    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='expenses',
    )
    expense_type = models.CharField(max_length=20, choices=EXPENSE_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_expenses',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gym_expenses'
        verbose_name = 'Gym Expense'
        verbose_name_plural = 'Gym Expenses'
        ordering = ['-expense_date', '-created_at']
        indexes = [
            models.Index(fields=['gym', 'expense_date'], name='gym_expens_gym_id_284f96_idx'),
            models.Index(fields=['gym', 'expense_type'], name='gym_expens_gym_id_394451_idx'),
            models.Index(fields=['created_by'], name='gym_expens_created_727af5_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0),
                name='gym_expense_amount_positive',
            ),
        ]

    def __str__(self):
        return f'{self.gym} - {self.expense_type} - {self.amount}'

    def clean(self):
        errors = {}
        allowed_expense_types = {
            self.EXPENSE_RENT,
            self.EXPENSE_ELECTRICITY,
            self.EXPENSE_STAFF_SALARY,
        }

        if self.gym_id is None:
            errors['gym'] = 'gym is required.'

        if not self.expense_date:
            errors['expense_date'] = 'expense_date is required.'

        if self.amount is None or self.amount <= 0:
            errors['amount'] = 'amount must be greater than 0.'

        if self.expense_type not in allowed_expense_types:
            errors['expense_type'] = 'expense_type must be one of: rent, electricity, staff_salary.'

        if errors:
            raise ValidationError(errors)
