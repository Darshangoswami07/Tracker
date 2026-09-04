"""Add payments.receivedBy — who actually received the money (STAFF/ADMIN),
distinct from ``recordedBy`` (who entered the transaction).

Nullable, no default, no backfill: existing rows keep ``receivedBy IS NULL``.
Application code treats NULL the same as ``'STAFF'`` everywhere it matters
(staff collection totals, Direct UPI Received), which is exactly the
behavior every historical payment already had before this column existed —
so no data or historical totals change. Purely additive, no data loss.

Revision ID: 023_payments_received_by
Revises: 022_ordernumber_partial_unique
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = "023_payments_received_by"
down_revision = "022_ordernumber_partial_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE payments ADD COLUMN IF NOT EXISTS "receivedBy" VARCHAR(16)'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE payments DROP COLUMN IF EXISTS "receivedBy"')
