from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('gyms', '0013_unique_gym_single_court'),
    ]

    operations = [
        migrations.CreateModel(
            name='GymExpense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expense_type', models.CharField(choices=[('rent', 'Rent'), ('electricity', 'Electricity'), ('staff_salary', 'Staff Salary')], max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('expense_date', models.DateField()),
                ('notes', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_expenses', to=settings.AUTH_USER_MODEL)),
                ('gym', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='expenses', to='gyms.gym')),
            ],
            options={
                'verbose_name': 'Gym Expense',
                'verbose_name_plural': 'Gym Expenses',
                'db_table': 'gym_expenses',
                'ordering': ['-expense_date', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='gymexpense',
            index=models.Index(fields=['gym', 'expense_date'], name='gym_expens_gym_id_284f96_idx'),
        ),
        migrations.AddIndex(
            model_name='gymexpense',
            index=models.Index(fields=['gym', 'expense_type'], name='gym_expens_gym_id_394451_idx'),
        ),
        migrations.AddIndex(
            model_name='gymexpense',
            index=models.Index(fields=['created_by'], name='gym_expens_created_727af5_idx'),
        ),
        migrations.AddConstraint(
            model_name='gymexpense',
            constraint=models.CheckConstraint(check=models.Q(('amount__gt', 0)), name='gym_expense_amount_positive'),
        ),
    ]
