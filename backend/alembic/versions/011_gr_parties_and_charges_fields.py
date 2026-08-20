"""Add a few more optional GR/slip fields: To Pay, package type, and
consignor/consignee GSTIN + phone (manual-entry-capable — OCR does not
auto-fill the GSTIN/phone pairs since a slip's single blank GSTIN line and
lack of per-party phone labels make automatic attribution unreliable; these
exist so a user can fill them in by hand during review).

All columns are nullable and purely additive - no existing column, table,
or row is touched. Follows the same pattern as
010_gr_slip_extended_fields.py.

Revision ID: 011_gr_parties_and_charges_fields
Revises: 010_gr_slip_extended_fields
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '011_gr_parties_and_charges_fields'
down_revision: Union[str, Sequence[str], None] = '010_gr_slip_extended_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_COLUMNS = [
    ('toPay', sa.Float()),
    ('packageType', sa.String(length=80)),
    ('consignorGstin', sa.String(length=20)),
    ('consignorPhone', sa.String(length=20)),
    ('consigneeGstin', sa.String(length=20)),
    ('consigneePhone', sa.String(length=20)),
]


def upgrade() -> None:
    for name, col_type in _NEW_COLUMNS:
        op.add_column('orders', sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_NEW_COLUMNS):
        op.drop_column('orders', name)
