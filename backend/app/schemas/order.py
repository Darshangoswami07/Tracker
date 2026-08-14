"""Schemas for GR/shipment (Order) management and slip/photo attachments."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import FileKind, OrderStatus
from app.schemas.common import Paginated


class GRCreateRequest(BaseModel):
    """Fields required to create a new GR/shipment entry."""

    grNumber: str = Field(min_length=1, max_length=50)
    companyId: UUID
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

    @field_validator("grNumber")
    @classmethod
    def gr_number_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("GR number cannot be blank")
        return value.strip()


class GRUpdateRequest(BaseModel):
    """Partial update for an existing GR — all fields optional."""

    pickupAddress: Optional[str] = Field(default=None, max_length=500)
    deliveryAddress: Optional[str] = Field(default=None, max_length=500)
    consignorName: Optional[str] = Field(default=None, max_length=160)
    consigneeName: Optional[str] = Field(default=None, max_length=160)
    particulars: Optional[str] = Field(default=None, max_length=500)
    packageCount: Optional[int] = Field(default=None, ge=0)
    weight: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class GRStatusUpdateRequest(BaseModel):
    status: OrderStatus
    location: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=500)


class GRAssignDriverRequest(BaseModel):
    driverId: UUID


class GRAssignStaffRequest(BaseModel):
    staffId: UUID


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


class GROut(BaseModel):
    """Full GR/shipment detail, including consignor/consignee and attachments."""

    id: UUID
    orderNumber: str
    companyId: UUID
    customerId: Optional[UUID] = None
    driverId: Optional[UUID] = None
    vehicleId: Optional[UUID] = None
    assignedStaffId: Optional[UUID] = None
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
    status: OrderStatus
    createdAt: datetime
    hasSlip: bool = False

    class Config:
        from_attributes = True


class GRListOut(Paginated[GRListItemOut]):
    pass
