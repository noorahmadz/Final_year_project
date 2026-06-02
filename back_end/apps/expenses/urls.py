from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import GymExpenseViewSet

app_name = 'expenses'

router = DefaultRouter()
router.register(r'', GymExpenseViewSet, basename='expense')

urlpatterns = [
    path('', include(router.urls)),
]
