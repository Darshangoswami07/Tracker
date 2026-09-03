"""Indexes for the GR / Shipments list query.

``GET /admin/orders`` (``OrderRepository.get_all_orders``) always runs, per
tenant:

    WHERE "isActive" AND "companyId" = :c [AND "area" = :a ...]
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT :n OFFSET :o

``companyId`` / ``area`` / ``assignedStaffId`` are already indexed (declared
on the model). The ``ORDER BY "createdAt" DESC`` had no supporting index, so
Postgres sorts the whole filtered set on every page. This adds:

  * ``ix_orders_company_created`` — composite ``("companyId", "createdAt" DESC)``
    so a tenant's list is an index range scan + already-ordered read.
  * ``ix_orders_created`` — plain ``"createdAt" DESC`` for the unscoped
    platform-admin/super-admin listing.

Both are plain B-tree, created ``IF NOT EXISTS``, no data change.

Revision ID: 021_orders_list_indexes
Revises: 020_repair_excel_autodelivered
Create Date: 2026-09-03
"""
from alembic import op

revision = "021_orders_list_indexes"
down_revision = "020_repair_excel_autodelivered"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_orders_company_created '
        'ON orders ("companyId", "createdAt" DESC)'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_orders_created '
        'ON orders ("createdAt" DESC)'
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_company_created")
    op.execute("DROP INDEX IF EXISTS ix_orders_created")
