"""Reconcile ix_orders_staff_scope with Alembic history.

This index (on orders.companyId, orders.assignedStaffId, orders.createdAt
DESC — supports staff-scoped GR list queries) already exists in the
database; it was created directly against Postgres at some point outside
Alembic, and the database's alembic_version row was left pointing at a
revision id ("022_staff_scope_index") that was never committed to this
repository (verified via exhaustive git history search across all
branches/commits — no such file or content ever existed here).

This migration does not create anything new. It exists purely so the
migration chain accurately documents an index that is already live,
using CREATE INDEX IF NOT EXISTS so it is a no-op wherever the index is
already present (every real environment) and additive-only wherever it
somehow isn't. No table is touched, no row is read or written, no
existing column or data changes.

Revision ID: 023a_orders_staff_scope_index
Revises: 023_payments_received_by
Create Date: 2026-09-13
"""
from alembic import op

revision = "023a_orders_staff_scope_index"
down_revision = "023_payments_received_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_orders_staff_scope" '
        'ON orders ("companyId", "assignedStaffId", "createdAt" DESC)'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_orders_staff_scope"')
