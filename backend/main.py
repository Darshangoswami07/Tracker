"""DeliveryHub API — application entrypoint."""
from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# psycopg (async) cannot run on Windows' ProactorEventLoop; use the selector loop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.database.db import close_database, init_database
from app.middlewares.rate_limit import RateLimitMiddleware, close_rate_limiter
from app.middlewares.security_headers import SecurityHeadersMiddleware
from app.services.ocr_service import close_ocr_client, init_ocr_client
from app.utils.responses import error


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Guard: on Windows, psycopg3 requires a SelectorEventLoop.
    if sys.platform == "win32":
        _loop = asyncio.get_running_loop()
        if _loop.__class__.__name__ == "ProactorEventLoop":
            logging.getLogger("app").error(
                "Detected ProactorEventLoop — psycopg3 cannot use it on Windows. "
                "Start the server with:  python run_server.py"
            )

    await init_database()
    await init_ocr_client()
    yield
    await close_ocr_client()
    await close_rate_limiter()
    await close_database()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Transport Management System — Authentication API.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    debug=settings.DEBUG,
)

# --- CORS -----------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Custom middlewares ---------------------------------------------------
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)


# --- Error handlers -------------------------------------------------------
@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content=error(exc.code, exc.message, exc.status_code, exc.details),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    details = []
    for err in exc.errors():
        details.append({"field": ".".join(str(part) for part in err["loc"]), "message": err["msg"]})
    return JSONResponse(
        status_code=422,
        content=error("validation_error", "Please review the highlighted fields and try again.", 422, {"fields": details}),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: Request, exc: StarletteHTTPException):
    friendly = {
        404: ("not_found", "The page or resource you requested could not be found."),
        405: ("method_not_allowed", "This action is not supported. Please try again."),
        429: ("rate_limited", "Too many requests. Please slow down and try again in a moment."),
    }.get(exc.status_code)
    if friendly:
        code, message = friendly
    else:
        code, message = f"http_{exc.status_code}", "Something went wrong. Please try again in a few moments."
    return JSONResponse(status_code=exc.status_code, content=error(code, message, exc.status_code))


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception):
    logging.getLogger("app").exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error("internal_error", "Something went wrong. Please try again in a few moments.", 500),
    )


# --- Routes ----------------------------------------------------------------
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["meta"], include_in_schema=False)
async def health() -> PlainTextResponse:
    return PlainTextResponse("ok")