"""Add area column to orders and users tables.

Revision ID: 016_add_area_columns
Revises: 015_add_payments_table
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "016_add_area_columns"
down_revision = "015_add_payments_table"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    columns = [c["name"] for c in inspect(conn).get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    bind = op.get_bind()

    # Add `area` column to orders for area-based staff access control.
    if not _column_exists(bind, "orders", "area"):
        op.add_column("orders", sa.Column("area", sa.String(100), nullable=True))
    # Ensure index exists (idempotent).
    try:
        op.create_index("ix_orders_area", "orders", ["area"])
    except Exception:
        pass  # index already exists

    # Add `area` column to users for staff area assignment.
    if not _column_exists(bind, "users", "area"):
        op.add_column("users", sa.Column("area", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_orders_area", table_name="orders")
    op.drop_column("orders", "area")
    op.drop_column("users", "area")
