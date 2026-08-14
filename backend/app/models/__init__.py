"""ORM models. Importing the module registers the tables on ``Base.metadata``."""

# Import mixins first - they are dependencies for all models
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin

# Now import all the other model files that depend on these mixins
from app.models.company import Company
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.driver import Driver
from app.models.driver_document import DriverDocument
from app.models.employee import Employee
from app.models.vehicle import Vehicle
from app.models.vehicle_assignment import VehicleAssignment
from app.models.vehicle_image import VehicleImage
from app.models.order import Order
from app.models.order_status_history import OrderStatusHistory
from app.models.order_attachment import OrderAttachment
from app.models.report import Report
from app.models.driver_location import DriverLocation
from app.models.notification import Notification
from app.models.role import Role, Permission
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.models.business import Business
from app.models.registration_request import RegistrationRequest
from app.models.email_otp import EmailOTP
from app.models.approval_log import ApprovalLog
from app.models.audit_log import AuditLog
from app.models.sql_enum import enum_column

__all__ = [
    # Mixins
    "UUIDPrimaryKeyMixin",
    "TimestampMixin",
    "SoftDeleteMixin",
    # Models
    "Company",
    "Customer",
    "CustomerAddress",
    "Driver",
    "DriverDocument",
    "Employee",
    "Vehicle",
    "VehicleAssignment",
    "VehicleImage",
    "Order",
    "OrderStatusHistory",
    "OrderAttachment",
    "Report",
    "DriverLocation",
    "Notification",
    "Role",
    "Permission",
    "RolePermission",
    "User",
    "PasswordReset",
    "RefreshToken",
    "Business",
    "RegistrationRequest",
    "EmailOTP",
    "ApprovalLog",
    "AuditLog",
    "enum_column",
]
