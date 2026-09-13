"""Admin-only order Discount feature.

Adds four nullable, additive columns to ``orders`` holding the CURRENT
active discount on that GR — ``discountAmount`` is a running total, not a
log; the append-only audit trail lives in the new ``order_discount_history``
table created below. Effective remaining is always computed on the fly as
``toPay - totalPaid - discountAmount`` (see ``gr_status_service``); no
existing money column (``toPay``, ``payments.amount``) is touched by this
migration or by the feature it backs.

Nullable, no default, no backfill: every existing GR keeps
``discountAmount IS NULL`` (treated as 0 everywhere it's read), so no
historical totals change. Purely additive, no data loss.

Revision ID: 024_order_discount
Revises: 023a_orders_staff_scope_index
Create Date: 2026-09-13
"""
from alembic import op

revision = "024_order_discount"
down_revision = "023a_orders_staff_scope_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC(12, 2)'
    )
    op.execute(
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountReason" TEXT'
    )
    op.execute(
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountedBy" UUID'
    )
    op.execute(
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountedAt" TIMESTAMP WITH TIME ZONE'
    )

    # Append-only audit trail: one row per apply/modify/cancel action. Never
    # updated or deleted by application code. FK CASCADE on orderId — a GR's
    # discount history is part of that GR's own record and has no reason to
    # outlive it (mirrors order_status_history's own FK).
    op.execute(
        '''
        CREATE TABLE IF NOT EXISTS order_discount_history (
            id UUID PRIMARY KEY,
            "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            action VARCHAR(20) NOT NULL,
            "discountAmount" NUMERIC(12, 2) NOT NULL,
            "previousDiscountAmount" NUMERIC(12, 2),
            reason TEXT,
            "appliedBy" UUID,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        '''
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_order_discount_history_orderId '
        'ON order_discount_history ("orderId")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS order_discount_history')
    op.execute('ALTER TABLE orders DROP COLUMN IF EXISTS "discountedAt"')
    op.execute('ALTER TABLE orders DROP COLUMN IF EXISTS "discountedBy"')
    op.execute('ALTER TABLE orders DROP COLUMN IF EXISTS "discountReason"')
    op.execute('ALTER TABLE orders DROP COLUMN IF EXISTS "discountAmount"')
