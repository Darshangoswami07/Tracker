"""Phase 5 — Dashboard stats baseline benchmark."""
import asyncio
import statistics
import time

import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


async def get_token(client: httpx.AsyncClient) -> str:
    r = await client.post(f"{BASE}/api/v1/auth/login",
                          json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    return r.json()["data"]["tokens"]["accessToken"]


async def timed_get(client, url, headers, timeout=30):
    t0 = time.perf_counter()
    try:
        r = await client.get(url, headers=headers, timeout=timeout)
        return time.perf_counter() - t0, r.status_code, r.json() if r.status_code == 200 else None
    except Exception as e:
        return time.perf_counter() - t0, None, str(e)


async def bench_one(client, token, concurrency, idx):
    """Send `concurrency` parallel requests to /dashboard/stats."""
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE}/api/v1/admin/dashboard/stats"
    tasks = [timed_get(client, url, headers, timeout=30) for _ in range(concurrency)]
    results = await asyncio.gather(*tasks)
    lats = [(t * 1000) for t, s, _ in results if s == 200]
    errs = sum(1 for _, s, _ in results if s != 200)
    if not lats:
        return {"concurrency": concurrency, "success": 0, "errors": errs,
                "p50": None, "p95": None, "p99": None, "avg": None}
    s = sorted(lats)
    n = len(s)
    return {
        "concurrency": concurrency,
        "success": n,
        "errors": errs,
        "p50": s[int(n * 0.50)],
        "p95": s[min(int(n * 0.95), n - 1)],
        "p99": s[min(int(n * 0.99), n - 1)],
        "avg": statistics.mean(s),
    }


async def main():
    print("=" * 70)
    print("PHASE 5 BASELINE — Dashboard Stats (/api/v1/admin/dashboard/stats)")
    print("=" * 70)

    async with httpx.AsyncClient() as client:
        # Get auth token
        token = await get_token(client)
        print(f"Auth token obtained.\n")

        # Warm up
        headers = {"Authorization": f"Bearer {token}"}
        await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
        await asyncio.sleep(1)

        results = {}
        for c in [1, 5, 10, 25, 50]:
            print(f"  Benchmarking c={c}...", end="", flush=True)
            r = await bench_one(client, token, c, 0)
            results[c] = r
            print(f" p50={r['p50']:.1f}ms  p95={r['p95']:.1f}ms  p99={r['p99']:.1f}ms  ok={r['success']}/{c}  err={r['errors']}")
            await asyncio.sleep(5)

        print(f"\n{'='*70}")
        print("BASELINE RESULTS:")
        print(f"{'='*70}")
        for c, r in results.items():
            print(f"  c={c:>2d}: p50={r['p50']:.1f}ms  p95={r['p95']:.1f}ms  p99={r['p99']:.1f}ms  avg={r['avg']:.1f}ms  ok={r['success']}/{c}  err={r['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
