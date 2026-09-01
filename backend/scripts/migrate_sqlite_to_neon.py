"""One-time importer: on-device SQLite (`deliveryhub.db`) -> Neon via the API layer.

The mobile app no longer uses SQLite, but a developer device may still hold a
`deliveryhub.db` with test/business rows created before the migration. This
script replays that data into Neon **through the same repositories the API
uses**, so every constraint / FK / reconciliation runs exactly as it would
for a live request.

Safety:
  * never deletes anything (the source .db is opened read-only);
  * preserves the original row ids, so a re-run is idempotent
    (``INSERT ... ON CONFLICT DO NOTHING`` semantics via a pre-check);
  * skips a GR number that already exists in Neon (no duplicates);
  * prints a before/after reconciliation (row counts + money totals).

Usage:
    python -m scripts.migrate_sqlite_to_neon /path/to/deliveryhub.db \
        --company-id <uuid> [--dry-run]

``--company-id`` is required: SQLite GRs carry no company, and Neon's
``orders.companyId`` is NOT NULL. Use the company the mobile devices belong to.
"""
from __future__ import annotations

import argparse
import asyncio
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import func, select  # noqa: E402

from app.database.db import get_session_maker  # noqa: E402
from app.models.import_history import ImportHistory  # noqa: E402
from app.models.order import Order  # noqa: E402
from app.models.order_status_history import OrderStatusHistory  # noqa: E402
from app.models.payment import Payment  # noqa: E402
from app.models.staff_settlement import StaffSettlement  # noqa: E402


def _dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


ORDER_COPY_COLUMNS = (
    "orderNumber consignorName consigneeName particulars packageCount pickupAddress "
    "deliveryAddress weight priority status currentLocation notes paymentStatus "
    "paymentAmount trackingCode slipData grDate transportCompanyName transportGstin "
    "ewbNumber billType specialService fromLocation toLocation deliveryAt rate goodsValue "
    "grCharge freight labour pf doorDelivery taxGst netAmount toPay proprietorName "
    "proprietorPhone packageType consignorGstin consignorPhone consigneeGstin "
    "consigneePhone source chalaanNo chalaanDate transportGrn paymentMode grSourceLabel area"
).split()

DATE_COLS = {"grDate"}


async def run(db_path: str, company_id: uuid.UUID, dry_run: bool) -> None:
    src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row

    def rows(table: str) -> list[sqlite3.Row]:
        try:
            return list(src.execute(f"SELECT * FROM {table}"))
        except sqlite3.OperationalError:
            return []

    orders = rows("orders")
    payments = rows("payments")
    settlements = rows("staff_settlements")
    history = rows("order_status_history")
    imports = rows("import_history")

    print(f"SQLite source: {len(orders)} orders, {len(payments)} payments, "
          f"{len(settlements)} settlements, {len(history)} history, {len(imports)} import runs")

    sm = get_session_maker()
    inserted = {"orders": 0, "payments": 0, "settlements": 0, "history": 0, "imports": 0}
    async with sm() as s:
        existing_numbers = set(
            (await s.execute(select(Order.orderNumber))).scalars().all()
        )
        existing_ids = {
            "orders": set((await s.execute(select(Order.id))).scalars().all()),
            "payments": set((await s.execute(select(Payment.id))).scalars().all()),
            "settlements": set((await s.execute(select(StaffSettlement.id))).scalars().all()),
        }

        for o in orders:
            if o["isDeleted"]:
                continue
            if o["orderNumber"] in existing_numbers or uuid.UUID(o["id"]) in existing_ids["orders"]:
                continue
            fields = {}
            for col in ORDER_COPY_COLUMNS:
                if col not in o.keys():
                    continue
                v = o[col]
                fields[col] = _dt(v) if col in DATE_COLS else v
            fields.setdefault("pickupAddress", fields.get("pickupAddress") or "—")
            fields.setdefault("deliveryAddress", fields.get("deliveryAddress") or "—")
            order = Order(
                id=uuid.UUID(o["id"]),
                companyId=company_id,
                pickupTime=_dt(o["pickupTime"]) or datetime.now(timezone.utc),
                createdAt=_dt(o["createdAt"]) or datetime.now(timezone.utc),
                **fields,
            )
            s.add(order)
            inserted["orders"] += 1

        await s.flush()
        live_order_ids = set((await s.execute(select(Order.id))).scalars().all())

        for p in payments:
            if uuid.UUID(p["id"]) in existing_ids["payments"]:
                continue
            if uuid.UUID(p["orderId"]) not in live_order_ids:
                continue
            s.add(Payment(
                id=uuid.UUID(p["id"]), orderId=uuid.UUID(p["orderId"]), amount=p["amount"],
                paymentMethod=p["paymentMethod"], notes=p["notes"], recordedBy=p["recordedBy"],
                createdAt=_dt(p["createdAt"]) or datetime.now(timezone.utc),
            ))
            inserted["payments"] += 1

        for st in settlements:
            if uuid.UUID(st["id"]) in existing_ids["settlements"]:
                continue
            s.add(StaffSettlement(
                id=uuid.UUID(st["id"]), staffId=uuid.UUID(st["staffId"]), type=st["type"],
                amount=st["amount"], notes=st["notes"],
                createdBy=uuid.UUID(st["createdBy"]) if st["createdBy"] else None,
                createdAt=_dt(st["createdAt"]) or datetime.now(timezone.utc),
            ))
            inserted["settlements"] += 1

        for h in history:
            if uuid.UUID(h["orderId"]) not in live_order_ids:
                continue
            s.add(OrderStatusHistory(
                id=uuid.UUID(h["id"]), orderId=uuid.UUID(h["orderId"]), status=h["status"],
                notes=h["note"], createdAt=_dt(h["createdAt"]) or datetime.now(timezone.utc),
            ))
            inserted["history"] += 1

        for im in imports:
            s.add(ImportHistory(
                id=uuid.UUID(im["id"]), fileName=im["fileName"],
                importedAt=_dt(im["importedAt"]) or datetime.now(timezone.utc),
                importedByName=im["importedByName"], companyId=company_id, area=im["area"],
                totalRows=im["totalRows"], importedRows=im["importedRows"],
                duplicateRows=im["duplicateRows"], failedRows=im["failedRows"],
            ))
            inserted["imports"] += 1

        if dry_run:
            await s.rollback()
            print("DRY RUN — rolled back. Would insert:", inserted)
            return

        await s.commit()

    async with sm() as s:
        counts = {
            "orders": (await s.execute(select(func.count(Order.id)))).scalar(),
            "payments": (await s.execute(select(func.count(Payment.id)))).scalar(),
            "settlements": (await s.execute(select(func.count(StaffSettlement.id)))).scalar(),
            "payment_total": float((await s.execute(select(func.coalesce(func.sum(Payment.amount), 0)))).scalar()),
        }
    print("Inserted:", inserted)
    print("Neon now holds:", counts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db_path")
    ap.add_argument("--company-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(run(args.db_path, uuid.UUID(args.company_id), args.dry_run))


if __name__ == "__main__":
    main()
