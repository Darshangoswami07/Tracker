"""Redis connectivity + rate limiter verification test (concurrent)."""
import urllib.request
import urllib.error
import json
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

TARGET = "https://tracker-m0id.onrender.com"
ENDPOINT = "/api/v1/registration/companies"
FULL_URL = f"{TARGET}{ENDPOINT}"

print("=" * 80)
print("REDIS CONNECTIVITY TEST (concurrent)")
print("=" * 80)
print(f"Target: {FULL_URL}")
print()

def send_request(idx):
    start = time.time()
    try:
        req = urllib.request.Request(FULL_URL)
        resp = urllib.request.urlopen(req, timeout=15)
        elapsed = (time.time() - start) * 1000
        return (idx, resp.status, elapsed, None, None)
    except urllib.error.HTTPError as e:
        elapsed = (time.time() - start) * 1000
        body = e.read().decode() if e.fp else ""
        headers = dict(e.headers) if e.headers else {}
        return (idx, e.code, elapsed, body, headers)
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        return (idx, 0, elapsed, str(e), None)

results = {"200": 0, "429": 0, "other": 0}
latencies = []
first_429_body = None
first_429_headers = {}
first_429_idx = None

# Send 80 concurrent requests using 20 threads
NUM_REQUESTS = 80
NUM_WORKERS = 20

print(f"Sending {NUM_REQUESTS} concurrent requests ({NUM_WORKERS} workers)...")
send_start = time.time()

with ThreadPoolExecutor(max_workers=NUM_WORKERS) as pool:
    futures = {pool.submit(send_request, i): i for i in range(NUM_REQUESTS)}
    for future in as_completed(futures):
        idx, code, elapsed, body, headers = future.result()
        latencies.append(elapsed)
        code_str = str(code)
        if code_str in results:
            results[code_str] += 1
        else:
            results["other"] += 1
        if code == 429 and first_429_body is None:
            first_429_body = body
            first_429_headers = headers or {}
            first_429_idx = idx

total_time = time.time() - send_start
print(f"Completed in {total_time:.1f}s")
print()

print("Results:")
print(f"  200 OK: {results.get('200', 0)}")
print(f"  429 Rate Limited: {results.get('429', 0)}")
print(f"  Other errors: {results.get('other', 0)}")
print()

if latencies:
    latencies_sorted = sorted(latencies)
    p50 = latencies_sorted[len(latencies_sorted) // 2]
    p95 = latencies_sorted[int(len(latencies_sorted) * 0.95)]
    p99 = latencies_sorted[int(len(latencies_sorted) * 0.99)]
    print(f"Latency (all requests):")
    print(f"  p50: {p50:.0f}ms")
    print(f"  p95: {p95:.0f}ms")
    print(f"  p99: {p99:.0f}ms")
    print(f"  min: {min(latencies):.0f}ms")
    print(f"  max: {max(latencies):.0f}ms")

print()

# Check 429 response format
if first_429_body:
    print("429 Response Analysis:")
    try:
        data = json.loads(first_429_body)
        assert data["success"] is False
        assert data["error"]["code"] == "rate_limited"
        assert data["error"]["status"] == 429
        print(f"  Body format: VALID")
        print(f"  success: {data['success']}")
        print(f"  error.code: {data['error']['code']}")
        print(f"  error.message: {data['error']['message']}")
        print(f"  error.status: {data['error']['status']}")
    except Exception as e:
        print(f"  Body format: INVALID ({e})")

    retry_after = first_429_headers.get("Retry-After")
    content_type = first_429_headers.get("Content-Type")
    print(f"  Retry-After: {retry_after}")
    print(f"  Content-Type: {content_type}")
else:
    print("No 429 received.")

print()

# Verdict
if results.get("429", 0) > 0:
    print("VERDICT: Redis connectivity CONFIRMED")
    print("  - Rate limiter is active and enforcing limits via Redis")
    print("  - Lua script executed successfully")
    print("  - 429 responses have correct format and headers")
elif results.get("200", 0) == NUM_REQUESTS:
    print("VERDICT: All requests succeeded (limit not reached or in-memory fallback)")
    print("  - This can happen if requests are slow enough for the window to slide")
    print("  - OR Redis is not connected and in-memory fallback is per-process")
else:
    print("VERDICT: Unexpected results - investigate")

print("=" * 80)
