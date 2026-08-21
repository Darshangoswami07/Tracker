"""Phase 4 — Login latency measurement."""
import asyncio
import statistics
import time
import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


async def main():
    print("=== LOGIN LATENCY MEASUREMENT ===\n")

    for c in [1, 5, 10, 25, 50]:
        async with httpx.AsyncClient() as client:
            t0 = time.perf_counter()
            tasks = []
            for _ in range(c):
                tasks.append(client.post(f"{BASE}/api/v1/auth/login",
                    json={"email": EMAIL, "password": PASSWORD}, timeout=30))
            responses = await asyncio.gather(*tasks)
            wall = time.perf_counter() - t0

            statuses = [r.status_code for r in responses]
            ok = statuses.count(200)
            err401 = statuses.count(401)
            err429 = statuses.count(429)
            latencies = []
            for r in responses:
                if r.status_code == 200:
                    # Approximate: we can't get per-request latency from httpx response alone
                    pass

        print(f"  c={c:>2d}: wall={wall:.3f}s  200={ok}  401={err401}  429={err429}")
        await asyncio.sleep(3)

    # Single-request latency detail
    print("\n--- Single request latency breakdown ---")
    for _ in range(5):
        async with httpx.AsyncClient() as c:
            t0 = time.perf_counter()
            r = await c.post(f"{BASE}/api/v1/auth/login",
                json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            lat = time.perf_counter() - t0
            print(f"  single: {lat*1000:.1f}ms  status={r.status_code}")
        await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
