"""Phase 4 — targeted health-during-login test (the critical test)."""
import asyncio
import statistics
import time
from dataclasses import dataclass, field

import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


@dataclass
class TimingResult:
    latencies: list[float] = field(default_factory=list)
    errors: int = 0
    def stats(self):
        if not self.latencies:
            return {"success": 0, "errors": self.errors, "p50": None, "p95": None, "p99": None}
        s = sorted(self.latencies)
        n = len(s)
        return {
            "success": n, "errors": self.errors,
            "p50": s[int(n*0.50)],
            "p95": s[min(int(n*0.95), n-1)],
            "p99": s[min(int(n*0.99), n-1)],
        }


async def timed(c, method, url, **kw):
    t0 = time.perf_counter()
    try:
        r = await c.request(method, url, **kw)
        return time.perf_counter()-t0, r.status_code, None
    except Exception as e:
        return time.perf_counter()-t0, None, type(e).__name__


async def test_health_during_login(login_count: int, health_count: int = 50) -> dict:
    health = TimingResult()
    async with httpx.AsyncClient() as c:
        login_tasks = [
            timed(c, "POST", f"{BASE}/api/v1/auth/login",
                  json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            for _ in range(login_count)
        ]

        async def hammer():
            for _ in range(health_count):
                lat, st, err = await timed(c, "GET", f"{BASE}/health", timeout=10)
                if err:
                    health.errors += 1
                elif st and st >= 400:
                    health.errors += 1
                else:
                    health.latencies.append(lat)

        hammer_task = asyncio.create_task(hammer())
        login_results = await asyncio.gather(*login_tasks)
        await hammer_task

    login_ok = sum(1 for _, s, _ in login_results if s == 200)
    hs = health.stats()
    fmt = lambda v: f"{v*1000:.1f}ms" if v is not None else "N/A"
    print(f"  {login_count} login + {health_count} health: health p50={fmt(hs['p50'])}  p95={fmt(hs['p95'])}  p99={fmt(hs['p99'])}  ok={hs['success']}/{health_count}  login_ok={login_ok}/{login_count}")
    return {"health": hs, "login_ok": login_ok, "login_total": login_count}


async def main():
    print("=" * 70)
    print("PHASE 4 — HEALTH DURING LOGIN LOAD (CRITICAL TEST)")
    print("=" * 70)

    # Quick sanity check
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/health", timeout=5)
        print(f"Health check: {r.status_code}")

    print(f"\nRunning tests (rate limit: 60/min per path)...")
    print(f"Waiting 5s between tests to avoid rate limiting...\n")

    results = {}
    for c in [5, 10, 25, 50]:
        results[c] = await test_health_during_login(c, health_count=50)
        await asyncio.sleep(5)

    print(f"\n{'='*70}")
    print("SUMMARY:")
    for c, r in results.items():
        h = r["health"]
        fmt = lambda v: f"{v*1000:.1f}ms" if v is not None else "N/A"
        print(f"  c={c:>2d}: health p50={fmt(h['p50'])}  p95={fmt(h['p95'])}  p99={fmt(h['p99'])}  login_ok={r['login_ok']}/{r['login_total']}")
    print(f"{'='*70}")


if __name__ == "__main__":
    asyncio.run(main())
