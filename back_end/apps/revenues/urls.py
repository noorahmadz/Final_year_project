from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import GymRevenueViewSet

app_name = 'revenues'

router = DefaultRouter()
router.register(r'', GymRevenueViewSet, basename='revenue')

urlpatterns = [
    path('', include(router.urls)),
]
