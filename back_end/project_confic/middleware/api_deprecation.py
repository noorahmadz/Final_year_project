DEPRECATED_ROUTE_PREFIXES = {
    '/api/login/': '/api/users/login/',
    '/api/token/': '/api/users/login/',
    '/api/gyms/gyms/': '/api/gyms/',
    '/api/gyms/fields/': '/api/gyms/{gym_id}/fields/',
    '/api/gyms/slots/': '/api/gyms/{gym_id}/slots/',
    '/api/gyms/discounts/': '/api/gyms/{gym_id}/discounts/',
    '/api/gyms/reviews/': '/api/gyms/{gym_id}/reviews/',
    '/api/bookings/bookings/': '/api/bookings/',
    '/api/payments/booking/process/': '/api/payments/booking/create-intent/',
}


class ApiDeprecationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        canonical_route = self._canonical_route_for_path(request.path)
        if canonical_route is None:
            return response

        response['X-API-Deprecated'] = 'true'
        response['X-API-Canonical-Route'] = canonical_route
        return response

    @staticmethod
    def _canonical_route_for_path(path):
        for prefix, canonical in DEPRECATED_ROUTE_PREFIXES.items():
            if path.startswith(prefix):
                return canonical
        return None
