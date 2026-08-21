"""
Phase 3 Validation Harness — OCR Concurrency + Event Loop Blocking Tests.
Runs against local FastAPI server on port 8099.
"""
import asyncio
import io
import json
import os
import statistics
import sys
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Optional

import httpx
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_test_image_bytes(width=600, height=400) -> bytes:
    """Create a simple test slip image."""
    img = Image.new("RGB", (width, height), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((50, 30), "G.R. NO: TEST-001", fill="black")
    draw.text((50, 60), "DATE: 21/08/2026", fill="black")
    draw.text((50, 100), "CONSIGNOR: ABC Transport", fill="black")
    draw.text((50, 140), "CONSIGNEE: XYZ Corp", fill="black")
    draw.text((50, 180), "FROM: Delhi", fill="black")
    draw.text((50, 220), "TO: Mumbai", fill="black")
    draw.text((50, 260), "WEIGHT: 50 KGS", fill="black")
    draw.text((50, 300), "GSTIN: 07AABCT1234F1Z5", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def login(client: httpx.AsyncClient) -> str:
    resp = await client.post(f"{BASE}/api/v1/auth/login", json={
        "email": EMAIL, "password": PASSWORD
    })
    data = resp.json()
    return data["data"]["tokens"]["accessToken"]


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
                "p50": None, "p95": None, "p99": None, "avg": None, "rps": None,
            }
        sorted_lat = sorted(self.latencies)
        n = len(sorted_lat)
        return {
            "total": self.total,
            "success": n,
            "errors": self.errors,
            "timeouts": self.timeouts,
            "http_errors": self.http_errors,
            "p50": sorted_lat[int(n * 0.50)],
            "p95": sorted_lat[min(int(n * 0.95), n - 1)],
            "p99": sorted_lat[min(int(n * 0.99), n - 1)],
            "avg": statistics.mean(sorted_lat),
        }


async def timed_request(client, method, url, **kwargs) -> tuple[float, Optional[int], Optional[str]]:
    """Returns (latency_seconds, status_code_or_None, error_str_or_None)."""
    start = time.perf_counter()
    try:
        resp = await client.request(method, url, **kwargs)
        latency = time.perf_counter() - start
        return latency, resp.status_code, None
    except httpx.TimeoutException:
        latency = time.perf_counter() - start
        return latency, None, "timeout"
    except httpx.HTTPError as e:
        latency = time.perf_counter() - start
        return latency, None, str(type(e).__name__)


async def health_request(client: httpx.AsyncClient) -> tuple[float, Optional[int], Optional[str]]:
    return await timed_request(client, "GET", f"{BASE}/health", timeout=10.0)


async def ocr_request(client: httpx.AsyncClient, image_bytes: bytes, token: str) -> tuple[float, Optional[int], Optional[str]]:
    files = {"file": ("slip.png", image_bytes, "image/png")}
    return await timed_request(
        client, "POST", f"{BASE}/api/v1/admin/orders/ocr-extract",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120.0,
    )


async def login_request(client: httpx.AsyncClient) -> tuple[float, Optional[int], Optional[str]]:
    return await timed_request(
        client, "POST", f"{BASE}/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD}, timeout=15.0,
    )


async def users_me_request(client: httpx.AsyncClient, token: str) -> tuple[float, Optional[int], Optional[str]]:
    return await timed_request(
        client, "GET", f"{BASE}/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"}, timeout=10.0,
    )


# ---------------------------------------------------------------------------
# Test 1: Baseline (no OCR traffic)
# ---------------------------------------------------------------------------

async def test_baseline(n=20) -> dict:
    """Measure health + login endpoints with zero OCR traffic."""
    print(f"\n=== BASELINE ({n} requests, no OCR) ===")
    health_result = TimingResult("health")
    login_result = TimingResult("login")
    users_result = TimingResult("users/me")

    async with httpx.AsyncClient() as client:
        token = await login(client)

        tasks = []
        for _ in range(n):
            tasks.append(health_request(client))
        results = await asyncio.gather(*tasks)
        for lat, status, err in results:
            if err:
                health_result.errors += 1
                if err == "timeout":
                    health_result.timeouts += 1
            elif status and status >= 400:
                health_result.http_errors += 1
            else:
                health_result.latencies.append(lat)

        tasks = []
        for _ in range(n):
            tasks.append(users_me_request(client, token))
        results = await asyncio.gather(*tasks)
        for lat, status, err in results:
            if err:
                users_result.errors += 1
                if err == "timeout":
                    users_result.timeouts += 1
            elif status and status >= 400:
                users_result.http_errors += 1
            else:
                users_result.latencies.append(lat)

    hs = health_result.stats()
    us = users_result.stats()
    print(f"  health  : p50={hs['p50']:.4f}s  p95={hs['p95']:.4f}s  p99={hs['p99']:.4f}s  err={hs['errors']}")
    print(f"  users/me: p50={us['p50']:.4f}s  p95={us['p95']:.4f}s  p99={us['p99']:.4f}s  err={us['errors']}")
    return {"health": hs, "users/me": us}


# ---------------------------------------------------------------------------
# Test 2: OCR concurrency (1, 5, 10, 25, 50)
# ---------------------------------------------------------------------------

async def test_ocr_concurrency(concurrency: int, image_bytes: bytes, token: str) -> dict:
    """Send `concurrency` OCR requests simultaneously."""
    result = TimingResult(f"ocr_c{concurrency}")
    async with httpx.AsyncClient() as client:
        tasks = [ocr_request(client, image_bytes, token) for _ in range(concurrency)]
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
    return result.stats()


# ---------------------------------------------------------------------------
# Test 3: Non-OCR requests DURING OCR load (MOST IMPORTANT)
# ---------------------------------------------------------------------------

async def test_health_during_ocr(ocr_count: int, image_bytes: bytes, token: str, health_count: int = 30) -> dict:
    """Send OCR requests and simultaneously hammer /health."""
    health_result = TimingResult(f"health_during_{ocr_count}ocr")

    async with httpx.AsyncClient() as client:
        # Start OCR tasks
        ocr_tasks = [ocr_request(client, image_bytes, token) for _ in range(ocr_count)]

        # Interleave health checks while OCR is running
        async def health_hammer():
            for _ in range(health_count):
                lat, status, err = await health_request(client)
                if err:
                    health_result.errors += 1
                    if err == "timeout":
                        health_result.timeouts += 1
                elif status and status >= 400:
                    health_result.http_errors += 1
                else:
                    health_result.latencies.append(lat)

        hammer_task = asyncio.create_task(health_hammer())
        ocr_results = await asyncio.gather(*ocr_tasks)
        await hammer_task

    ocr_success = sum(1 for _, s, e in ocr_results if s and s == 200)
    ocr_errors = sum(1 for _, s, e in ocr_results if e or (s and s != 200))

    hs = health_result.stats()
    # Calculate total elapsed time for RPS
    if hs["p99"] is not None:
        # Rough window: last health request finishes around the time OCR finishes
        # Use sum of all OCR latencies as a lower bound on total wall time
        pass

    print(f"  {ocr_count} OCR + {health_count} health:")
    print(f"    health p50={hs['p50']:.4f}s  p95={hs['p95']:.4f}s  p99={hs['p99']:.4f}s  err={hs['errors']}  ok={hs['success']}")
    print(f"    OCR    success={ocr_success}  errors={ocr_errors}")
    return {"health": hs, "ocr_success": ocr_success, "ocr_errors": ocr_errors}


# ---------------------------------------------------------------------------
# Test 4: Event loop test — health serialized?
# ---------------------------------------------------------------------------

async def test_event_loop_serialization(ocr_count: int, image_bytes: bytes, token: str) -> dict:
    """Send 50 rapid health checks interleaved with OCR. Measure max gap between consecutive health responses."""
    gaps = []
    health_latencies = []
    errors = 0

    async with httpx.AsyncClient() as client:
        ocr_tasks = [ocr_request(client, image_bytes, token) for _ in range(ocr_count)]

        async def rapid_health():
            nonlocal errors
            prev_time = time.perf_counter()
            for _ in range(50):
                lat, status, err = await health_request(client)
                now = time.perf_counter()
                gaps.append(now - prev_time)
                prev_time = now
                if err:
                    errors += 1
                else:
                    health_latencies.append(lat)

        hammer = asyncio.create_task(rapid_health())
        await asyncio.gather(*ocr_tasks)
        await hammer

    sorted_gaps = sorted(gaps)
    max_gap = max(gaps) if gaps else 0
    p99_gap = sorted_gaps[int(len(sorted_gaps) * 0.99)] if sorted_gaps else 0

    print(f"  Event loop ({ocr_count} OCR): max_gap={max_gap:.4f}s  p99_gap={p99_gap:.4f}s  health_err={errors}")
    return {
        "ocr_count": ocr_count,
        "health_requests": len(health_latencies) + errors,
        "health_ok": len(health_latencies),
        "max_gap_between_health": max_gap,
        "p99_gap_between_health": p99_gap,
        "health_p50": statistics.median(health_latencies) if health_latencies else None,
        "health_avg": statistics.mean(health_latencies) if health_latencies else None,
    }


# ---------------------------------------------------------------------------
# Test 5: Connection pool test
# ---------------------------------------------------------------------------

async def test_connection_pool(image_bytes: bytes, token: str) -> dict:
    """Send 10 OCR requests; with pool=5, only 5 can be active at once.
    We can't measure outbound connections directly, but we can verify
    all requests eventually complete without errors."""
    print(f"\n=== CONNECTION POOL TEST (10 OCR, pool=5) ===")
    result = TimingResult("pool_test")
    start = time.perf_counter()
    async with httpx.AsyncClient() as client:
        tasks = [ocr_request(client, image_bytes, token) for _ in range(10)]
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
    elapsed = time.perf_counter() - start
    s = result.stats()
    print(f"  Total elapsed: {elapsed:.2f}s")
    print(f"  Success: {s['success']}/{s['total']}  Timeouts: {s['timeouts']}  HTTP errors: {s['http_errors']}")
    def fmt(v): return f"{v:.4f}s" if v is not None else "N/A"
    print(f"  p50={fmt(s['p50'])}  p95={fmt(s['p95'])}  p99={fmt(s['p99'])}")
    return {**s, "wall_time": elapsed}


# ---------------------------------------------------------------------------
# Test 6: Memory test
# ---------------------------------------------------------------------------

async def test_memory(ocr_count: int, image_bytes: bytes, token: str) -> dict:
    """Measure memory before/during/after OCR burst."""
    tracemalloc.start()

    # Baseline
    snapshot1 = tracemalloc.take_snapshot()
    baseline = tracemalloc.get_traced_memory()

    async with httpx.AsyncClient() as client:
        tasks = [ocr_request(client, image_bytes, token) for _ in range(ocr_count)]
        results = await asyncio.gather(*tasks)

    # After all complete
    peak = tracemalloc.get_traced_memory()
    snapshot2 = tracemalloc.take_snapshot()

    # Small delay for GC
    await asyncio.sleep(1)
    after = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"  {ocr_count} OCR: baseline={baseline[0]/1024:.0f}KB  peak={peak[0]/1024:.0f}KB  after={after[0]/1024:.0f}KB")
    return {
        "ocr_count": ocr_count,
        "baseline_bytes": baseline[0],
        "peak_bytes": peak[0],
        "current_bytes": after[0],
        "peak_delta_kb": (peak[0] - baseline[0]) / 1024,
        "recovery_delta_kb": (after[0] - baseline[0]) / 1024,
    }


# ---------------------------------------------------------------------------
# Test 7: Error paths
# ---------------------------------------------------------------------------

async def test_error_paths(token: str, image_bytes: bytes) -> dict:
    """Test all error-mapping paths remain unchanged."""
    print(f"\n=== ERROR PATH TESTS ===")
    results = {}

    async with httpx.AsyncClient() as client:
        # 7a: Empty file
        resp = await client.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("empty.png", b"", "image/png")},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        body = resp.json()
        results["empty_file"] = {"status": resp.status_code, "code": body.get("error", {}).get("code")}
        print(f"  Empty file: {resp.status_code} code={results['empty_file']['code']}")

        # 7b: Oversized file (>10MB)
        big = b"\x00" * (11 * 1024 * 1024)
        resp = await client.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("big.png", big, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        body = resp.json()
        results["oversized"] = {"status": resp.status_code, "code": body.get("error", {}).get("code")}
        print(f"  Oversized:  {resp.status_code} code={results['oversized']['code']}")

        # 7c: No auth
        resp = await client.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", image_bytes, "image/png")},
            timeout=30,
        )
        body = resp.json()
        results["no_auth"] = {"status": resp.status_code, "code": body.get("error", {}).get("code")}
        print(f"  No auth:    {resp.status_code} code={results['no_auth']['code']}")

        # 7d: Invalid token
        resp = await client.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", image_bytes, "image/png")},
            headers={"Authorization": "Bearer invalid_token_12345"},
            timeout=30,
        )
        body = resp.json()
        results["invalid_token"] = {"status": resp.status_code, "code": body.get("error", {}).get("code")}
        print(f"  Bad token:  {resp.status_code} code={results['invalid_token']['code']}")

    return results


# ---------------------------------------------------------------------------
# Test 8: Regression
# ---------------------------------------------------------------------------

async def test_regression(token: str) -> dict:
    """Test all key endpoints."""
    print(f"\n=== REGRESSION TESTS ===")
    results = {}

    async with httpx.AsyncClient() as client:
        endpoints = [
            ("GET", "/health", None),
            ("POST", "/api/v1/auth/login", {"email": EMAIL, "password": PASSWORD}),
            ("GET", "/api/v1/users/me", None),
        ]

        for method, path, body in endpoints:
            kwargs = {"timeout": 15.0}
            if body:
                kwargs["json"] = body
                kwargs["headers"] = {"Content-Type": "application/json"}
            elif token:
                kwargs["headers"] = {"Authorization": f"Bearer {token}"}

            lat, status, err = await timed_request(client, method, f"{BASE}{path}", **kwargs)
            results[path] = {"status": status, "error": err, "latency": lat}
            ok = "OK" if status and 200 <= status < 400 else f"FAIL({status})"
            print(f"  {method} {path}: {ok} ({lat:.4f}s)")

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    print("=" * 70)
    print("PHASE 3 VALIDATION — OCR Concurrency + Event Loop Blocking")
    print("=" * 70)

    image_bytes = make_test_image_bytes()

    # Login
    async with httpx.AsyncClient() as client:
        token = await login(client)
    print(f"\nLogin OK, token prefix: {token[:20]}...")

    all_results = {}

    # Test 1: Baseline
    all_results["baseline"] = await test_baseline()

    # Test 2: OCR concurrency
    print(f"\n=== OCR CONCURRENCY TESTS ===")
    ocr_results = {}
    for c in [1, 5, 10, 25, 50]:
        stats = await test_ocr_concurrency(c, image_bytes, token)
        ocr_results[c] = stats
        def fmt(v): return f"{v:.4f}s" if v is not None else "N/A"
        print(f"  c={c:>2d}: p50={fmt(stats['p50'])}  p95={fmt(stats['p95'])}  p99={fmt(stats['p99'])}  ok={stats['success']}/{stats['total']}  err={stats['errors']}")
    all_results["ocr_concurrency"] = ocr_results

    # Test 3: Non-OCR during OCR load
    print(f"\n=== NON-OCR DURING OCR LOAD ===")
    health_during = {}
    for c in [5, 10, 25, 50]:
        health_during[c] = await test_health_during_ocr(c, image_bytes, token)
    all_results["health_during_ocr"] = health_during

    # Test 4: Event loop serialization
    print(f"\n=== EVENT LOOP TEST ===")
    event_loop_results = {}
    for c in [10, 25, 50]:
        event_loop_results[c] = await test_event_loop_serialization(c, image_bytes, token)
    all_results["event_loop"] = event_loop_results

    # Test 5: Connection pool
    all_results["connection_pool"] = await test_connection_pool(image_bytes, token)

    # Test 6: Memory
    print(f"\n=== MEMORY TESTS ===")
    memory_results = {}
    for c in [10, 25, 50]:
        memory_results[c] = await test_memory(c, image_bytes, token)
    all_results["memory"] = memory_results

    # Test 7: Error paths
    all_results["error_paths"] = await test_error_paths(token, image_bytes)

    # Test 8: Regression
    all_results["regression"] = await test_regression(token)

    # Save full results
    with open("D:\\Tracker\\load-test-results\\phase3_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)

    print(f"\n{'=' * 70}")
    print("All tests complete. Results saved to phase3_results.json")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    asyncio.run(main())
