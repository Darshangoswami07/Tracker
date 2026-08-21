"""Phase 5 final benchmark — compare before/after optimization."""
import asyncio
import statistics
import time
import httpx

BASE = "http://127.0.0.1:8099"

async def get_token(client):
    r = await client.post(f"{BASE}/api/v1/auth/login",
                          json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
    return r.json()["data"]["tokens"]["accessToken"]

async def timed_get(client, url, headers, timeout=30):
    t0 = time.perf_counter()
    try:
        r = await client.get(url, headers=headers, timeout=timeout)
        return time.perf_counter() - t0, r.status_code, None
    except Exception as e:
        return time.perf_counter() - t0, None, str(e)

async def bench_one(client, token, concurrency):
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE}/api/v1/admin/dashboard/stats"
    tasks = [timed_get(client, url, headers, timeout=30) for _ in range(concurrency)]
    results = await asyncio.gather(*tasks)
    lats = sorted([t * 1000 for t, s, _ in results if s == 200])
    errs = sum(1 for _, s, _ in results if s != 200)
    if not lats:
        return {"c": concurrency, "ok": 0, "err": errs, "p50": None, "p95": None, "p99": None}
    n = len(lats)
    return {
        "c": concurrency, "ok": n, "err": errs,
        "p50": lats[int(n * 0.50)],
        "p95": lats[min(int(n * 0.95), n - 1)],
        "p99": lats[min(int(n * 0.99), n - 1)],
        "avg": statistics.mean(lats),
    }

async def main():
    print("=" * 70)
    print("PHASE 5 POST-OPTIMIZATION BENCHMARK (7 queries vs 14)")
    print("=" * 70)

    async with httpx.AsyncClient() as client:
        token = await get_token(client)

        # Warm up
        headers = {"Authorization": f"Bearer {token}"}
        await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
        await asyncio.sleep(2)

        for c in [1, 5, 10, 25, 50]:
            print(f"  c={c}...", end="", flush=True)
            r = await bench_one(client, token, c)
            print(f" p50={r['p50']:.1f}ms  p95={r['p95']:.1f}ms  p99={r['p99']:.1f}ms  ok={r['ok']}/{c}  err={r['err']}")
            await asyncio.sleep(5)

        print(f"\n{'='*70}")
        print("COMPARISON (before optimization → after optimization):")
        print("=" * 70)
        before = {
            1:  {"p50": 2155.6, "p95": 2155.6, "p99": 2155.6},
            5:  {"p50": 2088.1, "p95": 3025.6, "p99": 3025.6},
            10: {"p50": 1730.8, "p95": 2075.4, "p99": 2075.4},
            25: {"p50": 2285.6, "p95": 3538.8, "p99": 4085.5},
            50: {"p50": 2046.1, "p95": 4312.2, "p99": 4312.2},
        }
        for c in [1, 5, 10, 25, 50]:
            b = before[c]
            # Only print if we have data
            print(f"  c={c:>2d}: before p50={b['p50']:.0f}ms → after (see above)")

if __name__ == "__main__":
    asyncio.run(main())
