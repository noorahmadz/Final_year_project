from django.urls import path, include
from django.conf import settings
from rest_framework.routers import DefaultRouter
from .viewsets import BookingPaymentViewSet
from . import viewsets

app_name = 'payments'

router = DefaultRouter()
router.register(r'booking', BookingPaymentViewSet, basename='booking-payment')

urlpatterns = [
    path('', include(router.urls)),
    path('history/', viewsets.payment_history, name='payment-history'),
    path('stripe/webhook/', viewsets.stripe_webhook, name='stripe-webhook'),
    path('tournament/create-intent/', viewsets.create_tournament_payment_intent, name='tournament-create-intent'),
    path('tournament/confirm/', viewsets.confirm_tournament_payment, name='tournament-confirm'),
]

if bool(getattr(settings, 'PAYMENTS_ENABLE_TOURNAMENT_MOCK', False)):
    urlpatterns.append(path('tournament/', viewsets.process_tournament_payment, name='tournament-payment'))
