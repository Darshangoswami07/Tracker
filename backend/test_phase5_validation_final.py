"""
Phase 5 — Post-Optimization Validation (Measurement Only)
Runs health check, version verification, benchmarks, contract check, RBAC test.
All in one script. No code modifications.
"""
import asyncio
import json
import statistics
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"
RESULTS_DIR = Path(r"D:\Tracker\load-test-results")


async def get_token(client: httpx.AsyncClient) -> str:
    r = await client.post(f"{BASE}/api/v1/auth/login",
                          json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code}"
    return r.json()["data"]["tokens"]["accessToken"]


async def timed_request(client, method, url, headers=None, json_data=None, timeout=30):
    t0 = time.perf_counter()
    try:
        r = await client.request(method, url, headers=headers, json=json_data, timeout=timeout)
        return time.perf_counter() - t0, r.status_code, r.json() if r.status_code == 200 else None
    except httpx.TimeoutException:
        return time.perf_counter() - t0, "timeout", None
    except Exception as e:
        return time.perf_counter() - t0, "error", str(e)


async def bench_concurrent(client, token, concurrency):
    """Send `concurrency` parallel GET requests to /dashboard/stats."""
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE}/api/v1/admin/dashboard/stats"
    tasks = [timed_request(client, "GET", url, headers=headers, timeout=30) for _ in range(concurrency)]
    results = await asyncio.gather(*tasks)

    lats_ms = []
    ok = 0
    err_4xx = 0
    err_5xx = 0
    err_429 = 0
    timeouts = 0
    errors = 0

    for t, status, _ in results:
        if status == "timeout":
            timeouts += 1
        elif status == "error":
            errors += 1
        elif status == 200:
            ok += 1
            lats_ms.append(t * 1000)
        elif status == 429:
            err_429 += 1
        elif 400 <= status < 500:
            err_4xx += 1
        elif 500 <= status < 600:
            err_5xx += 1
        else:
            errors += 1

    if lats_ms:
        s = sorted(lats_ms)
        n = len(s)
        p50 = s[int(n * 0.50)]
        p95 = s[min(int(n * 0.95), n - 1)]
        p99 = s[min(int(n * 0.99), n - 1)]
        avg = statistics.mean(s)
        mn = s[0]
        mx = s[-1]
        wall_time = max(t for t, _, _ in results if isinstance(t, (int, float)))
        rps = ok / wall_time if wall_time > 0 else 0
    else:
        p50 = p95 = p99 = avg = mn = mx = rps = 0

    return {
        "concurrency": concurrency,
        "total": len(results),
        "ok": ok,
        "4xx": err_4xx,
        "5xx": err_5xx,
        "429": err_429,
        "timeouts": timeouts,
        "errors_other": errors,
        "rps": round(rps, 2),
        "p50": round(p50, 1),
        "p95": round(p95, 1),
        "p99": round(p99, 1),
        "min": round(mn, 1),
        "max": round(mx, 1),
        "avg": round(avg, 1),
    }


async def verify_code_version(client, token):
    """Verify that the Phase 5 optimized code is being served.
    Check that the response still has all expected fields (same as old),
    and that the endpoint returns data in <3s for c=1 (Phase 5 behavior)."""
    headers = {"Authorization": f"Bearer {token}"}
    t0 = time.perf_counter()
    r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
    lat = (time.perf_counter() - t0) * 1000
    data = r.json()["data"]

    # Check all expected fields exist
    required_fields = [
        "totalOrders", "todaysDeliveries", "pendingOrders", "completedOrders",
        "cancelledOrders", "activeDrivers", "onlineDrivers", "vehicles",
        "companies", "employees", "revenue", "growth", "pendingApprovals",
        "totalUsers", "totalCompanies", "totalDrivers", "totalVehicles",
        "onlineUsers", "systemHealth", "latestPendingApprovals"
    ]
    missing = [f for f in required_fields if f not in data]
    return {
        "status_code": r.status_code,
        "latency_ms": round(lat, 1),
        "has_all_fields": len(missing) == 0,
        "missing_fields": missing,
        "is_phase5": lat < 3000,  # Phase 5 target: <3s for c=1
    }


async def verify_response_contract(client, token):
    """Verify response contract matches expected structure."""
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
    data = r.json()

    checks = []
    # Top-level structure
    checks.append(("response has 'data' key", "data" in data))

    d = data.get("data", {})
    # Integer fields
    int_fields = ["totalOrders", "todaysDeliveries", "pendingOrders", "completedOrders",
                  "cancelledOrders", "activeDrivers", "onlineDrivers", "vehicles",
                  "companies", "employees", "pendingApprovals", "totalUsers",
                  "totalCompanies", "totalDrivers", "totalVehicles", "onlineUsers"]
    for f in int_fields:
        checks.append((f"field '{f}' is int", isinstance(d.get(f), int)))

    # Float fields
    checks.append(("field 'revenue' is numeric", isinstance(d.get("revenue"), (int, float))))
    checks.append(("field 'growth' is numeric", isinstance(d.get("growth"), (int, float))))

    # String fields
    checks.append(("field 'systemHealth' is str", isinstance(d.get("systemHealth"), str)))

    # List fields
    checks.append(("field 'latestPendingApprovals' is list", isinstance(d.get("latestPendingApprovals"), list)))

    return {"all_passed": all(ok for _, ok in checks), "checks": checks}


async def verify_rbac(client):
    """Verify RBAC: valid token works, invalid token fails, no token fails."""
    results = []

    # Valid token
    token = await get_token(client)
    r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats",
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
    results.append(("valid_token", r.status_code, 200))

    # Invalid token
    r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats",
                         headers={"Authorization": "Bearer invalid_token_abc123"}, timeout=15)
    results.append(("invalid_token", r.status_code, 401))

    # No token
    r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats", timeout=15)
    results.append(("no_token", r.status_code, 401))

    all_ok = all(actual == expected for _, actual, expected in results)
    return {"all_passed": all_ok, "results": [(name, actual, expected) for name, actual, expected in results]}


async def main():
    print("=" * 70)
    print("PHASE 5 — POST-OPTIMIZATION VALIDATION (MEASUREMENT ONLY)")
    print("=" * 70)

    all_results = {}

    async with httpx.AsyncClient() as client:
        # 1. Health check
        print("\n[1] HEALTH CHECK")
        r = await client.get(f"{BASE}/health", timeout=10)
        print(f"    GET /health -> {r.status_code} ({r.text})")
        all_results["health"] = r.status_code == 200

        if r.status_code != 200:
            print("    FATAL: Server is not healthy. Aborting.")
            return

        # 2. Get token
        token = await get_token(client)
        print(f"    Auth token obtained.")

        # 3. Version verification
        print("\n[2] CODE VERSION VERIFICATION")
        version = await verify_code_version(client, token)
        print(f"    Status: {version['status_code']}")
        print(f"    Latency (c=1): {version['latency_ms']}ms")
        print(f"    All fields present: {version['has_all_fields']}")
        if version["missing_fields"]:
            print(f"    MISSING: {version['missing_fields']}")
        print(f"    Phase 5 behavior (<3s): {version['is_phase5']}")
        all_results["version"] = version

        # 4. Response contract
        print("\n[3] RESPONSE CONTRACT VERIFICATION")
        contract = await verify_response_contract(client, token)
        print(f"    All checks passed: {contract['all_passed']}")
        for name, ok in contract["checks"]:
            mark = "PASS" if ok else "FAIL"
            print(f"      [{mark}] {name}")
        all_results["contract"] = contract

        # 5. RBAC verification
        print("\n[4] RBAC VERIFICATION")
        rbac = await verify_rbac(client)
        print(f"    All checks passed: {rbac['all_passed']}")
        for name, actual, expected in rbac["results"]:
            mark = "PASS" if actual == expected else "FAIL"
            print(f"      [{mark}] {name}: {actual} (expected {expected})")
        all_results["rbac"] = rbac

        # 6. Warm up
        print("\n[5] WARMING UP (2 requests)...")
        headers = {"Authorization": f"Bearer {token}"}
        for i in range(2):
            await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
            await asyncio.sleep(1)

        # 7. Concurrency benchmarks
        print("\n[6] CONCURRENCY BENCHMARKS")
        bench_results = {}
        for c in [5, 10, 25, 50]:
            print(f"    Running c={c}...", end="", flush=True)
            r = await bench_concurrent(client, token, c)
            bench_results[f"c{c}"] = r
            print(f" p50={r['p50']}ms  p95={r['p95']}ms  p99={r['p99']}ms  "
                  f"rps={r['rps']}  ok={r['ok']}/{r['total']}  "
                  f"429={r['429']}  timeouts={r['timeouts']}  4xx={r['4xx']}  5xx={r['5xx']}")
            await asyncio.sleep(6)  # Wait 6s between batches to avoid rate limiter

        all_results["benchmarks"] = bench_results

        # 8. Final concurrent c=50 extended test (10 requests to determine limit)
        print("\n[7] EXTENDED c=50 TEST (10 sequential dashboard requests)")
        extended_lats = []
        extended_ok = 0
        for i in range(10):
            t0 = time.perf_counter()
            r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
            lat = (time.perf_counter() - t0) * 1000
            if r.status_code == 200:
                extended_ok += 1
                extended_lats.append(lat)
            await asyncio.sleep(0.5)

        if extended_lats:
            s = sorted(extended_lats)
            print(f"    Sequential c=1 x10: {extended_ok}/10 ok  "
                  f"p50={s[len(s)//2]:.1f}ms  min={s[0]:.1f}ms  max={s[-1]:.1f}ms")
        all_results["extended_sequential"] = {
            "ok": extended_ok, "total": 10,
            "p50": round(s[len(s)//2], 1) if extended_lats else None,
            "min": round(s[0], 1) if extended_lats else None,
            "max": round(s[-1], 1) if extended_lats else None,
        }

    # Save results
    output = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target": BASE,
        "health": all_results["health"],
        "version": all_results["version"],
        "contract": all_results["contract"],
        "rbac": all_results["rbac"],
        "benchmarks": all_results["benchmarks"],
        "extended_sequential": all_results["extended_sequential"],
    }
    out_path = RESULTS_DIR / "phase5_validation_final.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
