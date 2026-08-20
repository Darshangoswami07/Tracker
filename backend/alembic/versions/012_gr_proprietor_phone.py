"""Add proprietorPhone - the issuing transport company's proprietor contact
number, printed directly beneath the proprietor name on many slips.

Nullable and purely additive - no existing column, table, or row is
touched. Follows the same pattern as 010/011.

Revision ID: 012_gr_proprietor_phone
Revises: 011_gr_parties_and_charges_fields
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '012_gr_proprietor_phone'
down_revision: Union[str, Sequence[str], None] = '011_gr_parties_and_charges_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('proprietorPhone', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'proprietorPhone')
