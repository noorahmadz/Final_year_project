from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.serializers import ValidationError
from django.db.models import Q
from django.utils import timezone
from django.core.files.storage import default_storage
from datetime import datetime
from uuid import uuid4
import os

from apps.common.api import StandardizedModelViewSetMixin, success_response
from .models import Gym, Field, TimeSlot, Discount, Review, GymImage
from .serializers import (
    GymSerializer, GymListSerializer, GymImageSerializer,
    FieldSerializer, TimeSlotSerializer, DiscountSerializer,
    ReviewSerializer, GymApproveSerializer
)
from .permissions import (
    IsAdminUser,
    IsAdminOrOwner,
    IsGymOwnerOrAdmin,
    IsFieldOwnerOrAdmin,
    IsSlotOwnerOrAdmin,
    IsDiscountOwnerOrAdmin,
    IsReviewOwnerOrAdmin,
    is_admin,
    is_owner,
    can_manage_gym,
)
from apps.bookings.utils.intervals import merge_time_intervals, subtract_intervals
from apps.bookings.lifecycle import booking_blocks_availability, synchronize_booking_lifecycle
from .domain.nested_payload import inject_gym_id
from .domain.ops import create_discount, create_review, create_field, create_timeslot
from .audit_log import log_gym_action


def public_visible_gym_filter():
    now = timezone.now()
    return Q(
        status='approved',
        is_deleted=False
    ) & (Q(approval_expires_at__isnull=True) | Q(approval_expires_at__gt=now))


BOOKING_STATUSES_BLOCKING_AVAILABILITY = ('pending', 'confirmed')


class GymViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing gyms.
    """
    # Prevent URL routing conflicts like /api/gyms/fields/ being treated as gym pk="fields".
    lookup_value_regex = r"\d+"
    queryset = Gym.objects.prefetch_related('images', 'reviews', 'fields').all()
    serializer_class = GymSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return GymListSerializer
        return GymSerializer
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'availability']:
            return [AllowAny()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        if self.action in ['update', 'partial_update']:
            return [IsGymOwnerOrAdmin()]
        if self.action in ['fields', 'slots', 'reviews', 'discounts']:
            if self.request.method == 'GET':
                return [AllowAny()]
            if self.action == 'reviews':
                return [IsAuthenticated()]
            return [IsGymOwnerOrAdmin()]
        if self.action == 'images':
            return [IsGymOwnerOrAdmin()]
        if self.action == 'approve':
            return [IsAdminUser()]
        if self.action == 'destroy':
            return [IsAdminUser()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Gym.objects.filter(public_visible_gym_filter()).prefetch_related('images', 'reviews', 'fields')
        
        if is_admin(user):
            return Gym.objects.all().prefetch_related('images', 'reviews', 'fields')
        if is_owner(user):
            return Gym.objects.filter(owner=user, is_deleted=False).prefetch_related('images', 'reviews', 'fields')
        return Gym.objects.filter(public_visible_gym_filter()).prefetch_related('images', 'reviews', 'fields')
    
    def perform_create(self, serializer):
        if is_owner(self.request.user):
            serializer.save(owner=self.request.user)
            return
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        updated_gym = serializer.save()
        log_gym_action(
            actor=user,
            action='gym_updated',
            gym=updated_gym,
            target_type='gym',
            target_id=updated_gym.gym_id
        )

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        log_gym_action(
            actor=self.request.user,
            action='gym_soft_deleted',
            gym=instance,
            target_type='gym',
            target_id=instance.gym_id
        )
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def approve(self, request, pk=None):
        """
        Approve or reject a gym (admin only).
        """
        gym = self.get_object()
        old_status = gym.status
        old_expires_at = gym.approval_expires_at
        serializer = GymApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        new_status = serializer.validated_data['status']
        gym.status = new_status
        gym.approved_by = request.user
        gym.approved_at = timezone.now()
        if new_status == 'approved':
            gym.approval_expires_at = serializer.validated_data.get('approval_expires_at')
        else:
            gym.approval_expires_at = None
        gym.save()

        if new_status == 'approved':
            log_gym_action(
                actor=request.user,
                action='gym_approved',
                gym=gym,
                target_type='gym',
                target_id=gym.gym_id,
                metadata={'old_status': old_status}
            )
        else:
            log_gym_action(
                actor=request.user,
                action='gym_rejected',
                gym=gym,
                target_type='gym',
                target_id=gym.gym_id,
                metadata={'old_status': old_status}
            )
        if old_expires_at != gym.approval_expires_at:
            log_gym_action(
                actor=request.user,
                action='approval_validity_changed',
                gym=gym,
                target_type='gym',
                target_id=gym.gym_id,
                metadata={
                    'old_approval_expires_at': old_expires_at.isoformat() if old_expires_at else None,
                    'new_approval_expires_at': gym.approval_expires_at.isoformat() if gym.approval_expires_at else None,
                }
            )
        
        gym_data = GymSerializer(gym).data
        return success_response(
            message=f'Gym {new_status} successfully.',
            data={'gym': gym_data},
            extra={'gym': gym_data},
        )
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def images(self, request, pk=None):
        """
        Upload images for a gym.
        """
        gym = self.get_object()

        image_file = request.FILES.get('image_file')
        image_url = request.data.get('image_url')

        if image_file:
            _, extension = os.path.splitext(image_file.name or '')
            safe_extension = extension if extension else '.jpg'
            file_name = f"gym-images/{uuid4().hex}{safe_extension}"
            stored_path = default_storage.save(file_name, image_file)
            image_url = default_storage.url(stored_path)

        if not image_url:
            return self.error(
                message='image_url is required.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='missing_image_url',
            )
        
        image = GymImage.objects.create(gym=gym, image_url=image_url)
        return self.success(
            data={'image': GymImageSerializer(image).data},
            status_code=status.HTTP_201_CREATED,
            message='Image uploaded successfully.',
        )
    
    @action(detail=True, methods=['get', 'post'])
    def fields(self, request, pk=None):
        """
        List or create fields for a gym.
        """
        gym = self.get_object()
        
        if request.method == 'GET':
            fields = gym.fields.all()
            serializer = FieldSerializer(fields, many=True)
            return self.success(data={'results': serializer.data})

        field = create_field(actor=request.user, gym=gym, data=request.data)
        return self.success(
            data={'field': FieldSerializer(field).data},
            status_code=status.HTTP_201_CREATED,
            message='Field created successfully.',
        )
    
    @action(detail=True, methods=['get', 'post'])
    def slots(self, request, pk=None):
        """
        Get or create time slots for a gym's fields.
        """
        gym = self.get_object()
        
        if request.method == 'GET':
            field_id = request.query_params.get('field_id')
            if field_id:
                slots = TimeSlot.objects.filter(field__gym=gym, field_id=field_id)
            else:
                slots = TimeSlot.objects.filter(field__gym=gym)
            serializer = TimeSlotSerializer(slots, many=True)
            return self.success(data={'results': serializer.data})

        slot = create_timeslot(actor=request.user, gym=gym, data=request.data)
        return self.success(
            data={'slot': TimeSlotSerializer(slot).data},
            status_code=status.HTTP_201_CREATED,
            message='Time slot created successfully.',
        )
    
    @action(detail=True, methods=['get', 'post'])
    def reviews(self, request, pk=None):
        """
        List or create reviews for a gym.
        """
        gym = self.get_object()
        
        if request.method == 'GET':
            reviews = gym.reviews.all()
            serializer = ReviewSerializer(reviews, many=True)
            return self.success(data={'results': serializer.data})
        
        # POST - create review
        if is_owner(request.user) and gym.owner == request.user:
            return self.error(
                message='Owners cannot review their own gym.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='owner_cannot_review_own_gym',
            )
        
        review = create_review(actor=request.user, gym=gym, data=request.data, request=request)
        return self.success(
            data={'review': ReviewSerializer(review).data},
            status_code=status.HTTP_201_CREATED,
            message='Review created successfully.',
        )
    
    @action(detail=True, methods=['get', 'post'])
    def discounts(self, request, pk=None):
        """
        List or create discounts for a gym.
        """
        gym = self.get_object()
        
        if request.method == 'GET':
            today = timezone.now().date()
            discounts = gym.discounts.filter(
                is_active=True,
                start_date__lte=today,
                end_date__gte=today
            )
            serializer = DiscountSerializer(discounts, many=True)
            return self.success(data={'results': serializer.data})

        discount = create_discount(actor=request.user, gym=gym, data=request.data)
        return self.success(
            data={'discount': DiscountSerializer(discount).data},
            status_code=status.HTTP_201_CREATED,
            message='Discount created successfully.',
        )
    
    @action(detail=True, methods=['get'])
    def availability(self, request, pk=None):
        """
        Get dynamic availability for a gym's fields.
        """
        gym = self.get_object()
        date_str = request.query_params.get('date')
        
        if not date_str:
            return self.error(
                message='date parameter is required.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='missing_date_parameter',
            )
        
        try:
            requested_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return self.error(
                message='Invalid date format. Use YYYY-MM-DD.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_date_format',
            )
        
        day_of_week = requested_date.weekday()  # 0=Monday, 6=Sunday
        synchronize_booking_lifecycle(
            gym_id=gym.gym_id,
            booking_date=requested_date,
            now=timezone.now(),
            trigger='gym_availability_check',
        )
        
        from apps.bookings.models import Booking
        
        availability_data = []
        
        for field in gym.fields.all():
            # Get time slots for this day of week
            slots = TimeSlot.objects.filter(field=field, day_of_week=day_of_week, is_available=True)
            
            # Use explicit booking statuses that block time.
            bookings = Booking.objects.filter(
                field=field,
                booking_date=requested_date,
                status__in=BOOKING_STATUSES_BLOCKING_AVAILABILITY
            ).prefetch_related('payments')
            active_bookings = [
                booking for booking in bookings
                if booking_blocks_availability(booking=booking, now=timezone.now())
            ]
            
            booked_times = merge_time_intervals(
                [(b.start_time, b.end_time) for b in active_bookings]
            )
            
            field_availability = {
                'field': FieldSerializer(field).data,
                'available_slots': [],
                'availability_state': 'current',
                'blocked_booking_count': len(active_bookings),
            }
            
            for slot in slots:
                available_ranges = []
                for available_start, available_end in subtract_intervals(
                    slot.start_time,
                    slot.end_time,
                    booked_times
                ):
                    available_ranges.append({
                        'start': str(available_start),
                        'end': str(available_end)
                    })

                field_availability['available_slots'].extend(available_ranges)
            
            availability_data.append(field_availability)
        
        return self.success(data={'results': availability_data})


class FieldViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing fields.
    """
    queryset = Field.objects.all()
    serializer_class = FieldSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Field.objects.filter(gym__status='approved', gym__is_deleted=False).filter(
                Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now()),
                is_available=True
            )
        if is_admin(user):
            return Field.objects.all()
        if is_owner(user):
            return Field.objects.filter(gym__owner=user, gym__is_deleted=False)
        return Field.objects.filter(gym__status='approved', gym__is_deleted=False).filter(
            Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now()),
            is_available=True
        )
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        return [IsFieldOwnerOrAdmin()]

    def perform_create(self, serializer):
        gym = serializer.validated_data["gym"]
        field = create_field(actor=self.request.user, gym=gym, data=self.request.data)
        serializer.instance = field

    def perform_update(self, serializer):
        user = self.request.user
        updated_field = serializer.save()
        log_gym_action(
            actor=user,
            action='field_updated',
            gym=updated_field.gym,
            target_type='field',
            target_id=updated_field.field_id
        )

    def perform_destroy(self, instance):
        user = self.request.user
        log_gym_action(
            actor=user,
            action='field_deleted',
            gym=instance.gym,
            target_type='field',
            target_id=instance.field_id
        )
        instance.delete()
    
    @action(detail=True, methods=['get'])
    def slots(self, request, pk=None):
        """
        Get time slots for a field.
        """
        field = self.get_object()
        day_of_week = request.query_params.get('day_of_week')
        
        if day_of_week is not None:
            try:
                day_of_week = int(day_of_week)
                slots = field.time_slots.filter(day_of_week=day_of_week)
            except ValueError:
                slots = field.time_slots.all()
        else:
            slots = field.time_slots.all()
        
        serializer = TimeSlotSerializer(slots, many=True)
        return self.success(data={'results': serializer.data})


class TimeSlotViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing time slots.
    """
    queryset = TimeSlot.objects.all()
    serializer_class = TimeSlotSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return TimeSlot.objects.filter(field__gym__status='approved', field__gym__is_deleted=False).filter(
                Q(field__gym__approval_expires_at__isnull=True) | Q(field__gym__approval_expires_at__gt=timezone.now())
            )
        if is_admin(user):
            return TimeSlot.objects.all()
        if is_owner(user):
            return TimeSlot.objects.filter(field__gym__owner=user, field__gym__is_deleted=False)
        return TimeSlot.objects.filter(field__gym__status='approved', field__gym__is_deleted=False).filter(
            Q(field__gym__approval_expires_at__isnull=True) | Q(field__gym__approval_expires_at__gt=timezone.now())
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        return [IsSlotOwnerOrAdmin()]

    def perform_create(self, serializer):
        field = serializer.validated_data["field"]
        slot = create_timeslot(actor=self.request.user, gym=field.gym, data=self.request.data)
        serializer.instance = slot

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()


class DiscountViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing discounts.
    """
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        today = timezone.now().date()
        if not user.is_authenticated:
            return Discount.objects.filter(
                gym__status='approved',
                gym__is_deleted=False,
                is_active=True,
                start_date__lte=today,
                end_date__gte=today
            ).filter(Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now()))
        if is_admin(user):
            return Discount.objects.all()
        if is_owner(user):
            return Discount.objects.filter(gym__owner=user, gym__is_deleted=False)
        return Discount.objects.filter(
            gym__status='approved',
            gym__is_deleted=False,
            is_active=True,
            start_date__lte=today,
            end_date__gte=today
        ).filter(Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now()))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        return [IsDiscountOwnerOrAdmin()]

    def perform_create(self, serializer):
        from .domain.ops import create_discount

        user = self.request.user
        gym = serializer.validated_data['gym']
        create_discount(actor=user, gym=gym, data=self.request.data)
        return

    def perform_update(self, serializer):
        user = self.request.user
        updated_discount = serializer.save()
        log_gym_action(
            actor=user,
            action='discount_updated',
            gym=updated_discount.gym,
            target_type='discount',
            target_id=updated_discount.discount_id
        )

    def perform_destroy(self, instance):
        user = self.request.user
        log_gym_action(
            actor=user,
            action='discount_deleted',
            gym=instance.gym,
            target_type='discount',
            target_id=instance.discount_id
        )
        instance.delete()


class ReviewViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing reviews.
    """
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Review.objects.filter(gym__status='approved', gym__is_deleted=False).filter(
                Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now())
            )
        if is_admin(user):
            return Review.objects.all()
        if is_owner(user):
            return Review.objects.filter(gym__owner=user, gym__is_deleted=False)
        return Review.objects.filter(gym__status='approved', gym__is_deleted=False).filter(
            Q(gym__approval_expires_at__isnull=True) | Q(gym__approval_expires_at__gt=timezone.now())
        )
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsReviewOwnerOrAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        """
        Keep top-level create as a thin alias for the canonical nested behavior.
        """
        from .domain.ops import create_review

        gym = serializer.validated_data.get('gym')
        if gym is None:
            raise ValidationError({'gym': 'Gym is required.'})
        review = create_review(actor=self.request.user, gym=gym, data=self.request.data, request=self.request)
        # Serializer instance is used by DRF response rendering
        serializer.instance = review

