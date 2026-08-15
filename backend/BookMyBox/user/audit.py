# user/audit.py
"""The only place that should create an AdminActionLog row — a single plain
function, mirroring user/notifications.py::notify()'s "keep it simple, no
queue" pattern. Other apps (boxes, owner_dashboard, ...) import this the same
way they already import notify()/permissions from user — never the reverse —
so wiring this into their admin actions doesn't create a circular import.
"""

from .models import AdminActionLog


def log_admin_action(actor, action, target=None, target_repr='', details=None,
                      target_type=None, target_id=None):
    """Record one admin action.

    `target` is a live model instance to derive target_type/target_id/
    target_repr from automatically — pass it whenever the instance is still
    around after the mutation (box approve/reject, payout record, user
    update/create). For a hard-delete, where the instance's pk is cleared by
    Model.delete() before you can log it, pass `target_type`/`target_id`/
    `target_repr` explicitly instead (captured before the delete call) and
    leave `target` unset.
    """
    if target is not None:
        target_type = target_type or target.__class__.__name__
        target_id = target_id if target_id is not None else target.pk
        if not target_repr:
            target_repr = str(target)

    return AdminActionLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type or '',
        target_id=str(target_id) if target_id is not None else '',
        target_repr=target_repr,
        details=details or {},
    )
