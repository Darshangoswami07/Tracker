"""Security response headers applied to every response."""
from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

# Interactive documentation pages (Swagger UI / ReDoc) load their bundled
# CSS/JS from the jsDelivr CDN and run an inline bootstrap script, and fetch the
# spec from the same origin. A `default-src 'none'` policy blocks all of that,
# which renders the docs as a blank page, so those paths get a scoped policy
# that permits exactly the resources they need. Every other response keeps the
# maximally restrictive policy.
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

STRICT_CSP = b"default-src 'none'; frame-ancestors 'none'"
DOCS_CSP = (
    b"default-src 'none'; "
    b"base-uri 'none'; "
    b"frame-ancestors 'none'; "
    b"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    b"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    b"img-src 'self' data: https://cdn.jsdelivr.net; "
    b"font-src 'self' data: https://cdn.jsdelivr.net; "
    b"connect-src 'self' https://cdn.jsdelivr.net"
)

HARDENING_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"x-xss-protection", b"1; mode=block"),
    (b"referrer-policy", b"no-referrer"),
    (b"content-security-policy", STRICT_CSP),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
]


class SecurityHeadersMiddleware:
    """Adds standard security headers to all HTTP responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        is_doc_path = path.startswith(DOC_PATHS)

        async def send_with_headers(message) -> None:
            if message["type"] == "http.response.start":
                headers = [(key, value) for key, value in message.get("headers", []) if key != b"server"]
                hardening = [
                    (
                        (b"content-security-policy", DOCS_CSP)
                        if key == b"content-security-policy" and is_doc_path
                        else (key, value)
                    )
                    for key, value in HARDENING_HEADERS
                ]
                headers.extend(hardening)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)