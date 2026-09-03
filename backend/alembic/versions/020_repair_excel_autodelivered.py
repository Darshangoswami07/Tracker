"""Data repair: revert Excel-imported GRs that the import's own
``reconcile_delivered_status`` call wrongly auto-advanced to delivered/cleared.

Root cause (fixed in code): ``bulk_import`` used to call
``reconcile_delivered_status`` on every freshly-created row. For an Excel row
with ``toPay <= 0`` or ``paymentAmount >= toPay`` that flipped a brand-new
GR straight from ``pending`` to ``delivered`` (then the reporting layer showed
some as ``cleared``) — even though nothing was ever actually delivered.

This migration reverts ONLY rows carrying that exact fingerprint:

  * ``source = 'excel'``
  * ``status <> 'pending'``
  * ``deliveryTime IS NULL``            (never really delivered)
  * exactly two ``order_status_history`` rows, the latmost being
    ``notes = 'Auto-marked delivered: nothing outstanding'``
    (the string ``reconcile_delivered_status`` writes)

For each match: delete that bogus history row and set ``status = 'pending'``.
GRs delivered by a real staff/admin action (a "Changed from ... to
delivered/cleared" history row, or a non-null ``deliveryTime``) are left
untouched. No blanket ``UPDATE orders SET status``. Shop links, staff
assignments, payments, GR fields — all untouched.

Revision ID: 020_repair_excel_autodelivered
Revises: 019_shop_identity_consignee
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = "020_repair_excel_autodelivered"
down_revision = "019_shop_identity_consignee"
branch_labels = None
depends_on = None

_AUTO_NOTE = "Auto-marked delivered: nothing outstanding"

_MATCH = sa.text(
    """
    SELECT o.id
    FROM orders o
    WHERE o.source = 'excel'
      AND o.status <> 'pending'
      AND o."deliveryTime" IS NULL
      AND (SELECT count(*) FROM order_status_history h WHERE h."orderId" = o.id) = 2
      AND (
        SELECT h.notes FROM order_status_history h
        WHERE h."orderId" = o.id ORDER BY h."createdAt" DESC LIMIT 1
      ) = :note
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    ids = [r[0] for r in bind.execute(_MATCH, {"note": _AUTO_NOTE}).fetchall()]
    if not ids:
        return
    bind.execute(
        sa.text(
            'DELETE FROM order_status_history WHERE "orderId" = ANY(:ids) AND notes = :note'
        ),
        {"ids": ids, "note": _AUTO_NOTE},
    )
    bind.execute(
        sa.text("UPDATE orders SET status = 'pending', \"updatedAt\" = now() WHERE id = ANY(:ids)"),
        {"ids": ids},
    )


def downgrade() -> None:
    # Not reversible: the original (wrong) auto-delivered state is not worth
    # reconstructing. No-op.
    pass
