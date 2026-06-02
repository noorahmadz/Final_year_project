from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import FieldViewSet, TimeSlotViewSet, DiscountViewSet, ReviewViewSet

# Legacy top-level resource routes kept for backward compatibility:
# /api/gyms/fields/, /api/gyms/slots/, /api/gyms/discounts/, /api/gyms/reviews/
#
# This module intentionally has NO namespace to avoid reverse() collisions with canonical routes.

router = DefaultRouter()
router.trailing_slash = '/'

router.register(r'fields', FieldViewSet, basename='legacy-field')
router.register(r'slots', TimeSlotViewSet, basename='legacy-timeslot')
router.register(r'discounts', DiscountViewSet, basename='legacy-discount')
router.register(r'reviews', ReviewViewSet, basename='legacy-review')

urlpatterns = [
    path('', include(router.urls)),
]

