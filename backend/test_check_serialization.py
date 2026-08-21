"""Check the serialization of latestPendingApprovals fields."""
import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as c:
        r = await c.post("http://127.0.0.1:8099/api/v1/auth/login",
            json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"}, timeout=15)
        token = r.json()["data"]["tokens"]["accessToken"]
        r = await c.get("http://127.0.0.1:8099/api/v1/admin/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        approvals = r.json()["data"]["latestPendingApprovals"]
        for a in approvals:
            print(f"requestedRole={a['requestedRole']!r}  status={a['status']!r}  type={type(a['requestedRole']).__name__}")

asyncio.run(main())
