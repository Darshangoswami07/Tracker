"""Phase 3 remaining tests: connection pool, memory, error paths, regression."""
import asyncio
import io
import json
import statistics
import time
import tracemalloc

import httpx
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


def make_img():
    img = Image.new("RGB", (600, 400), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((50, 30), "G.R. NO: TEST-001", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def login(c):
    r = await c.post(f"{BASE}/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    return r.json()["data"]["tokens"]["accessToken"]


async def timed(c, method, url, **kw):
    t0 = time.perf_counter()
    try:
        r = await c.request(method, url, **kw)
        return time.perf_counter() - t0, r.status_code, None
    except Exception as e:
        return time.perf_counter() - t0, None, str(type(e).__name__)


async def main():
    img = make_img()

    # ========== CONNECTION POOL TEST ==========
    print("=== CONNECTION POOL TEST (10 OCR, pool=5) ===")
    async with httpx.AsyncClient() as c:
        token = await login(c)
        t0 = time.perf_counter()
        tasks = [
            timed(c, "POST", f"{BASE}/api/v1/admin/orders/ocr-extract",
                  files={"file": (f"pool{i}.png", img, "image/png")},
                  headers={"Authorization": f"Bearer {token}"}, timeout=120)
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks)
        wall = time.perf_counter() - t0
        success = sum(1 for lat, st, _ in results if st == 200)
        lats = sorted([lat for lat, st, _ in results if st == 200])
        print(f"  Wall time: {wall:.2f}s")
        print(f"  Success: {success}/10")
        if lats:
            print(f"  p50={lats[len(lats)//2]:.4f}s  p95={lats[int(len(lats)*0.95)]:.4f}s  p99={lats[int(len(lats)*0.99)]:.4f}s")
        for i, (lat, st, info) in enumerate(results):
            if st != 200:
                print(f"  ERROR req{i}: status={st}")
    print()

    # ========== MEMORY TESTS ==========
    print("=== MEMORY TESTS ===")
    async with httpx.AsyncClient() as c:
        token = await login(c)
        for nocr in [10, 25, 50]:
            tracemalloc.start()
            baseline = tracemalloc.get_traced_memory()
            tasks = [
                timed(c, "POST", f"{BASE}/api/v1/admin/orders/ocr-extract",
                      files={"file": (f"mem{i}.png", img, "image/png")},
                      headers={"Authorization": f"Bearer {token}"}, timeout=120)
                for i in range(nocr)
            ]
            results = await asyncio.gather(*tasks)
            peak = tracemalloc.get_traced_memory()
            await asyncio.sleep(2)
            after = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            success = sum(1 for _, st, _ in results if st == 200)
            print(f"  {nocr} OCR ({success} ok): baseline={baseline[0]/1024:.0f}KB  peak={peak[0]/1024:.0f}KB  after={after[0]/1024:.0f}KB  peak_delta={(peak[0]-baseline[0])/1024:.0f}KB  recovery={(after[0]-baseline[0])/1024:.0f}KB")
    print()

    # ========== ERROR PATH TESTS ==========
    print("=== ERROR PATH TESTS ===")
    async with httpx.AsyncClient() as c:
        token = await login(c)

        # Empty file
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("empty.png", b"", "image/png")},
            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        print(f"  Empty file: {r.status_code} code={code}")

        # Oversized
        big = b"\x00" * (11 * 1024 * 1024)
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("big.png", big, "image/png")},
            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        print(f"  Oversized:  {r.status_code} code={code}")

        # No auth
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", img, "image/png")},
            timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        print(f"  No auth:    {r.status_code} code={code}")

        # Bad token
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", img, "image/png")},
            headers={"Authorization": "Bearer badtoken123"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        print(f"  Bad token:  {r.status_code} code={code}")
    print()

    # ========== REGRESSION TESTS ==========
    print("=== REGRESSION TESTS ===")
    async with httpx.AsyncClient() as c:
        token = await login(c)

        lat, st, _ = await timed(c, "GET", f"{BASE}/health", timeout=15)
        print(f"  GET  /health:              {'PASS' if st == 200 else 'FAIL(' + str(st) + ')'} ({lat:.4f}s)")

        lat, st, _ = await timed(c, "POST", f"{BASE}/api/v1/auth/login",
                                  json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        print(f"  POST /api/v1/auth/login:   {'PASS' if st == 200 else 'FAIL(' + str(st) + ')'} ({lat:.4f}s)")

        lat, st, _ = await timed(c, "GET", f"{BASE}/api/v1/users/me",
                                  headers={"Authorization": f"Bearer {token}"}, timeout=15)
        print(f"  GET  /api/v1/users/me:     {'PASS' if st == 200 else 'FAIL(' + str(st) + ')'} ({lat:.4f}s)")

        lat, st, _ = await timed(c, "GET", f"{BASE}/api/v1/admin/orders",
                                  headers={"Authorization": f"Bearer {token}"}, timeout=15)
        print(f"  GET  /api/v1/admin/orders: {'PASS' if st == 200 else 'FAIL(' + str(st) + ')'} ({lat:.4f}s)")

    print()
    print("ALL REMAINING TESTS COMPLETE")


if __name__ == "__main__":
    asyncio.run(main())
