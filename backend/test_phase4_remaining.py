"""Phase 4 remaining tests — error paths, regression, security after cooldown."""
import asyncio
import time
import httpx

BASE = "http://127.0.0.1:8099"
EMAIL = "abhiyanshbisht@gmail.com"
PASSWORD = "12345678"


async def main():
    async with httpx.AsyncClient() as c:
        # ---- ERROR PATHS ----
        print("=== ERROR PATH TESTS ===")
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        print(f"  Valid password:   {r.status_code} (expect 200)")

        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": "wrongpassword"}, timeout=15)
        print(f"  Invalid password: {r.status_code} (expect 401)")

        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": "noexist@test.com", "password": "x"}, timeout=15)
        print(f"  Nonexistent:      {r.status_code} (expect 401)")

        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": "", "password": ""}, timeout=15)
        print(f"  Empty body:       {r.status_code} (expect 422)")

        # ---- JWT VALIDATION ----
        print("\n=== JWT VALIDATION ===")
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        data = r.json()
        token = data["data"]["tokens"]["accessToken"]
        refresh = data["data"]["tokens"]["refreshToken"]

        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
        print(f"  JWT valid /users/me:  {r.status_code} (expect 200)")

        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": "Bearer invalidtoken123"}, timeout=10)
        print(f"  JWT invalid:          {r.status_code} (expect 401)")

        # ---- REFRESH TOKEN ----
        print("\n=== REFRESH TOKEN ===")
        r = await c.post(f"{BASE}/api/v1/auth/refresh",
                         json={"refreshToken": refresh}, timeout=15)
        print(f"  Refresh valid:        {r.status_code} (expect 200)")
        new_token = r.json()["data"]["tokens"]["accessToken"]

        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": f"Bearer {new_token}"}, timeout=10)
        print(f"  New token /users/me:  {r.status_code} (expect 200)")

        # ---- REGRESSION ----
        print("\n=== REGRESSION TESTS ===")
        t0 = time.perf_counter()
        r = await c.get(f"{BASE}/health", timeout=10)
        print(f"  GET  /health:            {r.status_code} ({(time.perf_counter()-t0)*1000:.1f}ms)")

        t0 = time.perf_counter()
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        print(f"  POST /auth/login:        {r.status_code} ({(time.perf_counter()-t0)*1000:.1f}ms)")

        t0 = time.perf_counter()
        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
        print(f"  GET  /users/me:          {r.status_code} ({(time.perf_counter()-t0)*1000:.1f}ms)")

        t0 = time.perf_counter()
        r = await c.get(f"{BASE}/api/v1/admin/orders",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
        print(f"  GET  /admin/orders:      {r.status_code} ({(time.perf_counter()-t0)*1000:.1f}ms)")

        # ---- RBAC CHECK ----
        print("\n=== RBAC CHECK ===")
        r = await c.get(f"{BASE}/api/v1/users/me",
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
        role = r.json()["data"]["role"]
        print(f"  User role: {role} (expect admin)")

    print("\nALL REMAINING TESTS COMPLETE")


if __name__ == "__main__":
    asyncio.run(main())
