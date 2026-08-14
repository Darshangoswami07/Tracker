"""Add companyId to users for multi-tenant scoping.

Adds a nullable `companyId` FK (-> companies.id) directly on `users`. This
becomes the single source of truth for a user's tenant/company, used by the
tenant-scoping checks across the GR/shipment, tracking, staff, and driver
endpoints. Nullable and unbackfilled: existing users become NULL, which is
treated as "platform-level / unscoped" (today's behavior), so no existing
account is affected by this migration.

Revision ID: 006_user_company_id
Revises: 005_drop_otp_channel
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '006_user_company_id'
down_revision: Union[str, Sequence[str], None] = '005_drop_otp_channel'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('companyId', sa.Uuid(), nullable=True))
    op.create_index('ix_users_companyId', 'users', ['companyId'])
    op.create_foreign_key(
        'fk_users_companyId_companies',
        'users',
        'companies',
        ['companyId'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_companyId_companies', 'users', type_='foreignkey')
    op.drop_index('ix_users_companyId', table_name='users')
    op.drop_column('users', 'companyId')
