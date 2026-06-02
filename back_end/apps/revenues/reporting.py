from calendar import monthrange
from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.common.api import error_response


ALLOWED_PERIODS = {'delay', 'weekly', 'monthly'}


def _error(message):
    return error_response(message=message)


def _positive_int(raw_value, *, field_name):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None, _error(f'{field_name} must be a positive integer.')

    if value <= 0:
        return None, _error(f'{field_name} must be a positive integer.')
    return value, None


def _shift_month_start(current_month_start, months_back):
    year = current_month_start.year
    month = current_month_start.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return current_month_start.replace(year=year, month=month, day=1)


def resolve_report_range(query_params):
    """
    Resolve report date range.

    Priority:
    1. explicit date_from/date_to
    2. period-based filters
    3. no range filter
    """
    date_from_raw = query_params.get('date_from')
    date_to_raw = query_params.get('date_to')

    if date_from_raw or date_to_raw:
        date_from = None
        date_to = None

        if date_from_raw:
            date_from = parse_date(date_from_raw)
            if date_from is None:
                return None, _error('date_from must be in YYYY-MM-DD format.')

        if date_to_raw:
            date_to = parse_date(date_to_raw)
            if date_to is None:
                return None, _error('date_to must be in YYYY-MM-DD format.')

        if date_from and date_to and date_from > date_to:
            return None, _error('date_from cannot be later than date_to.')

        return {
            'period': 'custom',
            'date_from': date_from,
            'date_to': date_to,
        }, None

    period = (query_params.get('period') or '').strip().lower()
    if not period:
        return {
            'period': None,
            'date_from': None,
            'date_to': None,
        }, None

    if period not in ALLOWED_PERIODS:
        return None, _error('period must be one of: delay, weekly, monthly.')

    today = timezone.localdate()

    if period == 'delay':
        days, error = _positive_int(query_params.get('days'), field_name='days')
        if error:
            return None, error
        return {
            'period': 'delay',
            'date_from': today - timedelta(days=days - 1),
            'date_to': today,
        }, None

    if period == 'weekly':
        weeks_raw = query_params.get('weeks')
        weeks = 1
        if weeks_raw not in (None, ''):
            weeks, error = _positive_int(weeks_raw, field_name='weeks')
            if error:
                return None, error
        current_week_start = today - timedelta(days=today.weekday())
        return {
            'period': 'weekly',
            'date_from': current_week_start - timedelta(days=(weeks - 1) * 7),
            'date_to': today,
        }, None

    months_raw = query_params.get('months')
    months = 1
    if months_raw not in (None, ''):
        months, error = _positive_int(months_raw, field_name='months')
        if error:
            return None, error
    current_month_start = today.replace(day=1)
    start = _shift_month_start(current_month_start, months - 1)
    month_end_day = monthrange(today.year, today.month)[1]
    current_month_end = today.replace(day=month_end_day)
    return {
        'period': 'monthly',
        'date_from': start,
        'date_to': current_month_end,
    }, None


def apply_report_range(queryset, report_range):
    date_from = report_range.get('date_from')
    date_to = report_range.get('date_to')

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)
    return queryset


def report_metadata(report_range):
    return {
        'period': report_range.get('period'),
        'range': {
            'date_from': (
                report_range['date_from'].isoformat()
                if report_range.get('date_from') is not None
                else None
            ),
            'date_to': (
                report_range['date_to'].isoformat()
                if report_range.get('date_to') is not None
                else None
            ),
        },
    }
