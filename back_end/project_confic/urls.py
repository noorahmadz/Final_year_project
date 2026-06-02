"""
URL configuration for project_confic project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from apps.users.views import WrappedTokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # Canonical API surface for active clients/mobile frontend.
    # React Native clients should consume only these routes unless explicitly migrating older behavior.
    path('api/users/', include('apps.users.urls', namespace='users')),
    path('api/gyms/', include('apps.gyms.urls', namespace='gyms')),
    path('api/bookings/', include('apps.bookings.urls', namespace='bookings')),
    path('api/payments/', include('apps.payments.urls', namespace='payments')),
    path('api/expenses/', include('apps.expenses.urls', namespace='expenses')),
    path('api/tournaments/', include('apps.tournaments.urls', namespace='tournaments')),
    path('api/revenues/', include('apps.revenues.urls', namespace='revenues')),

    # Canonical auth contract for mobile clients:
    # - login: /api/users/login/
    # - refresh: /api/token/refresh/
    # - email verification/resend: /api/users/verify-email-otp/ and /api/users/resend-email-otp/
    path('api/token/refresh/', WrappedTokenRefreshView.as_view(), name='token_refresh'),
]

if settings.ENABLE_LEGACY_API_ROUTES:
    from apps.users.viewsets import UserViewSet

    urlpatterns += [
        # Legacy top-level gym resources (fields/slots/discounts/reviews).
        path('api/gyms/', include('apps.gyms.urls_resources_legacy')),
        # Legacy gym resource group.
        path('api/gyms/gyms/', include('apps.gyms.urls_legacy')),
        # Legacy booking resource group.
        path('api/bookings/bookings/', include('apps.bookings.urls_legacy')),
        # Deprecated auth aliases kept only for compatibility windows.
        path('api/token/', UserViewSet.as_view({'post': 'login'}), name='token_obtain_pair'),
        path('api/login/', UserViewSet.as_view({'post': 'login'}), name='login'),
    ]

if settings.DEBUG or getattr(settings, 'APP_ENV', '') == 'development':
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
