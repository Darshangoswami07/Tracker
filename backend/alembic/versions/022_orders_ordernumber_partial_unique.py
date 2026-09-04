"""GR-number uniqueness applies to LIVE GRs only (partial unique index).

Historically ``orders.orderNumber`` had a table-wide unique index. That made
it impossible to keep a soft-deleted GR around (its number would block a new
one), so the Excel re-import path physically ``DELETE``d the old soft-deleted
row — and ``payments.orderId`` / ``order_status_history.orderId`` have
``ON DELETE CASCADE``, so that silently erased the staff member's collection
money and activity history for that GR.

This swaps the table-wide unique index for a **partial** one that only covers
live rows (``deletedAt IS NULL``). A soft-deleted GR — with its payments and
status history — is now kept forever as the permanent historical record, and
the same GR number can be created / re-imported again as a new live GR.

Idempotent: detects and drops whatever the existing table-wide unique
index/constraint on ``orderNumber`` is named in this database, then creates
``uq_orders_orderNumber_active`` and a plain lookup index. No row data is
touched. Mirrors ``_ensure_order_number_partial_unique`` in
``app/database/db.py`` (which also runs it on startup).

Revision ID: 022_ordernumber_partial_unique
Revises: 021_orders_list_indexes
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = "022_ordernumber_partial_unique"
down_revision = "021_orders_list_indexes"
branch_labels = None
depends_on = None


_FIND_TABLEWIDE_UNIQUE = sa.text(
    """
    SELECT i.relname AS name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_attribute a
      ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
    WHERE t.relname = 'orders'
      AND x.indisunique
      AND x.indnatts = 1
      AND a.attname = 'orderNumber'
      AND x.indpred IS NULL
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    for (name,) in bind.execute(_FIND_TABLEWIDE_UNIQUE).fetchall():
        op.execute(f'ALTER TABLE orders DROP CONSTRAINT IF EXISTS "{name}"')
        op.execute(f'DROP INDEX IF EXISTS "{name}"')

    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_orderNumber_active" '
        'ON orders ("orderNumber") WHERE "deletedAt" IS NULL'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_orders_orderNumber" ON orders ("orderNumber")'
    )


def downgrade() -> None:
    # Best-effort reverse: only safe if no duplicate GR numbers exist across
    # live + soft-deleted rows. Left as a no-op on the partial index drop to
    # avoid failing a downgrade on legitimately-reused numbers.
    op.execute('DROP INDEX IF EXISTS "uq_orders_orderNumber_active"')
