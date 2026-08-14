"""Tests for the Employee/Business Customers, Drivers, and Vehicles listing
endpoints. These screens existed on mobile but called routes that were never
implemented (real 404s, reported via a runtime error log)."""
from __future__ import annotations

import uuid

from app.core.security import hash_password
from app.database.db import session_scope
from app.models.company import Company
from app.models.customer import Customer
from app.models.driver import Driver
from app.models.employee import Employee
from app.models.enums import (
    CompanyStatus,
    DriverStatus,
    EmployeeRole,
    RegistrationStatus,
    UserRole,
    VehicleStatus,
    VehicleType,
)
from app.models.vehicle import Vehicle
from app.repositories.user_repository import UserRepository

AUTH_BASE = "/api/v1/auth"
GR_BASE = "/api/v1/admin/orders"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_active_user(client, role: UserRole, email: str, phone: str, password: str = "Password123!"):
    repo = UserRepository()
    user = await repo.create(
        full_name="Test User", email=email, phone=phone,
        password_hash=hash_password(password), role=role,
    )
    async with session_scope() as session:
        db_user = await session.get(type(user), user.id)
        db_user.status = RegistrationStatus.ACTIVE
        db_user.isActive = True
        db_user.isApproved = True
        db_user.isVerified = True
        db_user.otpVerified = True
        await session.flush()

    resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return str(user.id), resp.json()["data"]["tokens"]["accessToken"]


async def create_company(name: str = "Listings Test Co") -> str:
    company = Company(name=name, status=CompanyStatus.ACTIVE)
    async with session_scope() as session:
        session.add(company)
        await session.flush()
        return str(company.id)


async def link_employee_to_company(user_id: str, company_id: str) -> None:
    async with session_scope() as session:
        session.add(
            Employee(userId=user_id, companyId=uuid.UUID(company_id), role=EmployeeRole.STAFF)
        )
        await session.flush()


async def set_user_company(user_id: str, company_id: str) -> None:
    """Directly sets `User.companyId` — the source of truth used for
    Driver company-scoping (Drivers aren't linked via the `Employee`
    table)."""
    from app.models.user import User

    async with session_scope() as session:
        db_user = await session.get(User, uuid.UUID(user_id))
        db_user.companyId = uuid.UUID(company_id)
        await session.flush()


async def create_customer(full_name: str = "Test Customer", phone: str = "+15553000001") -> str:
    async with session_scope() as session:
        customer = Customer(fullName=full_name, phone=phone, email=None, address="123 Test St")
        session.add(customer)
        await session.flush()
        return str(customer.id)


async def create_driver_row(company_id: str, user_id: str) -> str:
    async with session_scope() as session:
        driver = Driver(
            userId=user_id, companyId=uuid.UUID(company_id),
            licenseNumber="DL123", status=DriverStatus.ONLINE,
        )
        session.add(driver)
        await session.flush()
        return str(driver.id)


async def create_order_for_company(company_id: str, order_number: str, customer_id: str | None = None) -> str:
    from datetime import datetime, timezone

    from app.models.order import Order

    async with session_scope() as session:
        order = Order(
            orderNumber=order_number,
            companyId=uuid.UUID(company_id),
            customerId=uuid.UUID(customer_id) if customer_id else None,
            pickupAddress="A",
            deliveryAddress="B",
            pickupTime=datetime.now(timezone.utc),
        )
        session.add(order)
        await session.flush()
        return str(order.id)


async def create_vehicle_row(company_id: str) -> str:
    async with session_scope() as session:
        vehicle = Vehicle(
            companyId=uuid.UUID(company_id), vehicleType=VehicleType.VAN,
            licensePlate="TEST-001", status=VehicleStatus.AVAILABLE,
        )
        session.add(vehicle)
        await session.flush()
        return str(vehicle.id)


async def test_employee_can_list_customers(client):
    """Staff (EMPLOYEE) is company-scoped: they only see customers who have
    placed an order with their own company, so the test employee must be
    linked to the same company the order belongs to."""
    emp_user_id, token = await create_active_user(client, UserRole.EMPLOYEE, "listings-emp1@example.com", "+15553000010")
    company_id = await create_company()
    await link_employee_to_company(emp_user_id, company_id)
    customer_id = await create_customer("Alice Listings", "+15553000011")
    await create_order_for_company(company_id, "LISTINGS-CUST-001", customer_id=customer_id)

    resp = await client.get("/api/v1/employee/customers", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert any(c["fullName"] == "Alice Listings" for c in items)


async def test_employee_can_list_drivers(client):
    driver_user_id, _ = await create_active_user(client, UserRole.DRIVER, "listings-driver1@example.com", "+15553000012")
    emp_user_id, emp_token = await create_active_user(client, UserRole.EMPLOYEE, "listings-emp2@example.com", "+15553000013")
    company_id = await create_company()
    await link_employee_to_company(emp_user_id, company_id)
    await create_driver_row(company_id, driver_user_id)

    resp = await client.get("/api/v1/employee/drivers", headers=auth_headers(emp_token))
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert any(d["licenseNumber"] == "DL123" for d in items)


async def test_employee_can_list_vehicles(client):
    emp_user_id, emp_token = await create_active_user(client, UserRole.EMPLOYEE, "listings-emp3@example.com", "+15553000014")
    company_id = await create_company()
    await link_employee_to_company(emp_user_id, company_id)
    await create_vehicle_row(company_id)

    resp = await client.get("/api/v1/employee/vehicles", headers=auth_headers(emp_token))
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert any(v["licensePlate"] == "TEST-001" for v in items)


async def test_business_vehicles_scoped_to_own_company(client):
    biz_user_id, biz_token = await create_active_user(client, UserRole.BUSINESS, "listings-biz1@example.com", "+15553000015")
    own_company_id = await create_company("Own Co")
    other_company_id = await create_company("Other Co")
    await link_employee_to_company(biz_user_id, own_company_id)
    await create_vehicle_row(own_company_id)
    await create_vehicle_row(other_company_id)

    resp = await client.get("/api/v1/business/vehicles", headers=auth_headers(biz_token))
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["companyName"] == "Own Co"


async def test_customers_endpoints_require_authentication(client):
    resp = await client.get("/api/v1/employee/customers")
    assert resp.status_code == 401, resp.text


async def test_employee_orders_status_is_lowercase_and_carries_gr_fields(client):
    """Regression test: `/employee/orders` (used by the web `/tracker` Staff
    Panel, since it isn't Admin-tier-only) must return `status` as the plain
    lowercase value ('pending', not 'OrderStatus.PENDING') and must include
    `consignorName`/`consigneeName`/`hasSlip` — a real bug caught by manually
    hitting the endpoint during verification."""
    _, admin_token = await create_active_user(client, UserRole.ADMIN, "listings-admin1@example.com", "+15553000016")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE,
        json={
            "grNumber": "LISTINGS-GR-001",
            "companyId": company_id,
            "pickupAddress": "Depot A",
            "deliveryAddress": "Depot B",
            "pickupTime": "2026-08-11T10:00:00Z",
            "consignorName": "Listings Consignor",
            "consigneeName": "Listings Consignee",
        },
        headers=auth_headers(admin_token),
    )
    assert create_resp.status_code == 201, create_resp.text

    emp_user_id, emp_token = await create_active_user(client, UserRole.EMPLOYEE, "listings-emp4@example.com", "+15553000017")
    await link_employee_to_company(emp_user_id, company_id)
    resp = await client.get(
        "/api/v1/employee/orders", params={"search": "LISTINGS-GR-001"}, headers=auth_headers(emp_token)
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    match = next((i for i in items if i["orderNumber"] == "LISTINGS-GR-001"), None)
    assert match is not None
    assert match["status"] == "pending"
    assert match["consignorName"] == "Listings Consignor"
    assert match["consigneeName"] == "Listings Consignee"
    assert match["hasSlip"] is False


async def test_driver_can_reach_employee_orders_but_only_update_own_assignment(client):
    """A Driver logging into the web `/tracker` page sees the same
    `/employee/orders` list as Staff, but the shared status-update endpoint
    still enforces `_assert_order_access` — Driver can only modify a GR
    assigned to them, not any GR in the list."""
    _, admin_token = await create_active_user(client, UserRole.ADMIN, "listings-admin2@example.com", "+15553000018")
    company_id = await create_company()
    create_resp = await client.post(
        GR_BASE,
        json={
            "grNumber": "LISTINGS-GR-002",
            "companyId": company_id,
            "pickupAddress": "Depot A",
            "deliveryAddress": "Depot B",
            "pickupTime": "2026-08-11T10:00:00Z",
            "consignorName": "Listings Consignor 2",
            "consigneeName": "Listings Consignee 2",
        },
        headers=auth_headers(admin_token),
    )
    assert create_resp.status_code == 201, create_resp.text
    gr_id = create_resp.json()["data"]["id"]

    driver_user_id, driver_token = await create_active_user(client, UserRole.DRIVER, "listings-driver2@example.com", "+15553000019")
    await set_user_company(driver_user_id, company_id)

    list_resp = await client.get(
        "/api/v1/employee/orders", params={"search": "LISTINGS-GR-002"}, headers=auth_headers(driver_token)
    )
    assert list_resp.status_code == 200, list_resp.text
    assert any(i["orderNumber"] == "LISTINGS-GR-002" for i in list_resp.json()["data"]["items"])

    status_resp = await client.patch(
        f"/api/v1/orders/{gr_id}/status", json={"status": "assigned"}, headers=auth_headers(driver_token)
    )
    assert status_resp.status_code == 403, status_resp.text


async def test_business_can_create_order(client):
    """`POST /business/orders` — CreateOrderScreen.tsx (mobile) posts here;
    the route never existed until this fix."""
    biz_user_id, biz_token = await create_active_user(client, UserRole.BUSINESS, "listings-biz2@example.com", "+15553000020")
    company_id = await create_company("Order Creator Co")
    await link_employee_to_company(biz_user_id, company_id)

    resp = await client.post(
        "/api/v1/business/orders",
        json={
            "pickupAddress": "123 Warehouse Rd",
            "deliveryAddress": "456 Delivery Ave",
            "weight": "12.5",
            "value": "999.50",
            "notes": "Handle with care",
        },
        headers=auth_headers(biz_token),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["pickupAddress"] == "123 Warehouse Rd"
    assert data["amount"] == 999.5

    list_resp = await client.get("/api/v1/business/orders", headers=auth_headers(biz_token))
    assert any(o["id"] == data["id"] for o in list_resp.json()["data"]["items"])


async def test_business_create_order_requires_pickup_and_delivery(client):
    biz_user_id, biz_token = await create_active_user(client, UserRole.BUSINESS, "listings-biz3@example.com", "+15553000021")
    company_id = await create_company("Validation Test Co")
    await link_employee_to_company(biz_user_id, company_id)

    resp = await client.post(
        "/api/v1/business/orders", json={"pickupAddress": ""}, headers=auth_headers(biz_token)
    )
    assert resp.status_code in (400, 422), resp.text
