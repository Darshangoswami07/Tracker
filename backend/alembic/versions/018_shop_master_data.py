"""Introduce Shop as a persisted master-data entity, independent of GRs.

Previously "shops" were purely a derived/virtual grouping over active
(non-deleted) ``orders.consignorName`` rows — there was no row anywhere that
represented a shop's existence on its own. That meant deleting a shop's last
active GR made the shop silently vanish from "Admin -> All Shops" even
though nothing about the shop itself was ever deleted.

Adds:
  * ``shops`` — master table, one row per (company, area, consignor name).
  * ``orders.shopId`` — nullable FK to ``shops.id`` (``ON DELETE SET NULL``,
    never CASCADE: a GR is the child here, so deleting/soft-deleting a GR
    can never delete or otherwise touch its Shop).

Backfills ``shops`` from every distinct (companyId, area, consignorName)
combination seen across ALL existing ``orders`` rows (active AND
soft-deleted), so a shop whose only GR(s) were already deleted before this
migration still gets a Shop row and keeps showing up going forward.

Revision ID: 018_shop_master_data
Revises: 017_neon_business_data
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "018_shop_master_data"
down_revision = "017_neon_business_data"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return inspect(conn).has_table(table)


def _column_exists(conn, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "shops"):
        op.create_table(
            "shops",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("companyId", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("area", sa.String(100), nullable=True),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("companyId", "area", "name", name="uq_shops_company_area_name"),
        )
        op.create_index("ix_shops_companyId", "shops", ["companyId"])
        op.create_index("ix_shops_area", "shops", ["area"])
        op.create_index("ix_shops_name", "shops", ["name"])

    else:
        # ``shops`` was already created out-of-band (e.g. metadata.create_all on
        # a dev boot) before this migration ran. Make sure the constraint and
        # indexes the model expects still exist so the schema matches the ORM.
        existing = {
            ix["name"] for ix in inspect(bind).get_indexes("shops")
        } | {
            uc["name"] for uc in inspect(bind).get_unique_constraints("shops")
        }
        if "uq_shops_company_area_name" not in existing:
            op.create_unique_constraint(
                "uq_shops_company_area_name", "shops", ["companyId", "area", "name"]
            )
        for ix_name, col in (
            ("ix_shops_companyId", "companyId"),
            ("ix_shops_area", "area"),
            ("ix_shops_name", "name"),
        ):
            if ix_name not in existing:
                op.create_index(ix_name, "shops", [col])

    if not _column_exists(bind, "orders", "shopId"):
        op.add_column(
            "orders",
            sa.Column("shopId", sa.Uuid(), sa.ForeignKey("shops.id", ondelete="SET NULL"), nullable=True),
        )
        op.create_index("ix_orders_shopId", "orders", ["shopId"])

    # Backfill: one Shop per distinct (companyId, area, consignorName) across
    # every order ever created, active or (soft-)deleted, so pre-existing
    # shops whose GRs were already all deleted don't get left out.
    op.execute(
        sa.text(
            """
            INSERT INTO shops ("id", "companyId", "area", "name", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), o."companyId", o.area, o."consignorName", now(), now()
            FROM orders o
            WHERE o."consignorName" IS NOT NULL AND o."consignorName" <> ''
            GROUP BY o."companyId", o.area, o."consignorName"
            ON CONFLICT ON CONSTRAINT uq_shops_company_area_name DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE orders o
            SET "shopId" = s.id
            FROM shops s
            WHERE o."shopId" IS NULL
              AND o."consignorName" IS NOT NULL AND o."consignorName" <> ''
              AND o."companyId" = s."companyId"
              AND o."consignorName" = s.name
              AND o.area IS NOT DISTINCT FROM s.area
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    if _column_exists(bind, "orders", "shopId"):
        try:
            op.drop_index("ix_orders_shopId", table_name="orders")
        except Exception:
            pass
        op.drop_column("orders", "shopId")
    if _table_exists(bind, "shops"):
        op.drop_table("shops")
