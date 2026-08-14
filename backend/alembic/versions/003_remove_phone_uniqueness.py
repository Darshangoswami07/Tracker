"""make phone numbers non-unique (email remains the only unique identity).

Revision ID: 003_remove_phone_uniqueness
Revises: 47b951c17944
Create Date: 2026-08-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_remove_phone_uniqueness'
down_revision: Union[str, Sequence[str], None] = '47b951c17944'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop the phone UNIQUE indexes; keep email UNIQUE.

    Multiple users/requests may now share the same phone number. A non-unique
    index is re-created so phone lookups stay fast.
    """
    op.drop_index('ix_users_phone', table_name='users')
    op.drop_index('ix_registration_requests_phone', table_name='registration_requests')
    op.create_index('ix_users_phone', 'users', ['phone'], unique=False)
    op.create_index('ix_registration_requests_phone', 'registration_requests', ['phone'], unique=False)


def downgrade() -> None:
    """Restore the phone UNIQUE constraints (breaking shared-phone accounts)."""
    op.drop_index('ix_users_phone', table_name='users')
    op.drop_index('ix_registration_requests_phone', table_name='registration_requests')
    op.create_index('ix_users_phone', 'users', ['phone'], unique=True)
    op.create_index('ix_registration_requests_phone', 'registration_requests', ['phone'], unique=True)