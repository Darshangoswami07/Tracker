"""Schemas for GR/shipment (Order) management and slip/photo attachments."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import FileKind, OrderStatus
from app.schemas.common import Paginated


class GRExtendedFields(BaseModel):
    """Structured business fields a real transport/Bilti slip carries beyond
    the original 10-field GR form. Shared by create/update/out schemas so the
    field list only needs to be maintained in one place. All optional - a GR
    is always valid without them, and OCR only fills in what it can
    confidently read (see `app/services/slip_parser.py`)."""

    grDate: Optional[datetime] = None
    transportCompanyName: Optional[str] = Field(default=None, max_length=160)
    transportGstin: Optional[str] = Field(default=None, max_length=20)
    ewbNumber: Optional[str] = Field(default=None, max_length=50)
    billType: Optional[str] = Field(default=None, max_length=30)
    specialService: Optional[str] = Field(default=None, max_length=255)
    fromLocation: Optional[str] = Field(default=None, max_length=160)
    toLocation: Optional[str] = Field(default=None, max_length=160)
    deliveryAt: Optional[str] = Field(default=None, max_length=255)
    rate: Optional[float] = Field(default=None, ge=0)
    goodsValue: Optional[float] = Field(default=None, ge=0)
    grCharge: Optional[float] = Field(default=None, ge=0)
    freight: Optional[float] = Field(default=None, ge=0)
    labour: Optional[float] = Field(default=None, ge=0)
    pf: Optional[float] = Field(default=None, ge=0)
    doorDelivery: Optional[float] = Field(default=None, ge=0)
    taxGst: Optional[float] = Field(default=None, ge=0)
    netAmount: Optional[float] = Field(default=None, ge=0)
    toPay: Optional[float] = Field(default=None, ge=0)
    proprietorName: Optional[str] = Field(default=None, max_length=160)
    proprietorPhone: Optional[str] = Field(default=None, max_length=20)
    packageType: Optional[str] = Field(default=None, max_length=80)
    consignorGstin: Optional[str] = Field(default=None, max_length=20)
    consignorPhone: Optional[str] = Field(default=None, max_length=20)
    consigneeGstin: Optional[str] = Field(default=None, max_length=20)
    consigneePhone: Optional[str] = Field(default=None, max_length=20)
    # Excel bulk-import extras (previously mobile-SQLite-only, schema.ts v6).
    chalaanNo: Optional[str] = Field(default=None, max_length=80)
    chalaanDate: Optional[str] = Field(default=None, max_length=40)
    transportGrn: Optional[str] = Field(default=None, max_length=80)
    paymentMode: Optional[str] = Field(default=None, max_length=40)
    grSourceLabel: Optional[str] = Field(default=None, max_length=120)


class GRCreateRequest(GRExtendedFields):
    """Fields required to create a new GR/shipment entry."""

    grNumber: str = Field(min_length=1, max_length=50)
    # Optional: company-scoped callers (incl. mobile Admin/Staff) always get
    # the GR under their own company; only Super Admin targeting another
    # company needs to send this.
    companyId: Optional[UUID] = None
    pickupAddress: str = Field(min_length=1, max_length=500)
    deliveryAddress: str = Field(min_length=1, max_length=500)
    pickupTime: datetime
    consignorName: str = Field(min_length=1, max_length=160)
    consigneeName: str = Field(min_length=1, max_length=160)
    particulars: Optional[str] = Field(default=None, max_length=500)
    packageCount: Optional[int] = Field(default=None, ge=0)
    weight: Optional[float] = Field(default=None, ge=0)
    customerId: Optional[UUID] = None
    assignedStaffId: Optional[UUID] = None
    driverId: Optional[UUID] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    trackingCode: Optional[str] = Field(default=None, max_length=100)
    # 'manual' | 'slip' | 'excel'. Defaults to 'manual'.
    source: Optional[str] = Field(default=None, max_length=20)
    # OCR-extracted slip snapshot (JSON string) persisted alongside the GR.
    slipData: Optional[str] = None

    @field_validator("grNumber")
    @classmethod
    def gr_number_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("GR number cannot be blank")
        return value.strip()


class GRUpdateRequest(GRExtendedFields):
    """Partial update for an existing GR — all fields optional."""

    pickupAddress: Optional[str] = Field(default=None, max_length=500)
    deliveryAddress: Optional[str] = Field(default=None, max_length=500)
    consignorName: Optional[str] = Field(default=None, max_length=160)
    consigneeName: Optional[str] = Field(default=None, max_length=160)
    particulars: Optional[str] = Field(default=None, max_length=500)
    packageCount: Optional[int] = Field(default=None, ge=0)
    weight: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)
    pickupTime: Optional[datetime] = None
    # Legacy single-field paid amount (Excel `Paid_Amt` maps here too).
    paymentAmount: Optional[float] = Field(default=None, ge=0)


class GRStatusUpdateRequest(BaseModel):
    status: OrderStatus
    location: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=500)


class GRAssignDriverRequest(BaseModel):
    driverId: UUID


class GRAssignStaffRequest(BaseModel):
    staffId: UUID


class GRBulkDeleteRequest(BaseModel):
    """Ids of the GRs the user ticked in the list for bulk deletion. Unknown /
    already-deleted / out-of-tenant ids are skipped server-side, not rejected
    — the response reports what was actually deleted vs skipped."""

    ids: list[UUID] = Field(min_length=1, max_length=500)


class OrderAttachmentOut(BaseModel):
    id: UUID
    orderId: UUID
    fileKind: FileKind
    originalFilename: str
    mimeType: str
    fileSizeBytes: int
    uploadedBy: UUID
    createdAt: datetime
    url: str

    class Config:
        from_attributes = True


class GRTimelineEventOut(BaseModel):
    id: UUID
    status: str
    note: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class GROut(GRExtendedFields):
    """Full GR/shipment detail, including consignor/consignee and attachments."""

    id: UUID
    orderNumber: str
    source: str = "manual"
    slipData: Optional[str] = None
    paymentAmount: Optional[float] = None
    timeline: list[GRTimelineEventOut] = []
    companyId: UUID
    customerId: Optional[UUID] = None
    driverId: Optional[UUID] = None
    vehicleId: Optional[UUID] = None
    assignedStaffId: Optional[UUID] = None
    area: Optional[str] = None
    pickupAddress: str
    deliveryAddress: str
    pickupTime: datetime
    deliveryTime: Optional[datetime] = None
    consignorName: Optional[str] = None
    consigneeName: Optional[str] = None
    particulars: Optional[str] = None
    packageCount: Optional[int] = None
    weight: Optional[float] = None
    status: OrderStatus
    notes: Optional[str] = None
    trackingCode: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    attachments: list[OrderAttachmentOut] = []

    class Config:
        from_attributes = True


class GRListItemOut(BaseModel):
    """Compact row shape for the GR list/table."""

    id: UUID
    orderNumber: str
    consignorName: Optional[str] = None
    consigneeName: Optional[str] = None
    pickupAddress: str
    deliveryAddress: str
    driverId: Optional[UUID] = None
    assignedStaffId: Optional[UUID] = None
    area: Optional[str] = None
    status: OrderStatus
    createdAt: datetime
    hasSlip: bool = False

    class Config:
        from_attributes = True


class GRListOut(Paginated[GRListItemOut]):
    pass
