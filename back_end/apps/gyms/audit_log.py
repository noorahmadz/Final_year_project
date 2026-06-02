"""Gym audit logging — kept separate from viewsets to avoid circular imports with domain.ops."""

from .models import GymAuditLog


def log_gym_action(*, actor, action, gym=None, target_type='gym', target_id=None, metadata=None):
    GymAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        gym=gym,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata or {}
    )
