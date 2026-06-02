from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import TournamentViewSet, TeamViewSet, MatchViewSet

app_name = 'tournaments'

router = DefaultRouter()
router.register(r'teams', TeamViewSet, basename='team')
router.register(r'matches', MatchViewSet, basename='match')
router.register(r'', TournamentViewSet, basename='tournament')

urlpatterns = [
    path('', include(router.urls)),
]
