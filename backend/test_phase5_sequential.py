"""Re-run only the extended sequential test after rate limiter cooldown."""
import asyncio
import time
import httpx

BASE = "http://127.0.0.1:8099"

async def main():
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/api/v1/auth/login",
            json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
        token = r.json()["data"]["tokens"]["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        print("Waiting 65s for rate limiter to reset...")
        await asyncio.sleep(65)

        print("Running 10 sequential dashboard requests...")
        lats = []
        ok = 0
        for i in range(10):
            t0 = time.perf_counter()
            r = await client.get(f"{BASE}/api/v1/admin/dashboard/stats", headers=headers, timeout=30)
            lat = (time.perf_counter() - t0) * 1000
            status = r.status_code
            if status == 200:
                ok += 1
                lats.append(lat)
            print(f"  [{i+1}] status={status} latency={lat:.1f}ms")
            await asyncio.sleep(0.5)

        if lats:
            s = sorted(lats)
            n = len(s)
            print(f"\nResults: {ok}/10 ok")
            print(f"  p50={s[n//2]:.1f}ms  p95={s[min(int(n*0.95), n-1)]:.1f}ms  "
                  f"min={s[0]:.1f}ms  max={s[-1]:.1f}ms  avg={sum(s)/n:.1f}ms")
        else:
            print(f"\nResults: 0/10 ok (all failed)")

asyncio.run(main())
