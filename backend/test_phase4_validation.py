"""Phase 4 Validation — Login CPU bottleneck fix."""
import asyncio
import io
import json
import statistics
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Optional

import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class TimingResult:
    label: str
    latencies: list[float] = field(default_factory=list)
    errors: int = 0
    timeouts: int = 0
    http_errors: int = 0

    @property
    def total(self) -> int:
        return len(self.latencies) + self.errors

    @property
    def success(self) -> int:
        return len(self.latencies)

    def stats(self) -> dict:
        if not self.latencies:
            return {
                "total": self.total, "success": 0, "errors": self.errors,
                "timeouts": self.timeouts, "http_errors": self.http_errors,
                "p50": None, "p95": None, "p99": None, "avg": None,
            }
        s = sorted(self.latencies)
        n = len(s)
        return {
            "total": self.total, "success": n, "errors": self.errors,
            "timeouts": self.timeouts, "http_errors": self.http_errors,
            "p50": s[int(n * 0.50)], "p95": s[min(int(n * 0.95), n - 1)],
            "p99": s[min(int(n * 0.99), n - 1)], "avg": statistics.mean(s),
        }


async def timed(c: httpx.AsyncClient, method: str, url: str, **kw) -> tuple[float, Optional[int], Optional[str]]:
    t0 = time.perf_counter()
    try:
        r = await c.request(method, url, **kw)
        return time.perf_counter() - t0, r.status_code, None
    except httpx.TimeoutException:
        return time.perf_counter() - t0, None, "timeout"
    except httpx.HTTPError as e:
        return time.perf_counter() - t0, None, type(e).__name__


# ---------------------------------------------------------------------------
# Test 1: Baseline (no login traffic)
# ---------------------------------------------------------------------------

async def test_baseline(n=20) -> dict:
    print(f"\n=== BASELINE ({n} requests, no login) ===")
    result = TimingResult("health_baseline")
    async with httpx.AsyncClient() as c:
        tasks = [timed(c, "GET", f"{BASE}/health", timeout=10) for _ in range(n)]
        results = await asyncio.gather(*tasks)
        for lat, status, err in results:
            if err:
                result.errors += 1
            elif status and status >= 400:
                result.http_errors += 1
            else:
                result.latencies.append(lat)
    s = result.stats()
    fmt = lambda v: f"{v*1000:.1f}ms" if v is not None else "N/A"
    print(f"  health p50={fmt(s['p50'])}  p95={fmt(s['p95'])}  p99={fmt(s['p99'])}  err={s['errors']}")
    return s


# ---------------------------------------------------------------------------
# Test 2: Login concurrency (1/5/10/25/50)
# ---------------------------------------------------------------------------

async def test_login_concurrency(n: int) -> dict:
    result = TimingResult(f"login_c{n}")
    async with httpx.AsyncClient() as c:
        tasks = [
            timed(c, "POST", f"{BASE}/api/v1/auth/login",
                  json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            for _ in range(n)
        ]
        results = await asyncio.gather(*tasks)
        for lat, status, err in results:
            if err:
                result.errors += 1
                if err == "timeout":
                    result.timeouts += 1
            elif status and status >= 400:
                result.http_errors += 1
            else:
                result.latencies.append(lat)
    s = result.stats()
    fmt = lambda v: f"{v*1000:.1f}ms" if v is not None else "N/A"
    print(f"  c={n:>2d}: p50={fmt(s['p50'])}  p95={fmt(s['p95'])}  p99={fmt(s['p99'])}  ok={s['success']}/{s['total']}  err={s['errors']}")
    return s


# ---------------------------------------------------------------------------
# Test 3: Health during login load (MOST IMPORTANT)
# ---------------------------------------------------------------------------

async def test_health_during_login(login_count: int, health_count: int = 30) -> dict:
    health_result = TimingResult(f"health_during_{login_count}login")
    async with httpx.AsyncClient() as c:
        login_tasks = [
            timed(c, "POST", f"{BASE}/api/v1/auth/login",
                  json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            for _ in range(login_count)
        ]

        async def health_hammer():
            for _ in range(health_count):
                lat, status, err = await timed(c, "GET", f"{BASE}/health", timeout=10)
                if err:
                    health_result.errors += 1
                elif status and status >= 400:
                    health_result.http_errors += 1
                else:
                    health_result.latencies.append(lat)

        hammer = asyncio.create_task(health_hammer())
        login_results = await asyncio.gather(*login_tasks)
        await hammer

    login_ok = sum(1 for _, s, e in login_results if s and s == 200)
    login_err = sum(1 for _, s, e in login_results if e or (s and s != 200))
    hs = health_result.stats()
    fmt = lambda v: f"{v*1000:.1f}ms" if v is not None else "N/A"
    print(f"  {login_count} login + {health_count} health: health p50={fmt(hs['p50'])}  p95={fmt(hs['p95'])}  p99={fmt(hs['p99'])}  err={hs['errors']}  login_ok={login_ok}/{login_count}")
    return {"health": hs, "login_ok": login_ok, "login_err": login_err}


# ---------------------------------------------------------------------------
# Test 4: Error paths
# ---------------------------------------------------------------------------

async def test_error_paths() -> dict:
    print(f"\n=== ERROR PATH TESTS ===")
    results = {}
    async with httpx.AsyncClient() as c:
        # Valid password
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        results["valid_password"] = r.status_code
        print(f"  Valid password:   {r.status_code}")

        # Invalid password
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": "wrongpassword"}, timeout=15)
        results["invalid_password"] = r.status_code
        print(f"  Invalid password: {r.status_code}")

        # Nonexistent email
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": "noexist@test.com", "password": "x"}, timeout=15)
        results["nonexistent_email"] = r.status_code
        print(f"  Nonexistent:      {r.status_code}")

        # Empty body
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": "", "password": ""}, timeout=15)
        results["empty_body"] = r.status_code
        print(f"  Empty body:       {r.status_code}")

        # Valid login → get tokens → verify /users/me
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        data = r.json()
        token = data["data"]["tokens"]["accessToken"]
        refresh = data["data"]["tokens"]["refreshToken"]

        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
        results["jwt_valid"] = r.status_code
        print(f"  JWT valid:        {r.status_code}")

        # Refresh token
        r = await c.post(f"{BASE}/api/v1/auth/refresh",
                         json={"refreshToken": refresh}, timeout=15)
        results["refresh_valid"] = r.status_code
        print(f"  Refresh valid:    {r.status_code}")

    return results


# ---------------------------------------------------------------------------
# Test 5: Regression
# ---------------------------------------------------------------------------

async def test_regression() -> dict:
    print(f"\n=== REGRESSION TESTS ===")
    results = {}
    async with httpx.AsyncClient() as c:
        # Health
        lat, st, _ = await timed(c, "GET", f"{BASE}/health", timeout=10)
        results["health"] = {"status": st, "latency_ms": lat * 1000}
        print(f"  GET  /health:            {'PASS' if st == 200 else 'FAIL'} ({lat*1000:.1f}ms)")

        # Login
        lat, st, _ = await timed(c, "POST", f"{BASE}/api/v1/auth/login",
                                  json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        results["login"] = {"status": st, "latency_ms": lat * 1000}
        print(f"  POST /auth/login:        {'PASS' if st == 200 else 'FAIL'} ({lat*1000:.1f}ms)")

        # Get token for authenticated endpoints
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        token = r.json()["data"]["tokens"]["accessToken"]

        # Users/me
        lat, st, _ = await timed(c, "GET", f"{BASE}/api/v1/users/me",
                                  headers={"Authorization": f"Bearer {token}"}, timeout=10)
        results["users_me"] = {"status": st, "latency_ms": lat * 1000}
        print(f"  GET  /users/me:          {'PASS' if st == 200 else 'FAIL'} ({lat*1000:.1f}ms)")

        # Orders list
        lat, st, _ = await timed(c, "GET", f"{BASE}/api/v1/admin/orders",
                                  headers={"Authorization": f"Bearer {token}"}, timeout=15)
        results["orders"] = {"status": st, "latency_ms": lat * 1000}
        print(f"  GET  /admin/orders:      {'PASS' if st == 200 else 'FAIL'} ({lat*1000:.1f}ms)")

    return results


# ---------------------------------------------------------------------------
# Test 6: Memory
# ---------------------------------------------------------------------------

async def test_memory(n: int = 25) -> dict:
    print(f"\n=== MEMORY TEST ({n} logins) ===")
    tracemalloc.start()
    baseline = tracemalloc.get_traced_memory()
    async with httpx.AsyncClient() as c:
        tasks = [
            timed(c, "POST", f"{BASE}/api/v1/auth/login",
                  json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            for _ in range(n)
        ]
        results = await asyncio.gather(*tasks)
    peak = tracemalloc.get_traced_memory()
    await asyncio.sleep(2)
    after = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    success = sum(1 for _, st, _ in results if st == 200)
    print(f"  baseline={baseline[0]/1024:.0f}KB  peak={peak[0]/1024:.0f}KB  after={after[0]/1024:.0f}KB  success={success}/{n}")
    return {"baseline": baseline[0], "peak": peak[0], "after": after[0], "success": success}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    print("=" * 70)
    print("PHASE 4 VALIDATION — Login CPU Bottleneck Fix")
    print("=" * 70)

    all_results = {}

    # Test 1: Baseline
    all_results["baseline"] = await test_baseline()

    # Test 2: Login concurrency
    print(f"\n=== LOGIN CONCURRENCY TESTS ===")
    login_results = {}
    for c in [1, 5, 10, 25, 50]:
        login_results[c] = await test_login_concurrency(c)
    all_results["login_concurrency"] = login_results

    # Test 3: Health during login load
    print(f"\n=== HEALTH DURING LOGIN LOAD ===")
    health_during = {}
    for c in [5, 10, 25, 50]:
        health_during[c] = await test_health_during_login(c)
    all_results["health_during_login"] = health_during

    # Test 4: Error paths
    all_results["error_paths"] = await test_error_paths()

    # Test 5: Regression
    all_results["regression"] = await test_regression()

    # Test 6: Memory
    all_results["memory"] = await test_memory(25)

    # Save results
    with open("D:\\Tracker\\load-test-results\\phase4_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)

    print(f"\n{'=' * 70}")
    print("ALL TESTS COMPLETE. Results saved to phase4_results.json")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    asyncio.run(main())
