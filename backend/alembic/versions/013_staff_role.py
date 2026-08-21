"""Add STAFF to the user role.

The new self-service Staff portal introduces ``UserRole.STAFF``
("staff", 5 chars) — the ``users.role`` column is already
``VARCHAR(30)`` (widened in ``002_super_admin_role``), so no column
change is needed here. This migration only extends the recorded
PostgreSQL ``user_role`` enum type if it exists (schema built via
native_enum=False may not have one at all), mirroring the idempotent
pattern used by ``002_super_admin_role``.

No existing rows, tables, or columns are modified or dropped.

Revision ID: 013_staff_role
Revises: 012_gr_proprietor_phone
Create Date: 2026-08-21 00:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '013_staff_role'
down_revision = '012_gr_proprietor_phone'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ "
        "BEGIN "
        "  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN "
        "    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff'; "
        "  END IF; "
        "END $$;"
    )


def downgrade() -> None:
    # PostgreSQL does not support removing a value from an enum type.
    pass
