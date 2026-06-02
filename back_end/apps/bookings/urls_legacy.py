from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import BookingViewSet

# Legacy router that preserves /api/bookings/bookings/...
# This module intentionally has NO namespace to avoid reverse() collisions.

router = DefaultRouter()
router.trailing_slash = '/'
router.register(r'bookings', BookingViewSet, basename='legacy-booking')

urlpatterns = [
    path('', include(router.urls)),
]

