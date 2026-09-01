"""Move remaining mobile-SQLite business data to Neon.

Adds:
  * ``orders`` columns that previously only existed in the on-device SQLite
    schema (``source``, ``hasSlip``, ``slipData`` and the Excel-import extras
    ``chalaanNo`` / ``chalaanDate`` / ``transportGrn`` / ``paymentMode`` /
    ``grSourceLabel``).
  * ``staff_settlements`` — owner/labour/driver cash handovers a staff member
    records out of their day's collection.
  * ``import_history`` — one row per Excel GR bulk-import batch.

Revision ID: 017_neon_business_data
Revises: 016_add_area_columns
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "017_neon_business_data"
down_revision = "016_add_area_columns"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(conn).get_columns(table)}


def _table_exists(conn, table: str) -> bool:
    return inspect(conn).has_table(table)


ORDER_COLUMNS = [
    ("source", sa.String(20), {"nullable": False, "server_default": "manual"}),
    ("hasSlip", sa.Boolean(), {"nullable": False, "server_default": sa.false()}),
    ("slipData", sa.Text(), {"nullable": True}),
    ("chalaanNo", sa.String(80), {"nullable": True}),
    ("chalaanDate", sa.String(40), {"nullable": True}),
    ("transportGrn", sa.String(80), {"nullable": True}),
    ("paymentMode", sa.String(40), {"nullable": True}),
    ("grSourceLabel", sa.String(120), {"nullable": True}),
]


def upgrade() -> None:
    bind = op.get_bind()

    # Drop the abandoned out-of-band `money_distributions` table (test data
    # only, never committed to the codebase). Settlements live in
    # `staff_settlements`.
    if _table_exists(bind, "money_distributions"):
        op.drop_table("money_distributions")

    for name, type_, kwargs in ORDER_COLUMNS:
        if not _column_exists(bind, "orders", name):
            op.add_column("orders", sa.Column(name, type_, **kwargs))

    if not _table_exists(bind, "staff_settlements"):
        op.create_table(
            "staff_settlements",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column(
                "staffId",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("type", sa.String(16), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "createdBy",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("clientRequestId", sa.String(100), nullable=True),
            sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("type IN ('owner', 'labour', 'driver')", name="ck_staff_settlements_type"),
            sa.CheckConstraint("amount > 0", name="ck_staff_settlements_amount_positive"),
        )
        op.create_index("ix_staff_settlements_staffId", "staff_settlements", ["staffId"])
        op.create_index("ix_staff_settlements_createdAt", "staff_settlements", ["createdAt"])

    # `clientRequestId` may be missing on a DB where the table pre-dates this
    # migration (created out-of-band). Add it + its unique index idempotently.
    if _table_exists(bind, "staff_settlements") and not _column_exists(bind, "staff_settlements", "clientRequestId"):
        op.add_column("staff_settlements", sa.Column("clientRequestId", sa.String(100), nullable=True))
    _ss_indexes = {ix["name"] for ix in inspect(bind).get_indexes("staff_settlements")}
    if "ix_staff_settlements_createdAt" not in _ss_indexes:
        op.create_index("ix_staff_settlements_createdAt", "staff_settlements", ["createdAt"])
    if "uq_staff_settlements_clientRequestId" not in _ss_indexes:
        op.create_index(
            "uq_staff_settlements_clientRequestId",
            "staff_settlements",
            ["clientRequestId"],
            unique=True,
            postgresql_where=sa.text('"clientRequestId" IS NOT NULL'),
        )

    if not _table_exists(bind, "import_history"):
        op.create_table(
            "import_history",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("fileName", sa.String(255), nullable=False),
            sa.Column("importedAt", sa.DateTime(timezone=True), nullable=False),
            sa.Column("importedByName", sa.String(160), nullable=True),
            sa.Column(
                "importedBy",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "companyId",
                sa.Uuid(),
                sa.ForeignKey("companies.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("area", sa.String(100), nullable=True),
            sa.Column("totalRows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("importedRows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("duplicateRows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failedRows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_import_history_companyId", "import_history", ["companyId"])
        op.create_index("ix_import_history_area", "import_history", ["area"])

    # Supporting indexes for the staff-work / daily-collection query patterns.
    existing_order_indexes = {ix["name"] for ix in inspect(bind).get_indexes("orders")}
    if "ix_orders_assignedStaffId" not in existing_order_indexes:
        op.create_index("ix_orders_assignedStaffId", "orders", ["assignedStaffId"])
    existing_payment_indexes = {ix["name"] for ix in inspect(bind).get_indexes("payments")}
    if "ix_payments_recordedBy" not in existing_payment_indexes:
        op.create_index("ix_payments_recordedBy", "payments", ["recordedBy"])
    if "ix_payments_createdAt" not in existing_payment_indexes:
        op.create_index("ix_payments_createdAt", "payments", ["createdAt"])


def downgrade() -> None:
    bind = op.get_bind()
    for name in ("ix_payments_createdAt", "ix_payments_recordedBy"):
        try:
            op.drop_index(name, table_name="payments")
        except Exception:
            pass
    try:
        op.drop_index("ix_orders_assignedStaffId", table_name="orders")
    except Exception:
        pass
    if _table_exists(bind, "import_history"):
        op.drop_table("import_history")
    if _table_exists(bind, "staff_settlements"):
        op.drop_table("staff_settlements")
    for name, _type, _kwargs in reversed(ORDER_COLUMNS):
        if _column_exists(bind, "orders", name):
            op.drop_column("orders", name)
