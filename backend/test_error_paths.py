"""Error path tests only — run after rate limit cooldown."""
import asyncio
import io
import httpx
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8099"


def make_img():
    img = Image.new("RGB", (600, 400), color="white")
    ImageDraw.Draw(img).text((50, 30), "G.R. NO: TEST-001", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def main():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/api/v1/auth/login",
                         json={"email": "abhiyanshbisht@gmail.com", "password": "12345678"})
        token = r.json()["data"]["tokens"]["accessToken"]
        img = make_img()

        # Empty file
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("empty.png", b"", "image/png")},
            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        msg = body.get("error", {}).get("message", "")
        print(f"Empty file: {r.status_code} code={code} msg={msg}")

        # Oversized
        big = b"\x00" * (11 * 1024 * 1024)
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("big.png", big, "image/png")},
            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        msg = body.get("error", {}).get("message", "")
        print(f"Oversized:  {r.status_code} code={code} msg={msg}")

        # No auth
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", img, "image/png")},
            timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        msg = body.get("error", {}).get("message", "")
        print(f"No auth:    {r.status_code} code={code} msg={msg}")

        # Bad token
        r = await c.post(
            f"{BASE}/api/v1/admin/orders/ocr-extract",
            files={"file": ("slip.png", img, "image/png")},
            headers={"Authorization": "Bearer badtoken123"}, timeout=30)
        body = r.json()
        code = body.get("error", {}).get("code", "N/A")
        msg = body.get("error", {}).get("message", "")
        print(f"Bad token:  {r.status_code} code={code} msg={msg}")


if __name__ == "__main__":
    asyncio.run(main())
