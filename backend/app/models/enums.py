"""Domain enums shared across models and schemas."""
from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    CUSTOMER = "customer"
    EMPLOYEE = "employee"
    DRIVER = "driver"
    DISPATCHER = "dispatcher"
    BUSINESS = "business"
    BUSINESS_OWNER = "business_owner"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class RefreshTokenStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class VehicleType(str, Enum):
    CAR = "car"
    TRUCK = "truck"
    VAN = "van"
    BIKE = "bike"
    E_BIKE = "e-bike"


class VehicleStatus(str, Enum):
    AVAILABLE = "available"
    ASSIGNED = "assigned"
    MAINTENANCE = "maintenance"
    INACTIVE = "inactive"


class OrderType(str, Enum):
    DOCUMENT = "document"
    PARCEL = "parcel"
    FOOD = "food"
    OTHER = "other"


class OrderStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    PICKUP = "pickup"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETURNED = "returned"
    CANCELLED = "cancelled"


class OrderPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class PaymentStatus(str, Enum):
    UNPAID = "unpaid"
    PAID = "paid"
    REFUNDED = "refunded"


class DriverStatus(str, Enum):
    OFFLINE = "offline"
    ONLINE = "online"
    AVAILABLE = "available"
    BUSY = "busy"
    BREAK = "break"


class DriverDocumentKind(str, Enum):
    LICENSE = "license"
    ID_CARD = "id_card"
    BACKGROUND_CHECK = "background_check"
    INSURANCE = "insurance"
    OTHER = "other"


class DriverDocumentStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class CompanyStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"


class EmployeeRole(str, Enum):
    OWNER = "owner"
    MANAGER = "manager"
    DISPATCHER = "dispatcher"
    STAFF = "staff"
    DRIVER = "driver"


class NotificationType(str, Enum):
    ORDER_UPDATE = "order_update"
    ALERT = "alert"
    INFO = "info"
    SYSTEM = "system"
    PAYMENT = "payment"


class FileKind(str, Enum):
    PROFILE = "profile"
    COMPANY_LOGO = "company_logo"
    VEHICLE_IMAGE = "vehicle_image"
    DRIVER_DOCUMENT = "driver_document"
    PROOF_OF_DELIVERY = "proof_of_delivery"
    QR = "qr"
    BARCODE = "barcode"
    GENERIC = "generic"


class StorageBackend(str, Enum):
    LOCAL = "local"
    S3 = "s3"


class ReportPeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ReportFormat(str, Enum):
    CSV = "csv"
    XLSX = "xlsx"


class QrPurpose(str, Enum):
    ORDER = "order"
    PACKAGE = "package"
    VERIFICATION = "verification"


class BarcodeFormat(str, Enum):
    CODE128 = "code128"
    EAN13 = "ean13"


class RegistrationStatus(str, Enum):
    PENDING = "pending"
    APPROVED_PENDING_OTP = "approved_pending_otp"
    COMPLETED = "completed"
    REJECTED = "rejected"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class OTPIntent(str, Enum):
    APPROVAL = "approval"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"


class DevicePlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class DeviceStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class LicenseStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"
