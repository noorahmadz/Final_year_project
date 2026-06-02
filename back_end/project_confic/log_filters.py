import logging
import threading


_request_local = threading.local()


def set_request_id(value: str) -> None:
    _request_local.request_id = value


def get_request_id() -> str:
    return getattr(_request_local, "request_id", "n/a")


def clear_request_id() -> None:
    if hasattr(_request_local, "request_id"):
        delattr(_request_local, "request_id")


class RequestIdFilter(logging.Filter):
    """
    Inject `record.request_id` so our log formatter can safely reference it.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True

import logging
import threading


_request_local = threading.local()


def set_request_id(value: str) -> None:
    _request_local.request_id = value


def get_request_id() -> str:
    return getattr(_request_local, "request_id", "n/a")


def clear_request_id() -> None:
    if hasattr(_request_local, "request_id"):
        delattr(_request_local, "request_id")


class RequestIdFilter(logging.Filter):
    """
    Inject `record.request_id` so our log formatter can safely reference it.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True

