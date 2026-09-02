"""Re-base Shop identity on the GR's CONSIGNEE, not its consignor.

Migration 018 introduced ``shops`` as master data but seeded it (and linked
``orders.shopId``) from ``orders.consignorName`` — the forwarding/source
agent. The business identity of a "shop" is the **consignee**: the actual
customer / destination shop the goods are delivered to (GR 7544's shop is
"New Rawal Video", not "Jai Kailash Enterprises").

This migration, data-only (no schema change):

  1. Creates one ``shops`` row per distinct
     ``(companyId, area, normalized consigneeName)`` seen across ALL orders
     (active AND soft-deleted — so a consignee whose GRs were all deleted
     still keeps a listable Shop), skipping any that already exist
     case-insensitively.
  2. Re-points every ``orders.shopId`` at the Shop for that order's
     consignee (normalized, case-insensitive match).
  3. Deletes ``shops`` rows that no order references any more — i.e. the
     old consignor-derived records and any empty case-variant duplicates.
     GR data itself is never touched; ``consignorName`` stays on every GR
     as metadata.

Normalization = trim + collapse internal whitespace; matching is also
case-insensitive, so "Amit Agencies" / "  amit  agencies " / "AMIT
AGENCIES" collapse to a single Shop.

Revision ID: 019_shop_identity_consignee
Revises: 018_shop_master_data
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = "019_shop_identity_consignee"
down_revision = "018_shop_master_data"
branch_labels = None
depends_on = None

_NORM = r"btrim(regexp_replace({col}, '\s+', ' ', 'g'))"


def upgrade() -> None:
    norm_consignee = _NORM.format(col='o."consigneeName"')

    # 1. Create missing consignee shops (normalized, case-insensitive dedupe).
    op.execute(
        sa.text(
            f"""
            INSERT INTO shops ("id", "companyId", "area", "name", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), x."companyId", x.area, x.name, now(), now()
            FROM (
                SELECT DISTINCT o."companyId" AS "companyId",
                       o.area AS area,
                       {norm_consignee} AS name
                FROM orders o
                WHERE o."consigneeName" IS NOT NULL
                  AND btrim(o."consigneeName") <> ''
            ) x
            WHERE NOT EXISTS (
                SELECT 1 FROM shops s
                WHERE s."companyId" = x."companyId"
                  AND s.area IS NOT DISTINCT FROM x.area
                  AND lower(s.name) = lower(x.name)
            )
            """
        )
    )

    # 2. Re-point every order at its consignee Shop.
    op.execute(
        sa.text(
            f"""
            UPDATE orders o
            SET "shopId" = s.id
            FROM shops s
            WHERE s."companyId" = o."companyId"
              AND s.area IS NOT DISTINCT FROM o.area
              AND lower(s.name) = lower({norm_consignee})
              AND o."consigneeName" IS NOT NULL
              AND btrim(o."consigneeName") <> ''
              AND ("shopId" IS DISTINCT FROM s.id)
            """
        )
    )

    # 2b. A GR with no usable consignee has no shop.
    op.execute(
        sa.text(
            """
            UPDATE orders o
            SET "shopId" = NULL
            WHERE (o."consigneeName" IS NULL OR btrim(o."consigneeName") = '')
              AND o."shopId" IS NOT NULL
            """
        )
    )

    # 3. Drop shops no order references (old consignor rows + empty dups).
    op.execute(
        sa.text(
            """
            DELETE FROM shops s
            WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o."shopId" = s.id)
            """
        )
    )


def downgrade() -> None:
    # Best-effort reverse: re-seed/link from consignorName (mirrors 018's
    # backfill). Consignee-only shops with no consignor equivalent are left.
    norm_consignor = _NORM.format(col='o."consignorName"')
    op.execute(
        sa.text(
            f"""
            INSERT INTO shops ("id", "companyId", "area", "name", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), x."companyId", x.area, x.name, now(), now()
            FROM (
                SELECT DISTINCT o."companyId" AS "companyId", o.area AS area,
                       {norm_consignor} AS name
                FROM orders o
                WHERE o."consignorName" IS NOT NULL AND btrim(o."consignorName") <> ''
            ) x
            WHERE NOT EXISTS (
                SELECT 1 FROM shops s
                WHERE s."companyId" = x."companyId"
                  AND s.area IS NOT DISTINCT FROM x.area
                  AND lower(s.name) = lower(x.name)
            )
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE orders o
            SET "shopId" = s.id
            FROM shops s
            WHERE s."companyId" = o."companyId"
              AND s.area IS NOT DISTINCT FROM o.area
              AND lower(s.name) = lower({norm_consignor})
              AND o."consignorName" IS NOT NULL AND btrim(o."consignorName") <> ''
            """
        )
    )
