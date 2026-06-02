import uuid

from django.conf import settings

from project_confic.log_filters import clear_request_id, set_request_id


class RequestIdMiddleware:
    """
    Adds an `X-Request-ID` header (or custom header) and injects it into logging.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header_name = getattr(settings, "REQUEST_ID_HEADER", "X-Request-ID")
        # Clear any leftover request id from prior work on this thread.
        clear_request_id()
        request_id = request.headers.get(header_name) or uuid.uuid4().hex

        set_request_id(request_id)
        response = self.get_response(request)
        # Ensure clients can correlate their request with server logs.
        try:
            response[header_name] = request_id
        except Exception:
            # Some response types may not allow header mutation; don't fail the request.
            pass
        return response

