"""Quick test that the optimized dashboard endpoint returns correct data."""
import asyncio
import httpx

BASE = "http://127.0.0.1:8099"

async def main():
    async with httpx.AsyncClient() as c:
        # Login
        r = await c.post(f"{BASE}/api/v1/auth/login",
            json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
        assert r.status_code == 200, f"Login failed: {r.status_code}"
        token = r.json()["data"]["tokens"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Dashboard stats
        r = await c.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
        print(f"Status: {r.status_code}")
        assert r.status_code == 200, f"Dashboard failed: {r.status_code} {r.text}"

        data = r.json()["data"]
        checks = [
            ("totalOrders", int),
            ("pendingOrders", int),
            ("completedOrders", int),
            ("cancelledOrders", int),
            ("todaysDeliveries", int),
            ("activeDrivers", int),
            ("onlineDrivers", int),
            ("vehicles", int),
            ("companies", int),
            ("employees", int),
            ("totalUsers", int),
            ("pendingApprovals", int),
            ("revenue", (int, float)),
            ("growth", (int, float)),
            ("latestPendingApprovals", list),
            ("systemHealth", str),
        ]
        for key, typ in checks:
            val = data.get(key)
            assert isinstance(val, typ), f"FAIL: {key}={val!r} (expected {typ})"
            print(f"  {key}: {val}")

        print("\nAll checks PASSED!")

asyncio.run(main())
