"""Consolidate GR statuses to four canonical values.

The GR status system is simplified from 8 statuses to 4:
  pending, cleared, uncleared, delivered

Existing data mapping:
  assigned   → pending
  pickup     → pending
  in_transit → pending
  failed     → uncleared
  returned   → uncleared
  cancelled  → uncleared
  delivered  → delivered  (unchanged)
  pending    → pending    (unchanged)

Revision ID: 014_update_order_status_enum
Revises: 013_staff_role
Create Date: 2026-08-25 00:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '014_update_order_status_enum'
down_revision = '013_staff_role'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Map old status values to new canonical statuses.
    # The orders.status column is VARCHAR (native_enum=False), so direct
    # UPDATE statements work without altering the column type.
    op.execute(
        "UPDATE orders SET status = 'pending'   WHERE status IN ('assigned', 'pickup', 'in_transit')"
    )
    op.execute(
        "UPDATE orders SET status = 'uncleared' WHERE status IN ('failed', 'returned', 'cancelled')"
    )

    # Also update order_status_history rows for consistency.
    op.execute(
        "UPDATE order_status_history SET status = 'pending'   WHERE status IN ('assigned', 'pickup', 'in_transit')"
    )
    op.execute(
        "UPDATE order_status_history SET status = 'uncleared' WHERE status IN ('failed', 'returned', 'cancelled')"
    )


def downgrade() -> None:
    # Downgrade is a no-op: the old statuses are no longer valid values
    # in the OrderStatus enum, so reverting would create orphaned values.
    pass
