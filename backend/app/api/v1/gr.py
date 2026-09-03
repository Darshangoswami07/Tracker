"""GR / Shipment (Order) management endpoints for the Admin web app.

Reuses the existing `Order` model/table as the GR entity (`orderNumber` is
the GR number) and the existing `OrderRepository`/order status pipeline —
no parallel shipment system. Slip/photo uploads use the local-disk
`storage_service`, matching the `STORAGE_BACKEND=local` configuration
already scaffolded in `core/config.py`.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import FileResponse, RedirectResponse

from app.api.deps import AdminUser, GRAccessUser
from app.core.config import settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationBusinessError
from app.core.tenancy import assert_same_company, effective_company_id, resolve_gr_staff_scope
from app.models.enums import FileKind, OrderStatus
from app.repositories.order_attachment_repository import OrderAttachmentRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.shop_repository import ShopRepository
from app.schemas.order import (
    GRAssignDriverRequest,
    GRAssignStaffRequest,
    GRCreateRequest,
    GRListOut,
    GROut,
    GRStatusUpdateRequest,
    GRUpdateRequest,
    OrderAttachmentOut,
)
from app.services.ocr_service import extract_slip_fields
from app.services.storage_service import (
    file_exists,
    generate_download_url,
    resolve_absolute_path,
    save_upload,
)
from app.utils.responses import success

router = APIRouter(prefix="/admin/orders", tags=["gr"])

order_repo = OrderRepository()
attachment_repo = OrderAttachmentRepository()
shop_repo = ShopRepository()


def _attachment_url(order_id: UUID, attachment_id: UUID) -> str:
    return f"{settings.APP_PUBLIC_URL}{settings.API_V1_PREFIX}/admin/orders/{order_id}/attachments/{attachment_id}/file"


async def _attachments_out(order_id: UUID) -> list[OrderAttachmentOut]:
    rows = await attachment_repo.find_by_order(order_id)
    return [
        OrderAttachmentOut(
            id=row.id,
            orderId=row.orderId,
            fileKind=row.fileKind,
            originalFilename=row.originalFilename,
            mimeType=row.mimeType,
            fileSizeBytes=row.fileSizeBytes,
            uploadedBy=row.uploadedBy,
            createdAt=row.createdAt,
            url=_attachment_url(order_id, row.id),
        )
        for row in rows
    ]


_EXTENDED_FIELDS = (
    "grDate", "transportCompanyName", "transportGstin", "ewbNumber", "billType",
    "specialService", "fromLocation", "toLocation", "deliveryAt", "rate",
    "goodsValue", "grCharge", "freight", "labour", "pf", "doorDelivery",
    "taxGst", "netAmount", "toPay", "proprietorName", "proprietorPhone",
    "packageType", "consignorGstin", "consignorPhone", "consigneeGstin",
    "consigneePhone", "chalaanNo", "chalaanDate", "transportGrn", "paymentMode",
    "grSourceLabel",
)


async def _timeline_out(order) -> list:
    history = sorted(
        getattr(order, "statusHistory", []) or [], key=lambda h: h.createdAt
    )
    return [
        {
            "id": str(h.id),
            "status": h.status,
            "note": h.notes,
            "createdAt": h.createdAt.isoformat(),
        }
        for h in history
    ]


async def _gr_out(order) -> GROut:
    attachments = await _attachments_out(order.id)
    extended = {f: getattr(order, f, None) for f in _EXTENDED_FIELDS}
    return GROut(
        id=order.id,
        orderNumber=order.orderNumber,
        source=getattr(order, "source", None) or "manual",
        slipData=getattr(order, "slipData", None),
        paymentAmount=float(order.paymentAmount) if order.paymentAmount is not None else None,
        area=getattr(order, "area", None),
        timeline=await _timeline_out(order),
        companyId=order.companyId,
        customerId=order.customerId,
        driverId=order.driverId,
        vehicleId=order.vehicleId,
        assignedStaffId=order.assignedStaffId,
        pickupAddress=order.pickupAddress,
        deliveryAddress=order.deliveryAddress,
        pickupTime=order.pickupTime,
        deliveryTime=order.deliveryTime,
        consignorName=order.consignorName,
        consigneeName=order.consigneeName,
        particulars=order.particulars,
        packageCount=order.packageCount,
        weight=order.weight,
        status=order.status,
        notes=order.notes,
        trackingCode=order.trackingCode,
        createdAt=order.createdAt,
        updatedAt=order.updatedAt,
        attachments=attachments,
        **extended,
    )


@router.get("")
async def list_grs(
    admin: GRAccessUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    area: Annotated[str | None, Query(max_length=100)] = None,
    consignor: Annotated[str | None, Query(max_length=160)] = None,
) -> dict:
    """List GRs/shipments. Super Admin sees every company; every other role
    is scoped to their own company. Staff (EMPLOYEE/STAFF) users only ever
    see GRs that are actually theirs — either explicitly assigned to them
    (`Order.assignedStaffId`) or routed to them by area — derived from the
    AUTHENTICATED user, never from a client-supplied staff id (see
    `resolve_gr_staff_scope`)."""
    staff_scope = await resolve_gr_staff_scope(admin, area)
    effective_area = None if staff_scope is not None else (area or getattr(admin, "area", None))

    orders, total = await order_repo.get_all_orders(
        page=page,
        page_size=page_size,
        status=status,
        search=search,
        company_id=await effective_company_id(admin),
        area=effective_area,
        consignor=consignor,
        staff_scope=staff_scope,
    )
    # One grouped query for the whole page's payment totals (no N+1).
    paid_by_order: dict = {}
    if orders:
        from sqlalchemy import func as _func, select as _select

        from app.database.db import session_scope
        from app.models.payment import Payment

        order_ids = [o.id for o in orders]
        async with session_scope() as _s:
            rows = (
                await _s.execute(
                    _select(Payment.orderId, _func.coalesce(_func.sum(Payment.amount), 0))
                    .where(Payment.orderId.in_(order_ids))
                    .group_by(Payment.orderId)
                )
            ).all()
        paid_by_order = {oid: float(total or 0) for oid, total in rows}

    from app.services.gr_status_service import classify

    items = []
    for order in orders:
        attachments = await attachment_repo.find_by_order(order.id)
        raw_status = order.status.value if hasattr(order.status, "value") else order.status
        ledger_paid = paid_by_order.get(order.id, 0.0)
        legacy_paid = float(order.paymentAmount) if order.paymentAmount is not None else 0.0
        total_paid = max(ledger_paid, legacy_paid)
        to_pay = float(order.toPay) if order.toPay is not None else 0.0
        reporting_status = classify(raw_status != "pending", total_paid, to_pay)
        items.append(
            {
                "id": str(order.id),
                "orderNumber": order.orderNumber,
                "consignorName": order.consignorName,
                "consigneeName": order.consigneeName,
                "pickupAddress": order.pickupAddress,
                "deliveryAddress": order.deliveryAddress,
                "driverId": str(order.driverId) if order.driverId else None,
                "assignedStaffId": str(order.assignedStaffId) if order.assignedStaffId else None,
                "area": order.area,
                # `status` stays the raw lifecycle value (unchanged for existing
                # API consumers); `reportingStatus` is the canonical bucket the
                # mobile GR list badges + filters use (see gr_status_service).
                "status": raw_status,
                "reportingStatus": reporting_status,
                "createdAt": order.createdAt.isoformat(),
                "hasSlip": bool(attachments) or bool(getattr(order, "hasSlip", False)),
                "source": getattr(order, "source", None) or "manual",
                "toPay": to_pay,
                "totalPaid": total_paid,
                "paymentAmount": legacy_paid,
            }
        )
    return success(
        {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1,
        },
        message="GRs retrieved successfully.",
    )


@router.post("", status_code=201)
async def create_gr(payload: GRCreateRequest, admin: GRAccessUser) -> dict:
    """Creates a new GR/shipment. Rejects duplicate GR numbers.

    Company-scoped callers (Company Admin/Staff/Driver) always get the GR
    created under their own company, regardless of the ``companyId`` in the
    payload — only Super Admin may target an arbitrary company.
    """
    existing = await order_repo.get_by_order_number(payload.grNumber)
    if existing is not None:
        raise ValidationBusinessError(f"GR number '{payload.grNumber}' already exists.")

    # ``effective_company_id`` raises ForbiddenError for a company-scoped
    # caller (Staff/Driver/Company Admin) that has no company assigned — that
    # gate is preserved. It returns None only for platform ADMIN/SUPER_ADMIN,
    # who then fall back to the payload's companyId or their own user.companyId
    # (mobile admins are linked to a company via user.companyId).
    company_id = await effective_company_id(admin)
    if company_id is None:
        company_id = payload.companyId or getattr(admin, "companyId", None)
    if company_id is None:
        raise ValidationBusinessError(
            "Your account is not linked to a company. Ask an administrator to "
            "assign one before creating GRs."
        )
    extended = {f: getattr(payload, f, None) for f in _EXTENDED_FIELDS}
    # Stamp the creating user's area (Staff only — Admin/Owner have none) so a
    # Staff-created GR is immediately visible in that Staff member's own
    # area-scoped list instead of silently vanishing for lacking an area.
    creator_area = getattr(admin, "area", None)
    # `assignedStaffId` from the client is a users.id (what every staff picker
    # returns); Order.assignedStaffId FKs employees.id — resolve it.
    assigned_staff = (
        await _resolve_employee_id(payload.assignedStaffId, company_id)
        if payload.assignedStaffId is not None
        else None
    )
    # Master-data upsert: the Shop is the GR's **consignee** (the destination
    # shop) — NEVER the consignor. It must exist independently of this GR, so
    # it's resolved/created before the Order — deleting the GR later must
    # never be able to take the Shop down with it.
    shop = await shop_repo.get_or_create(company_id=company_id, area=creator_area, name=payload.consigneeName)
    order = await order_repo.create_order(
        orderNumber=payload.grNumber,
        companyId=company_id,
        customerId=payload.customerId,
        driverId=payload.driverId,
        assignedStaffId=assigned_staff,
        shopId=shop.id if shop else None,
        pickupAddress=payload.pickupAddress,
        deliveryAddress=payload.deliveryAddress,
        pickupTime=payload.pickupTime,
        consignorName=payload.consignorName,
        consigneeName=payload.consigneeName,
        particulars=payload.particulars,
        packageCount=payload.packageCount,
        weight=payload.weight,
        notes=payload.notes,
        status=OrderStatus.PENDING,
        area=creator_area,
        source=getattr(payload, "source", None) or "manual",
        slipData=getattr(payload, "slipData", None),
        **extended,
    )
    await order_repo.append_status_history(order.id, "pending", "Created")
    await order_repo.reconcile_delivered_status(order.id)
    fresh = await order_repo.get_order_with_details(order.id)
    return success((await _gr_out(fresh or order)).model_dump(mode="json"), message="GR created successfully.")


@router.delete("")
async def delete_all_grs(admin: AdminUser) -> dict:
    """Admin-only bulk delete of every GR/Shipment. Soft-deletes in ONE
    `UPDATE ... WHERE` statement (`OrderRepository.soft_delete_all_orders`)
    — the same reversible `deletedAt`/`isActive=False` pattern `delete_gr`
    already uses for a single GR, just applied to every matching row at
    once instead of looping N individual deletes. `AdminUser`-gated like
    `delete_gr` (ADMIN/SUPER_ADMIN only — Company Admin/Staff/Driver get a
    403), and scoped via the same `effective_company_id` every other GR
    route uses: unscoped (every company) only for platform ADMIN/SUPER_ADMIN,
    scoped to the caller's own company for everyone else who could reach
    this dependency. Ignores all list filters (search/status/area/shop/
    pagination) by design — "delete all" always means every GR in scope,
    not merely what happens to be on screen. Never touches Shop (master
    data — consignee identity), Payment, User, Employee, Driver, Vehicle,
    or Company rows; `order_status_history` rows are left in place (no
    physical delete happens), so its NOT NULL `orderId` FK is never at
    risk."""
    company_id = await effective_company_id(admin)
    deleted_count = await order_repo.soft_delete_all_orders(company_id)
    return success({"deletedCount": deleted_count}, message="All GRs deleted successfully.")


@router.post("/ocr-extract")
async def extract_gr_from_slip(admin: GRAccessUser, file: UploadFile = File(...)) -> dict:
    """Extracts GR fields from an uploaded transport slip (image or PDF) via
    OCR.Space. Stateless: the extracted JSON is returned to the caller and is
    never persisted here — the mobile app sends the reviewed fields back via
    POST /admin/orders to be stored in Neon. The user's original file is
    untouched; only a temporary,
    in-memory optimized copy (when needed) is sent to the OCR provider.
    Requires `OCR_SPACE_API_KEY` to be configured."""
    mime_type = file.content_type or "image/jpeg"
    data = await file.read()
    if not data:
        raise ValidationBusinessError("The uploaded file is empty.")
    if len(data) > settings.MAX_UPLOAD_SIZE:
        max_mb = settings.MAX_UPLOAD_SIZE / (1024 * 1024)
        raise ValidationBusinessError(f"This file is too large. Please select an image or PDF up to {max_mb:.0f} MB.")
    extracted = await extract_slip_fields(data, mime_type, file.filename or "slip")
    return success(extracted, message="Slip details extracted successfully.")


@router.get("/{order_id}")
async def get_gr(order_id: UUID, admin: GRAccessUser) -> dict:
    order = await order_repo.get_order_with_details(order_id)
    if order is None or order.deletedAt is not None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
    return success((await _gr_out(order)).model_dump(mode="json"), message="GR retrieved successfully.")


@router.patch("/{order_id}")
async def update_gr(order_id: UUID, payload: GRUpdateRequest, admin: GRAccessUser) -> dict:
    existing = await order_repo.find_by_id(str(order_id))
    if existing is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, existing.companyId)
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise ValidationBusinessError("No fields provided to update.")
    # companyId can never be reassigned through a generic field update —
    # that would let a company-scoped caller move a GR out of their own
    # tenant (or a stray payload field move it into another one).
    updates.pop("companyId", None)
    if "consigneeName" in updates:
        # The Shop identity follows the **consignee**. Re-point at the
        # (possibly new) Shop master record for the edited consignee name; the
        # old Shop, if now unused, is left in place untouched — Shops are
        # never deleted as a side effect of editing/removing GRs. Editing the
        # consignor never touches the Shop link.
        shop = await shop_repo.get_or_create(
            company_id=existing.companyId, area=existing.area, name=updates["consigneeName"]
        )
        updates["shopId"] = shop.id if shop else None
    order = await order_repo.update_fields(order_id, **updates)
    if order is None:
        raise NotFoundError("GR not found.")
    # Edit GR can lower toPay to/under what's already paid, or set the legacy
    # paymentAmount directly — re-check whether nothing is outstanding.
    if "toPay" in updates or "paymentAmount" in updates:
        await order_repo.reconcile_delivered_status(order_id)
    fresh = await order_repo.get_order_with_details(order_id)
    return success((await _gr_out(fresh or order)).model_dump(mode="json"), message="GR updated successfully.")


@router.patch("/{order_id}/status")
async def update_gr_status(order_id: UUID, payload: GRStatusUpdateRequest, admin: GRAccessUser) -> dict:
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
    # Staff may only act on a GR that is actually theirs: assigned to them
    # (`assignedStaffId`), or — for a GR nobody is assigned to — routed to
    # their area. A GR assigned to a *different* staff member is off-limits.
    staff_scope = await resolve_gr_staff_scope(admin)
    if staff_scope is not None:
        employee_id, staff_area = staff_scope
        owns = (
            (employee_id is not None and order.assignedStaffId == employee_id)
            or (order.assignedStaffId is None and staff_area and order.area == staff_area)
        )
        if not owns:
            raise ForbiddenError("You can only update GRs assigned to you.")
    # Role-gated transition: Staff = pending→delivered only; Admin = unchanged.
    from app.services.gr_status_service import assert_status_transition_allowed

    assert_status_transition_allowed(admin, order.status, payload.status)
    updated = await order_repo.update_status(order_id, payload.status.value, user_id=admin.id)
    return success((await _gr_out(updated)).model_dump(mode="json"), message="GR status updated.")


@router.delete("/{order_id}")
async def delete_gr(order_id: UUID, admin: AdminUser) -> dict:
    """Soft-deletes a GR (sets `deletedAt`/`isActive=False` — see
    `OrderRepository.soft_delete_order`), the same reversible pattern used
    for companies (`CompanyRepository.soft_delete_company`). Admin-tier only
    (`AdminUser` = ADMIN/SUPER_ADMIN): unlike the broader `GRAccessUser` used
    by the read/update endpoints above, Dispatcher/Staff/Driver may not
    delete GRs. Tenant-scoped via `assert_same_company`, identical to
    `update_gr`/`update_gr_status` — a caller can never delete a GR outside
    their own company by guessing/changing `order_id`. Never touches any
    other GR, company, or user record."""
    existing = await order_repo.find_by_id(str(order_id))
    if existing is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, existing.companyId)
    await order_repo.soft_delete_order(order_id)
    return success(None, message="GR deleted successfully.")


@router.post("/{order_id}/assign-driver")
async def assign_driver(order_id: UUID, payload: GRAssignDriverRequest, admin: GRAccessUser) -> dict:
    existing = await order_repo.find_by_id(str(order_id))
    if existing is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, existing.companyId)
    order = await order_repo.assign_driver(order_id, payload.driverId)
    if order is None:
        raise NotFoundError("GR not found.")
    return success((await _gr_out(order)).model_dump(mode="json"), message="Driver assigned successfully.")


async def _resolve_employee_id(user_id: UUID, company_id) -> UUID:
    """`Order.assignedStaffId` has a foreign key to `employees.id`, but every
    staff-facing surface in the app (registration-request approval,
    `GET /admin/users?role=employee`) only ever exposes the linked User's
    id — registration-approved staff never get an `employees` row created
    (only the direct Company-Admin `POST /admin/staff` flow does, see
    `app/api/v1/admin.py`'s `create_staff`). Without this, assigning any
    registration-approved staff member 500s on the FK constraint. Resolves
    the caller's `employees` row by `userId`, creating one on first
    assignment so the ``staffId`` a client sends can simply be the User id
    every other staff picker already returns."""
    from app.models.employee import Employee
    from app.repositories.base import BaseRepository
    from app.database.db import session_scope
    from sqlalchemy import select

    async with session_scope() as session:
        employee = await session.scalar(select(Employee).where(Employee.userId == str(user_id)))
        if employee is not None:
            return employee.id

    created = await BaseRepository(Employee).save(Employee(userId=str(user_id), companyId=company_id))
    return created.id


@router.post("/{order_id}/assign-staff")
async def assign_staff(order_id: UUID, payload: GRAssignStaffRequest, admin: GRAccessUser) -> dict:
    existing = await order_repo.find_by_id(str(order_id))
    if existing is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, existing.companyId)
    employee_id = await _resolve_employee_id(payload.staffId, existing.companyId)
    order = await order_repo.assign_staff(order_id, employee_id)
    if order is None:
        raise NotFoundError("GR not found.")
    return success((await _gr_out(order)).model_dump(mode="json"), message="Staff assigned successfully.")


@router.post("/{order_id}/attachments", status_code=201)
async def upload_attachment(
    order_id: UUID,
    admin: GRAccessUser,
    file: UploadFile = File(...),
    fileKind: Annotated[str, Form()] = FileKind.GENERIC.value,
) -> dict:
    """Uploads a slip or photo for a GR. Every upload is kept (never
    overwritten) so 'Replace Slip' preserves history — the most recent row
    of a given kind is the one the UI treats as current."""
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)

    relative_path, size, mime_type = await save_upload(file, subdir=f"orders/{order_id}")
    attachment = await attachment_repo.create(
        order_id=order_id,
        file_kind=fileKind,
        storage_path=relative_path,
        original_filename=file.filename or "upload",
        mime_type=mime_type,
        file_size_bytes=size,
        uploaded_by=admin.id,
    )
    return success(
        OrderAttachmentOut(
            id=attachment.id,
            orderId=attachment.orderId,
            fileKind=attachment.fileKind,
            originalFilename=attachment.originalFilename,
            mimeType=attachment.mimeType,
            fileSizeBytes=attachment.fileSizeBytes,
            uploadedBy=attachment.uploadedBy,
            createdAt=attachment.createdAt,
            url=_attachment_url(order_id, attachment.id),
        ).model_dump(mode="json"),
        message="Slip uploaded successfully.",
    )


@router.get("/{order_id}/attachments")
async def list_attachments(order_id: UUID, admin: GRAccessUser) -> dict:
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
    return success(
        [a.model_dump(mode="json") for a in await _attachments_out(order_id)],
        message="Attachments retrieved successfully.",
    )


@router.get("/{order_id}/attachments/{attachment_id}/file")
async def download_attachment(order_id: UUID, attachment_id: UUID, admin: GRAccessUser):
    """Streams a slip/photo file. Requires a valid bearer token (GRAccessUser) —
    files are never served from an unauthenticated static directory.

    For S3 storage: returns a short-lived presigned URL (301 redirect).
    For local storage: streams the file directly via FileResponse.
    """
    attachment = await attachment_repo.find_by_id(str(attachment_id))
    if attachment is None or attachment.orderId != order_id:
        raise NotFoundError("Attachment not found.")
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)

    if not file_exists(attachment.storagePath):
        raise NotFoundError("Stored file is missing.")

    if settings.STORAGE_BACKEND == "s3":
        presigned_url = generate_download_url(attachment.storagePath)
        return RedirectResponse(url=presigned_url, status_code=302)

    absolute_path = resolve_absolute_path(attachment.storagePath)
    return FileResponse(
        path=absolute_path,
        media_type=attachment.mimeType,
        filename=attachment.originalFilename,
    )
