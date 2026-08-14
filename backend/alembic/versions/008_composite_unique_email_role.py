"""Add composite unique constraint on users.email + role.

Revision ID: 008
Revises: 007_registration_company_id
Create Date: 2026-08-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007_registration_company_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing unique constraint on email (if it exists)
    op.drop_index('ix_users_email', table_name='users', if_exists=True)
    # Actually, the original model had `unique=True` on email column, which
    # creates a named index. Let us check what the index name is.
    # If the index has a different name, we need to adjust.
    # Create a new composite unique constraint on (email, role)
    op.create_unique_constraint('uq_email_role', 'users', ['email', 'role'])


def downgrade() -> None:
    # Drop the composite unique constraint
    op.drop_constraint('uq_email_role', 'users', type_='unique')
    # Re-create the original unique index on email (if it was there before)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)