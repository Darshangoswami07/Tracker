"""Phase 5 full regression test — verify all endpoints still work after dashboard optimization."""
import asyncio
import time
import httpx

BASE = "http://127.0.0.1:8099"

results = []

async def test(name, method, path, client, headers, json=None, expect_status=200):
    t0 = time.perf_counter()
    try:
        r = await client.request(method, f"{BASE}{path}", headers=headers,
                                  json=json, timeout=30)
        lat = (time.perf_counter() - t0) * 1000
        ok = r.status_code == expect_status
        results.append({"name": name, "status": r.status_code, "ok": ok, "lat": lat})
        mark = "PASS" if ok else "FAIL"
        print(f"  [{mark}] {name}: {r.status_code} ({lat:.1f}ms)")
    except Exception as e:
        lat = (time.perf_counter() - t0) * 1000
        results.append({"name": name, "status": None, "ok": False, "lat": lat, "error": str(e)})
        print(f"  [FAIL] {name}: {e} ({lat:.1f}ms)")

async def main():
    async with httpx.AsyncClient() as c:
        # Login
        r = await c.post(f"{BASE}/api/v1/auth/login",
            json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
        token = r.json()["data"]["tokens"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        print("=== Health & Auth ===")
        await test("Health", "GET", "/health", c, headers, expect_status=200)
        await test("Login (valid)", "POST", "/api/v1/auth/login", c, {},
                    json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, expect_status=200)
        await test("Login (invalid password)", "POST", "/api/v1/auth/login", c, {},
                    json={"email": "abhiyanshbisht@gmail.com", "password": "wrongpassword"}, expect_status=401)
        await test("Login (bad email)", "POST", "/api/v1/auth/login", c, {},
                    json={"email": "nonexistent@test.com", "password": "12345678"}, expect_status=401)

        print("\n=== User Endpoints ===")
        await test("Get user (me)", "GET", "/api/v1/users/me", c, headers)

        print("\n=== Dashboard Endpoints (TARGET) ===")
        await test("Dashboard stats", "GET", "/api/v1/admin/dashboard/stats", c, headers)
        await test("Dashboard activity", "GET", "/api/v1/admin/dashboard/activity", c, headers)
        await test("Dashboard charts orders", "GET", "/api/v1/admin/dashboard/charts/orders", c, headers)

        print("\n=== Admin Endpoints ===")
        await test("List users", "GET", "/api/v1/admin/users", c, headers)
        await test("List companies", "GET", "/api/v1/admin/companies", c, headers)
        await test("List drivers", "GET", "/api/v1/admin/drivers", c, headers)
        await test("List vehicles", "GET", "/api/v1/admin/vehicles", c, headers)

        print("\n=== Registration Requests ===")
        await test("Pending requests", "GET", "/api/v1/admin/registration-requests/pending", c, headers)

        print("\n=== Concurrent Dashboard (c=10) ===")
        async def single_request():
            t0 = time.perf_counter()
            r = await c.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
            return r.status_code, (time.perf_counter() - t0) * 1000
        tasks = [single_request() for _ in range(10)]
        concurrent_results = await asyncio.gather(*tasks)
        successes = sum(1 for s, _ in concurrent_results if s == 200)
        lats = sorted([l for s, l in concurrent_results if s == 200])
        p50 = lats[len(lats)//2] if lats else 0
        p95 = lats[int(len(lats)*0.95)] if lats else 0
        print(f"  Concurrent c=10: {successes}/10 success  p50={p50:.1f}ms  p95={p95:.1f}ms")
        results.append({"name": "Concurrent dashboard c=10", "status": 200 if successes == 10 else None,
                        "ok": successes == 10, "lat": p50})

        # Summary
        print(f"\n{'='*60}")
        passed = sum(1 for r in results if r["ok"])
        total = len(results)
        print(f"RESULTS: {passed}/{total} passed")
        if passed < total:
            print("FAILURES:")
            for r in results:
                if not r["ok"]:
                    print(f"  - {r['name']}: status={r.get('status')} error={r.get('error','')}")

asyncio.run(main())
