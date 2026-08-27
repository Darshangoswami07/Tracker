"""Add payments table.

Creates the payments table to track individual payment records against
GR/Order shipments. Each payment records amount, method, notes, and
who recorded it.

Revision ID: 015_add_payments_table
Revises: 014_update_order_status_enum
Create Date: 2026-08-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '015_add_payments_table'
down_revision = '014_update_order_status_enum'
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return inspect(conn).has_table(table_name)


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, 'payments'):
        op.create_table(
            'payments',
            sa.Column('id', sa.Uuid(), primary_key=True),
            sa.Column('orderId', sa.Uuid(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('amount', sa.Numeric(12, 2), nullable=False),
            sa.Column('paymentMethod', sa.String(50), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('recordedBy', sa.String(160), nullable=True),
            sa.Column('createdAt', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updatedAt', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table('payments')
