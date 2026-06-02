from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import (
    GymViewSet,
    FieldViewSet,
    TimeSlotViewSet,
    DiscountViewSet,
    ReviewViewSet,
)

# Legacy router that preserves the old confusing paths:
# /api/gyms/gyms/, /api/gyms/fields/, ...
#
# This module intentionally has NO namespace to avoid reverse() name collisions.

router = DefaultRouter()
router.trailing_slash = '/'

router.register(r'gyms', GymViewSet, basename='legacy-gym')
router.register(r'fields', FieldViewSet, basename='legacy-field')
router.register(r'slots', TimeSlotViewSet, basename='legacy-timeslot')
router.register(r'discounts', DiscountViewSet, basename='legacy-discount')
router.register(r'reviews', ReviewViewSet, basename='legacy-review')

urlpatterns = [
    path('', include(router.urls)),
]

