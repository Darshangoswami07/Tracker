"""Correct order_discount_history schema drift.

The ``order_discount_history`` table was created directly against Postgres
before this migration chain caught up to it (see ``024_order_discount`` and
``023a_orders_staff_scope_index`` for the earlier reconciliation of a
similar out-of-band change). That out-of-band CREATE TABLE diverged from
what ``024_order_discount`` and the ``OrderDiscountHistory`` model actually
declare in two ways:

1. ``previousDiscountAmount`` was created ``NOT NULL``. It must be
   nullable: the very first "applied" action on any GR legitimately has no
   prior discount, so the application always writes ``NULL`` there for
   that case (see ``app/api/v1/discount.py::apply_discount``). The NOT NULL
   constraint made every first-time discount apply fail with
   ``psycopg.errors.NotNullViolation`` — this is the exact cause of the
   discount API's HTTP 500.
2. ``appliedBy`` was created as ``VARCHAR`` instead of ``UUID`` (the model
   declares ``Uuid``, matching ``orders.discountedBy`` and every other
   user-id foreign column in this codebase).

The table is confirmed empty (0 rows) as of this migration, so both
corrections are lossless — nothing to backfill or convert. The orphan
``appliedByName`` column (present in the live table, not part of the
model) is left untouched here since dropping it isn't required to fix the
bug and isn't part of this migration's purpose; the ORM simply never reads
or writes it.
"""
from alembic import op

revision = "025_discount_history_fix"
down_revision = "024_order_discount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE order_discount_history '
        'ALTER COLUMN "previousDiscountAmount" DROP NOT NULL'
    )
    op.execute(
        'ALTER TABLE order_discount_history '
        'ALTER COLUMN "appliedBy" TYPE UUID USING "appliedBy"::uuid'
    )


def downgrade() -> None:
    op.execute(
        'ALTER TABLE order_discount_history '
        'ALTER COLUMN "appliedBy" TYPE VARCHAR USING "appliedBy"::varchar'
    )
    op.execute(
        'ALTER TABLE order_discount_history '
        'ALTER COLUMN "previousDiscountAmount" SET NOT NULL'
    )
