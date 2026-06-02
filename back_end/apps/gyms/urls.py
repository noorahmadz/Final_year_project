from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import GymViewSet

app_name = 'gyms'

router = DefaultRouter()
# Keep DRF's standard trailing-slash behavior for router regex stability.
router.trailing_slash = '/'

# Canonical gyms API: gym resources + nested actions on GymViewSet.
router.register(r'', GymViewSet, basename='gym')

urlpatterns = [
    path('', include(router.urls)),
]
