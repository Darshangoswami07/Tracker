"""Add SUPER_ADMIN (and new roles) to the user role.

The ``users.role`` and ``registration_requests.requestedRole`` columns are
``VARCHAR(10)`` (``native_enum=False``) and need widening to hold
``super_admin`` (11 chars). This migration also extends the recorded
PostgreSQL ``user_role`` enum type if it exists.

Revision ID: 002_super_admin_role
Revises: 001_approval_system
Create Date: 2026-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_super_admin_role'
down_revision = '001_approval_system'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Widen the role columns so the new, longer role values fit.
    op.alter_column("users", "role", existing_type=sa.Unicode(10), type_=sa.Unicode(30), existing_nullable=False)
    op.alter_column("registration_requests", "requestedRole", existing_type=sa.Unicode(10), type_=sa.Unicode(30), existing_nullable=False)

    # The enum type may not exist at all (schema may be built via metadata.
    # create_all with native_enum=False). Use a DO block so this is idempotent.
    op.execute(
        "DO $$ "
        "BEGIN "
        "  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN "
        "    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer'; "
        "    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'business_owner'; "
        "    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'; "
        "    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'; "
        "  END IF; "
        "END $$;"
    )


def downgrade() -> None:
    op.alter_column("registration_requests", "requestedRole", existing_type=sa.Unicode(30), type_=sa.Unicode(10), existing_nullable=False)
    op.alter_column("users", "role", existing_type=sa.Unicode(30), type_=sa.Unicode(10), existing_nullable=False)
    # PostgreSQL does not support removing a value from an enum type.
