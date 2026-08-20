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
from fastapi.responses import FileResponse

from app.api.deps import AdminUser, GRAccessUser
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationBusinessError
from app.core.tenancy import assert_same_company, effective_company_id
from app.models.enums import FileKind, OrderStatus
from app.repositories.order_attachment_repository import OrderAttachmentRepository
from app.repositories.order_repository import OrderRepository
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
from app.services.storage_service import resolve_absolute_path, save_upload
from app.utils.responses import success

router = APIRouter(prefix="/admin/orders", tags=["gr"])

order_repo = OrderRepository()
attachment_repo = OrderAttachmentRepository()


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


async def _gr_out(order) -> GROut:
    attachments = await _attachments_out(order.id)
    return GROut(
        id=order.id,
        orderNumber=order.orderNumber,
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
        grDate=order.grDate,
        transportCompanyName=order.transportCompanyName,
        transportGstin=order.transportGstin,
        ewbNumber=order.ewbNumber,
        billType=order.billType,
        specialService=order.specialService,
        fromLocation=order.fromLocation,
        toLocation=order.toLocation,
        deliveryAt=order.deliveryAt,
        rate=order.rate,
        goodsValue=order.goodsValue,
        grCharge=order.grCharge,
        freight=order.freight,
        labour=order.labour,
        pf=order.pf,
        doorDelivery=order.doorDelivery,
        taxGst=order.taxGst,
        netAmount=order.netAmount,
        toPay=order.toPay,
        proprietorName=order.proprietorName,
        proprietorPhone=order.proprietorPhone,
        packageType=order.packageType,
        consignorGstin=order.consignorGstin,
        consignorPhone=order.consignorPhone,
        consigneeGstin=order.consigneeGstin,
        consigneePhone=order.consigneePhone,
    )


@router.get("")
async def list_grs(
    admin: GRAccessUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """List GRs/shipments. Super Admin sees every company; every other role
    is scoped to their own company."""
    orders, total = await order_repo.get_all_orders(
        page=page,
        page_size=page_size,
        status=status,
        search=search,
        company_id=await effective_company_id(admin),
    )
    items = []
    for order in orders:
        attachments = await attachment_repo.find_by_order(order.id)
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
                "status": order.status.value if hasattr(order.status, "value") else order.status,
                "createdAt": order.createdAt.isoformat(),
                "hasSlip": bool(attachments),
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

    company_id = await effective_company_id(admin)
    order = await order_repo.create_order(
        orderNumber=payload.grNumber,
        companyId=company_id if company_id is not None else payload.companyId,
        customerId=payload.customerId,
        driverId=payload.driverId,
        assignedStaffId=payload.assignedStaffId,
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
        grDate=payload.grDate,
        transportCompanyName=payload.transportCompanyName,
        transportGstin=payload.transportGstin,
        ewbNumber=payload.ewbNumber,
        billType=payload.billType,
        specialService=payload.specialService,
        fromLocation=payload.fromLocation,
        toLocation=payload.toLocation,
        deliveryAt=payload.deliveryAt,
        rate=payload.rate,
        goodsValue=payload.goodsValue,
        grCharge=payload.grCharge,
        freight=payload.freight,
        labour=payload.labour,
        pf=payload.pf,
        doorDelivery=payload.doorDelivery,
        taxGst=payload.taxGst,
        netAmount=payload.netAmount,
        toPay=payload.toPay,
        proprietorName=payload.proprietorName,
        proprietorPhone=payload.proprietorPhone,
        packageType=payload.packageType,
        consignorGstin=payload.consignorGstin,
        consignorPhone=payload.consignorPhone,
        consigneeGstin=payload.consigneeGstin,
        consigneePhone=payload.consigneePhone,
    )
    return success((await _gr_out(order)).model_dump(mode="json"), message="GR created successfully.")


@router.post("/ocr-extract")
async def extract_gr_from_slip(admin: GRAccessUser, file: UploadFile = File(...)) -> dict:
    """Extracts GR fields from an uploaded transport slip (image or PDF) via
    OCR.Space. Stateless: the extracted JSON is returned to the caller and is
    never persisted here — the mobile app saves it into its on-device SQLite
    repository. The user's original file is untouched; only a temporary,
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
    if order is None:
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
    order = await order_repo.update_fields(order_id, **updates)
    if order is None:
        raise NotFoundError("GR not found.")
    return success((await _gr_out(order)).model_dump(mode="json"), message="GR updated successfully.")


@router.patch("/{order_id}/status")
async def update_gr_status(order_id: UUID, payload: GRStatusUpdateRequest, admin: GRAccessUser) -> dict:
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
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
async def download_attachment(order_id: UUID, attachment_id: UUID, admin: GRAccessUser) -> FileResponse:
    """Streams a slip/photo file. Requires a valid bearer token (GRAccessUser) —
    files are never served from an unauthenticated static directory."""
    attachment = await attachment_repo.find_by_id(str(attachment_id))
    if attachment is None or attachment.orderId != order_id:
        raise NotFoundError("Attachment not found.")
    order = await order_repo.find_by_id(str(order_id))
    if order is None:
        raise NotFoundError("GR not found.")
    await assert_same_company(admin, order.companyId)
    absolute_path = resolve_absolute_path(attachment.storagePath)
    if not absolute_path.exists():
        raise NotFoundError("Stored file is missing.")
    return FileResponse(
        path=absolute_path,
        media_type=attachment.mimeType,
        filename=attachment.originalFilename,
    )
