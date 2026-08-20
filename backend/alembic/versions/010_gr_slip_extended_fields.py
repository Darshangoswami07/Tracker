"""Extend orders with the full structured GR/slip field set.

Adds the additional business fields a real transport/Bilti slip carries
beyond the original 10-field GR form (GR date, transport company/GSTIN,
EWB number, bill type, special service, from/to/delivery-at locations,
rate, goods value, and the charges block: GR charge, freight, labour,
P.F., door delivery, tax/GST, net amount, plus the issuing proprietor
name). All columns are nullable - a GR can still be created with only the
original required fields, and OCR only ever fills in what it can
confidently read (see `app/services/slip_parser.py`). No existing column
is altered and no data backfill is required.

Revision ID: 010_gr_slip_extended_fields
Revises: 009_devices_licenses
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '010_gr_slip_extended_fields'
down_revision: Union[str, Sequence[str], None] = '009_devices_licenses'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_COLUMNS = [
    ('grDate', sa.DateTime(timezone=True)),
    ('transportCompanyName', sa.String(length=160)),
    ('transportGstin', sa.String(length=20)),
    ('ewbNumber', sa.String(length=50)),
    ('billType', sa.String(length=30)),
    ('specialService', sa.String(length=255)),
    ('fromLocation', sa.String(length=160)),
    ('toLocation', sa.String(length=160)),
    ('deliveryAt', sa.String(length=255)),
    ('rate', sa.Float()),
    ('goodsValue', sa.Float()),
    ('grCharge', sa.Float()),
    ('freight', sa.Float()),
    ('labour', sa.Float()),
    ('pf', sa.Float()),
    ('doorDelivery', sa.Float()),
    ('taxGst', sa.Float()),
    ('netAmount', sa.Float()),
    ('proprietorName', sa.String(length=160)),
]


def upgrade() -> None:
    for name, col_type in _NEW_COLUMNS:
        op.add_column('orders', sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_NEW_COLUMNS):
        op.drop_column('orders', name)
