"""Extend orders with GR (transport slip) fields and add order_attachments.

Reuses the existing `orders` table as the GR/shipment entity (orderNumber
doubles as the GR number) instead of creating a parallel table. Adds the
consignor/consignee/particulars/package-count fields the GR reference
requires, an `assignedStaffId` column mirroring the existing `driverId`
pattern, and relaxes `customerId` to nullable so Admin/Staff can create a GR
for a walk-in consignor with no registered Customer account.

`order_attachments` stores uploaded slip/photo files (path + metadata only,
never the binary itself) with one row per upload so "replace" never destroys
history.

Revision ID: 004_gr_shipment_fields
Revises: 003_remove_phone_uniqueness
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '004_gr_shipment_fields'
down_revision: Union[str, Sequence[str], None] = '003_remove_phone_uniqueness'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('orders', 'customerId', existing_type=sa.Uuid(), nullable=True)

    op.add_column('orders', sa.Column('assignedStaffId', sa.Uuid(), nullable=True))
    op.add_column('orders', sa.Column('consignorName', sa.String(length=160), nullable=True))
    op.add_column('orders', sa.Column('consigneeName', sa.String(length=160), nullable=True))
    op.add_column('orders', sa.Column('particulars', sa.String(length=500), nullable=True))
    op.add_column('orders', sa.Column('packageCount', sa.Integer(), nullable=True))

    op.create_index('ix_orders_assignedStaffId', 'orders', ['assignedStaffId'])
    op.create_foreign_key(
        'fk_orders_assignedStaffId_employees',
        'orders', 'employees',
        ['assignedStaffId'], ['id'],
    )

    # `order_attachments` is a brand-new table with no prior data anywhere, so
    # it is safe to let the app's own `Base.metadata.create_all()` (run on
    # every backend startup, see database/db.py) create it from the
    # OrderAttachment model directly — this migration only touches the
    # pre-existing `orders` table, which create_all() cannot alter in place.
    pass


def downgrade() -> None:
    op.drop_constraint('fk_orders_assignedStaffId_employees', 'orders', type_='foreignkey')
    op.drop_index('ix_orders_assignedStaffId', table_name='orders')
    op.drop_column('orders', 'packageCount')
    op.drop_column('orders', 'particulars')
    op.drop_column('orders', 'consigneeName')
    op.drop_column('orders', 'consignorName')
    op.drop_column('orders', 'assignedStaffId')
    op.alter_column('orders', 'customerId', existing_type=sa.Uuid(), nullable=False)
