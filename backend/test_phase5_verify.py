"""Verify each optimized repository method individually."""
import asyncio
import time
import httpx

BASE = "http://127.0.0.1:8099"

async def main():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/api/v1/auth/login",
            json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
        token = r.json()["data"]["tokens"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Test the dashboard endpoint 3 times to warm up and get consistent results
        for i in range(3):
            t0 = time.perf_counter()
            r = await c.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
            lat = (time.perf_counter() - t0) * 1000
            print(f"Run {i+1}: {r.status_code} {lat:.1f}ms")
            await asyncio.sleep(1)

        # Test each endpoint for regression
        endpoints = [
            ("/health", "GET"),
            ("/api/v1/users/me", "GET"),
            ("/api/v1/admin/dashboard/stats", "GET"),
            ("/api/v1/admin/dashboard/activity", "GET"),
            ("/api/v1/admin/dashboard/charts/orders", "GET"),
        ]
        print("\nRegression tests:")
        for path, method in endpoints:
            t0 = time.perf_counter()
            r = await c.request(method, f"{BASE}{path}", headers=headers, timeout=30)
            lat = (time.perf_counter() - t0) * 1000
            print(f"  {method} {path}: {r.status_code} ({lat:.1f}ms)")

asyncio.run(main())
