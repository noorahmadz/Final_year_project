from rest_framework import serializers

from apps.common.authz import is_admin, is_owner

from .models import GymExpense


class GymExpenseSerializer(serializers.ModelSerializer):
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    expense_type_display = serializers.SerializerMethodField()
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = GymExpense
        fields = [
            'id',
            'gym',
            'gym_name',
            'expense_type',
            'expense_type_display',
            'amount',
            'expense_date',
            'notes',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'gym_name',
            'expense_type_display',
            'created_by',
            'created_at',
            'updated_at',
        ]

    @staticmethod
    def get_expense_type_display(obj):
        return obj.get_expense_type_display()

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('amount must be greater than 0.')
        return value

    def validate_expense_type(self, value):
        allowed_types = {choice for choice, _label in GymExpense.EXPENSE_TYPE_CHOICES}
        if value not in allowed_types:
            raise serializers.ValidationError(
                'expense_type must be one of: rent, electricity, staff_salary.'
            )
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        gym = attrs.get('gym', getattr(self.instance, 'gym', None))

        if gym is None:
            raise serializers.ValidationError({'gym': 'gym is required.'})

        if user is None or not getattr(user, 'is_authenticated', False):
            raise serializers.ValidationError('Authentication is required.')

        if is_admin(user):
            return attrs

        if not is_owner(user):
            raise serializers.ValidationError('Only admins and owners can manage expenses.')

        if gym.owner_id != user.user_id:
            raise serializers.ValidationError(
                {'gym': 'You can only create or update expenses for your own gyms.'}
            )

        return attrs


class GymExpenseSummarySerializer(serializers.Serializer):
    total_expenses = serializers.DecimalField(max_digits=12, decimal_places=2)
    rent_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    electricity_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    staff_salary_total = serializers.DecimalField(max_digits=12, decimal_places=2)
