"""Hierarchical role-based access control.

Roles form a strict hierarchy (higher rank = more privilege):

    SUPER_ADMIN > ADMIN > BUSINESS_OWNER / BUSINESS
                 > DISPATCHER > DRIVER > EMPLOYEE > CUSTOMER

Higher-ranked roles implicitly satisfy the requirements of every lower role.
A role may only manage *lower* roles — e.g. ADMIN may manage DRIVERS but may
NOT create/modify/delete SUPER_ADMIN accounts.
"""
from __future__ import annotations

from app.models.enums import UserRole


# Maps each role to its rank. Higher rank = higher privilege.
ROLE_RANK: dict[UserRole, int] = {
    UserRole.CUSTOMER: 0,
    UserRole.STAFF: 5,
    UserRole.EMPLOYEE: 10,
    UserRole.DRIVER: 20,
    UserRole.DISPATCHER: 30,
    UserRole.BUSINESS: 40,
    UserRole.BUSINESS_OWNER: 40,
    UserRole.ADMIN: 50,
    UserRole.SUPER_ADMIN: 100,
}

# Alias roles whose permissions are shared by the same rank.
_ROLE_ALIASES: dict[str, UserRole] = {
    UserRole.BUSINESS_OWNER.value: UserRole.BUSINESS,
    UserRole.BUSINESS.value: UserRole.BUSINESS,
}

SUPER_ADMIN = UserRole.SUPER_ADMIN
ADMIN = UserRole.ADMIN


def role_rank(role: UserRole | str | None) -> int:
    """Returns the numeric privilege rank for a role."""
    if role is None:
        return -1
    if isinstance(role, str):
        role = UserRole(role)
    return ROLE_RANK.get(role, -1)


def is_super_admin(role: UserRole | str | None) -> bool:
    if isinstance(role, str):
        return role == SUPER_ADMIN.value
    return role == SUPER_ADMIN


def is_admin(role: UserRole | str | None) -> bool:
    if isinstance(role, str):
        role = UserRole(role)
    return role in (SUPER_ADMIN, ADMIN)


def passes_role(role: UserRole | str | None, *required: UserRole) -> bool:
    """True if ``role`` matches one of ``required`` OR outranks all of them.

    SUPER_ADMIN always passes every requirement, so it is implicitly granted
    access to every admin/role-guarded endpoint.
    """
    if role is None:
        return False
    actor = UserRole(role) if isinstance(role, str) else role
    if is_super_admin(actor):
        return True

    if not required:
        return False
    actor_rank = role_rank(actor)
    for req in required:
        if actor == req:
            return True
        # Normalize aliases so that e.g. BUSINESS == BUSINESS_OWNER. Both roles
        # must be aliases — a bare None from .get() is NOT a match.
        actor_alias = _ROLE_ALIASES.get(actor.value)
        req_alias = _ROLE_ALIASES.get(req.value)
        if actor_alias is not None and actor_alias == req_alias:
            return True
    min_rank = min(role_rank(r) for r in required)
    return actor_rank > min_rank


def can_manage(actor: UserRole | str | None, target: UserRole | str | None) -> bool:
    """True if ``actor`` may manage (create/update/delete/modify) ``target``.

    A role may only manage strictly *lower* roles. SUPER_ADMIN can manage
    everyone. No role (including ADMIN) may manage SUPER_ADMIN.
    """
    if actor is None or target is None:
        return False
    a = UserRole(actor) if isinstance(actor, str) else actor
    t = UserRole(target) if isinstance(target, str) else target

    if is_super_admin(a):
        # The platform owner may manage everyone, including other admins.
        return True
    if is_admin(t):
        # A non-owner (ADMIN) cannot manage ADMIN or SUPER_ADMIN accounts.
        return False
    return role_rank(a) > role_rank(t)