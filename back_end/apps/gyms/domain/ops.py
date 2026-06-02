from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, Type

from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from ..models import Discount, Gym, Review, Field, TimeSlot
from ..permissions import can_manage_gym, is_owner
from ..serializers import DiscountSerializer, ReviewSerializer, FieldSerializer, TimeSlotSerializer
from ..audit_log import log_gym_action
from .nested_payload import inject_gym_id


def create_discount(*, actor, gym: Gym, data: Any) -> Discount:
    if not can_manage_gym(actor, gym):
        raise PermissionDenied("Only the gym owner or admin can create discounts.")

    serializer = DiscountSerializer(data=inject_gym_id(data, gym.gym_id))
    serializer.is_valid(raise_exception=True)
    discount = serializer.save(gym=gym)
    log_gym_action(
        actor=actor,
        action="discount_created",
        gym=gym,
        target_type="discount",
        target_id=discount.discount_id,
    )
    return discount


def create_review(*, actor, gym: Gym, data: Any, request=None) -> Review:
    if is_owner(actor) and gym.owner_id == actor.user_id:
        raise serializers.ValidationError({"error": "Owners cannot review their own gym."})

    serializer = ReviewSerializer(
        data=inject_gym_id(data, gym.gym_id),
        context={"request": request, "gym": gym},
    )
    serializer.is_valid(raise_exception=True)
    return serializer.save(user=actor, gym=gym)


def create_field(*, actor, gym: Gym, data: Any) -> Field:
    if not can_manage_gym(actor, gym):
        raise PermissionDenied("Only the gym owner or admin can create fields.")

    serializer = FieldSerializer(data=inject_gym_id(data, gym.gym_id))
    serializer.is_valid(raise_exception=True)
    field = serializer.save(gym=gym)
    log_gym_action(
        actor=actor,
        action="field_created",
        gym=gym,
        target_type="field",
        target_id=field.field_id,
    )
    return field


def create_timeslot(*, actor, gym: Gym, data: Any) -> TimeSlot:
    serializer = TimeSlotSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    field = serializer.validated_data["field"]
    if field.gym_id != gym.gym_id:
        raise serializers.ValidationError({"field": "Field does not belong to this gym."})
    if not can_manage_gym(actor, gym):
        raise PermissionDenied("Only the gym owner or admin can create time slots.")
    slot = serializer.save()
    return slot

