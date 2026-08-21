"""Phase 6: Per-path rate limiter validation test.

Isolated tests for each endpoint category with fresh rate-limit windows.
"""
import asyncio
import json
import time
import statistics

import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


async def main():
    print("=" * 60)
    print("  Phase 6: Per-Path Rate Limit Validation")
    print("=" * 60)

    all_results = []

    async with httpx.AsyncClient(timeout=30.0) as client:

        # =============================================
        # TEST 1: Dashboard endpoint — fresh window
        # Limit: 120 req/60s
        # =============================================
        print("\n" + "=" * 60)
        print("  TEST 1: Dashboard (limit=120/60s) — c=50, fresh window")
        print("=" * 60)

        # Get fresh token
        r = await client.post(f"{BASE}/api/v1/auth/login", json={
            "email": EMAIL, "password": PASSWORD
        })
        token = r.json()["data"]["tokens"]["accessToken"]

        t0 = time.perf_counter()
        tasks = [
            client.get(
                f"{BASE}/api/v1/admin/dashboard/stats",
                headers={"Authorization": f"Bearer {token}"},
            ) for i in range(50)
        ]
        responses = await asyncio.gather(*tasks)
        wall = time.perf_counter() - t0

        statuses = [r.status_code for r in responses]
        ok_count = statuses.count(200)
        rate_limited = statuses.count(429)
        errors = len([s for s in statuses if s not in (200, 429)])

        print(f"  Results: {ok_count}/50 ok, {rate_limited} rate-limited, {errors} errors")
        print(f"  Wall time: {wall:.1f}s")

        all_results.append({
            "test": "dashboard_fresh_c50",
            "limit": 120,
            "concurrency": 50,
            "ok": ok_count,
            "rate_limited": rate_limited,
            "errors": errors,
            "pass": ok_count == 50 and rate_limited == 0 and errors == 0,
        })

        # =============================================
        # TEST 2: Dashboard endpoint — push to limit
        # Send 130 requests to verify ~120 pass
        # =============================================
        print("\n" + "=" * 60)
        print("  TEST 2: Dashboard (limit=120/60s) — c=130, fresh window")
        print("=" * 60)

        # Wait for window to reset
        print("  Waiting 65s for window reset...")
        await asyncio.sleep(65)

        # Get fresh token
        r = await client.post(f"{BASE}/api/v1/auth/login", json={
            "email": EMAIL, "password": PASSWORD
        })
        token = r.json()["data"]["tokens"]["accessToken"]

        t0 = time.perf_counter()
        tasks = [
            client.get(
                f"{BASE}/api/v1/admin/dashboard/stats",
                headers={"Authorization": f"Bearer {token}"},
            ) for i in range(130)
        ]
        responses = await asyncio.gather(*tasks)
        wall = time.perf_counter() - t0

        statuses = [r.status_code for r in responses]
        ok_count = statuses.count(200)
        rate_limited = statuses.count(429)
        errors = len([s for s in statuses if s not in (200, 429)])

        print(f"  Results: {ok_count}/130 ok, {rate_limited} rate-limited, {errors} errors")
        print(f"  Wall time: {wall:.1f}s")
        # Expect roughly 120 pass, ~10 rate-limited (allow +-5 tolerance)
        within_limit = 115 <= ok_count <= 125
        over_limit = 5 <= rate_limited <= 15
        print(f"  Budget check: {ok_count} ok (expect ~120), {rate_limited} 429 (expect ~10)")

        all_results.append({
            "test": "dashboard_push_limit_c130",
            "limit": 120,
            "concurrency": 130,
            "ok": ok_count,
            "rate_limited": rate_limited,
            "errors": errors,
            "pass": within_limit and over_limit and errors == 0,
        })

        # =============================================
        # TEST 3: Login endpoint — strict limit
        # Limit: 10 req/60s. Send 15.
        # =============================================
        print("\n" + "=" * 60)
        print("  TEST 3: Login (limit=10/60s) — c=15, fresh window")
        print("=" * 60)

        print("  Waiting 65s for window reset...")
        await asyncio.sleep(65)

        t0 = time.perf_counter()
        tasks = [
            client.post(f"{BASE}/api/v1/auth/login", json={
                "email": EMAIL, "password": "wrong_password"
            }) for i in range(15)
        ]
        responses = await asyncio.gather(*tasks)
        wall = time.perf_counter() - t0

        statuses = [r.status_code for r in responses]
        # Login with wrong password returns 401 (valid auth failure) or 429 (rate-limited)
        auth_ok = statuses.count(401)  # expected: wrong password
        rate_limited = statuses.count(429)
        errors = len([s for s in statuses if s not in (401, 429)])

        print(f"  Results: {auth_ok} auth-failures(401), {rate_limited} rate-limited(429), {errors} errors")
        print(f"  Wall time: {wall:.1f}s")

        all_results.append({
            "test": "login_strict_c15",
            "limit": 10,
            "concurrency": 15,
            "auth_ok": auth_ok,
            "rate_limited": rate_limited,
            "errors": errors,
            "pass": rate_limited >= 1 and errors == 0,
        })

        # =============================================
        # TEST 4: OTP endpoint — ultra-strict limit
        # Limit: 5 req/60s. Send 10.
        # =============================================
        print("\n" + "=" * 60)
        print("  TEST 4: OTP forgot-password (limit=5/60s) — c=10, fresh window")
        print("=" * 60)

        print("  Waiting 65s for window reset...")
        await asyncio.sleep(65)

        t0 = time.perf_counter()
        tasks = [
            client.post(f"{BASE}/api/v1/otp/forgot-password", json={
                "email": "test@example.com"
            }) for i in range(10)
        ]
        responses = await asyncio.gather(*tasks)
        wall = time.perf_counter() - t0

        statuses = [r.status_code for r in responses]
        ok_count = statuses.count(200)
        rate_limited = statuses.count(429)
        errors = len([s for s in statuses if s not in (200, 429)])

        print(f"  Results: {ok_count} ok(200), {rate_limited} rate-limited(429), {errors} errors")
        print(f"  Wall time: {wall:.1f}s")

        all_results.append({
            "test": "otp_ultrastrict_c10",
            "limit": 5,
            "concurrency": 10,
            "ok": ok_count,
            "rate_limited": rate_limited,
            "errors": errors,
            "pass": rate_limited >= 1 and errors == 0,
        })

    # --- Summary ---
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    for r in all_results:
        mark = "PASS" if r["pass"] else "FAIL"
        print(f"  [{mark}] {r['test']}: limit={r['limit']} c={r['concurrency']}  "
              f"ok={r.get('ok', r.get('auth_ok', '?'))}  429={r['rate_limited']}  err={r['errors']}")

    all_pass = all(r["pass"] for r in all_results)
    print(f"\n  Overall: {'ALL PASS' if all_pass else 'SOME FAILED'}")

    # Save results
    output = {
        "phase": 6,
        "test": "per_path_rate_limit_validation",
        "results": all_results,
        "all_pass": all_pass,
    }
    out_path = "D:\\Tracker\\load-test-results\\phase6_rate_limit_validation.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
