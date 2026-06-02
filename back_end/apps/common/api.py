from rest_framework import status
from rest_framework.exceptions import ErrorDetail
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from django.utils.translation import gettext as _


DEFAULT_ERROR_CODE = 'request_failed'
VALIDATION_ERROR_CODE = 'validation_error'
PERMISSION_ERROR_CODE = 'permission_denied'
NOT_FOUND_ERROR_CODE = 'not_found'
AUTHENTICATION_ERROR_CODE = 'authentication_failed'
THROTTLED_ERROR_CODE = 'throttled'
SERVER_ERROR_CODE = 'server_error'


def _normalize_detail(detail):
    if isinstance(detail, ErrorDetail):
        return str(detail)
    if isinstance(detail, list):
        return [_normalize_detail(item) for item in detail]
    if isinstance(detail, dict):
        return {key: _normalize_detail(value) for key, value in detail.items()}
    return detail


def _first_message(detail, default_message):
    normalized = _normalize_detail(detail)
    if isinstance(normalized, str) and normalized:
        return normalized
    if isinstance(normalized, list) and normalized:
        first_item = normalized[0]
        if isinstance(first_item, str) and first_item:
            return first_item
    if isinstance(normalized, dict) and normalized:
        first_value = next(iter(normalized.values()))
        return _first_message(first_value, default_message)
    return default_message


def build_error_payload(detail, *, default_message='Request could not be processed.'):
    if default_message == 'Request could not be processed.':
        default_message = _('Request could not be processed.')
    normalized = _normalize_detail(detail)
    return {
        'message': _first_message(normalized, default_message),
        'errors': normalized,
    }


def _default_error_code_for_status(status_code):
    if status_code == status.HTTP_400_BAD_REQUEST:
        return VALIDATION_ERROR_CODE
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return AUTHENTICATION_ERROR_CODE
    if status_code == status.HTTP_403_FORBIDDEN:
        return PERMISSION_ERROR_CODE
    if status_code == status.HTTP_404_NOT_FOUND:
        return NOT_FOUND_ERROR_CODE
    if status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return THROTTLED_ERROR_CODE
    if status_code >= 500:
        return SERVER_ERROR_CODE
    return DEFAULT_ERROR_CODE


def success_response(*, data=None, message=None, status_code=status.HTTP_200_OK, extra=None):
    payload = {
        'success': True,
        'message': message,
        'data': data,
    }
    return Response(payload, status=status_code)


def error_response(
    *,
    message,
    errors=None,
    error_code=None,
    status_code=status.HTTP_400_BAD_REQUEST,
    extra=None,
):
    normalized_errors = _normalize_detail(errors) if errors is not None else None
    payload = {
        'success': False,
        'message': message,
        'error_code': error_code or _default_error_code_for_status(status_code),
        'errors': normalized_errors,
    }
    return Response(payload, status=status_code)


class StandardResultsSetPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        envelope = {
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        }
        payload = {
            'success': True,
            'message': None,
            'data': envelope,
        }
        return Response(payload)


def standard_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response
    if isinstance(response.data, dict) and 'success' in response.data:
        return response
    if isinstance(response.data, dict) and 'message' in response.data and 'error_code' in response.data:
        response.data = {
            'success': False,
            'message': response.data.get('message'),
            'error_code': response.data.get('error_code'),
            'errors': response.data.get('errors'),
        }
        return response

    payload = build_error_payload(
        response.data,
        default_message=_('Request could not be processed.'),
    )
    response.data = {
        'success': False,
        'message': payload['message'],
        'error_code': _default_error_code_for_status(response.status_code),
        'errors': payload['errors'],
    }
    return response


class ApiResponseMixin:
    @staticmethod
    def success(*, data=None, message=None, status_code=status.HTTP_200_OK, extra=None):
        return success_response(data=data, message=message, status_code=status_code, extra=extra)

    @staticmethod
    def error(
        *,
        message,
        errors=None,
        error_code=None,
        status_code=status.HTTP_400_BAD_REQUEST,
        extra=None,
    ):
        return error_response(
            message=message,
            errors=errors,
            error_code=error_code,
            status_code=status_code,
            extra=extra,
        )


class StandardizedModelViewSetMixin(ApiResponseMixin):
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return self.success(data={'results': serializer.data})

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return self.success(data=serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return self.success(
            data=serializer.data,
            status_code=status.HTTP_201_CREATED,
            message=_('Created successfully.'),
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}
        return self.success(data=serializer.data, message=_('Updated successfully.'))

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
