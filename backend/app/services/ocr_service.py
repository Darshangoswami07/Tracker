"""OCR extraction for GR transport slips using the OCR.Space API.

The mobile app reads/writes business GR data exclusively through the local
SQLite repository, but slip *extraction* is a transient, stateless helper
call: the (optimized) image/PDF bytes are sent to OCR.Space over HTTPS, the
raw text is parsed into the GR field schema, and the result is POSTed back
to the device, where it pre-fills the Create GR form and is saved locally
(nothing is persisted server-side). OCR therefore requires internet, but
everything downstream stays local.

The user's *original* file is never modified here — the caller (the
`/admin/orders/ocr-extract` route) only ever hands this module the raw bytes
it received; any resizing/compression happens on a throwaway in-memory copy
built for this one request.
"""
from __future__ import annotations

import asyncio
import io
import logging
from typing import Optional

import httpx
from PIL import Image, ImageOps

from app.core.config import settings
from app.core.exceptions import OCRServiceError, OCRServiceUnavailableError
from app.services.slip_parser import parse_slip_text, reconstruct_table_fields

logger = logging.getLogger("app.ocr")

# OCR.Space's free-tier API rejects uploads over 1 MB, so anything larger is
# optimized down to (approximately) this size before being sent. This is
# independent of the application's own upload limit (`MAX_UPLOAD_SIZE`,
# currently 10 MB) which governs what the user is allowed to *select*.
OCR_SPACE_UPLOAD_LIMIT_BYTES = 1024 * 1024

_MIN_JPEG_QUALITY = 35
_MIN_MAX_DIMENSION = 800

# ---------------------------------------------------------------------------
# Shared async HTTP client — one connection pool for the lifetime of the app.
# ---------------------------------------------------------------------------

_client: Optional[httpx.AsyncClient] = None


async def init_ocr_client() -> None:
    """Create the shared AsyncClient. Call once at startup."""
    global _client
    if _client is not None:
        return
    _client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=10,
            read=settings.OCR_TIMEOUT_SECONDS,
            write=10,
            pool=10,
        ),
        limits=httpx.Limits(
            max_connections=settings.OCR_MAX_CONNECTIONS,
            max_keepalive_connections=settings.OCR_MAX_KEEPALIVE_CONNECTIONS,
            keepalive_expiry=30,
        ),
    )
    logger.info(
        "[OCR] AsyncClient initialised (pool=%d, keepalive=%d, timeout=%ds)",
        settings.OCR_MAX_CONNECTIONS,
        settings.OCR_MAX_KEEPALIVE_CONNECTIONS,
        settings.OCR_TIMEOUT_SECONDS,
    )


async def close_ocr_client() -> None:
    """Shut down the shared AsyncClient. Call once at shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("[OCR] AsyncClient closed")


def _get_client() -> httpx.AsyncClient:
    if _client is None:
        raise OCRServiceError("OCR client is not initialised.")
    return _client


# ---------------------------------------------------------------------------
# Image preprocessing — CPU-bound Pillow work run in a thread executor.
# ---------------------------------------------------------------------------


def _optimize_image_for_ocr_sync(image_bytes: bytes) -> bytes:
    """Synchronous Pillow preprocessing — must NOT run on the event loop."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
    except Exception as exc:  # noqa: BLE001 - Pillow raises various decode errors
        raise OCRServiceError("The slip image could not be read. Please upload a clearer image.") from exc

    quality = 85
    max_dimension = 2200

    while True:
        width, height = image.size
        if max(width, height) > max_dimension:
            ratio = max_dimension / max(width, height)
            image = image.resize((max(1, int(width * ratio)), max(1, int(height * ratio))), Image.LANCZOS)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        data = buffer.getvalue()

        if len(data) <= OCR_SPACE_UPLOAD_LIMIT_BYTES:
            return data
        if quality > _MIN_JPEG_QUALITY:
            quality -= 15
        elif max_dimension > _MIN_MAX_DIMENSION:
            max_dimension = int(max_dimension * 0.75)
        else:
            # Already at the floor quality/size - ship the smallest we can get.
            return data


async def _optimize_image_for_ocr(image_bytes: bytes) -> bytes:
    """Runs the synchronous Pillow work on the default thread executor so
    the event loop stays responsive to other requests."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _optimize_image_for_ocr_sync, image_bytes)


# ---------------------------------------------------------------------------
# Upload preparation (thin async wrapper over sync helpers).
# ---------------------------------------------------------------------------


def _is_pdf(mime_type: str, filename: str) -> bool:
    return mime_type == "application/pdf" or filename.lower().endswith(".pdf")


async def _prepare_upload(file_bytes: bytes, mime_type: str, filename: str) -> tuple[bytes, str, str]:
    """Builds the (bytes, upload_filename, upload_mime_type) triple actually
    sent to OCR.Space, optimizing images that exceed the provider's free-tier
    limit. PDFs are forwarded as-is (no page-stripping library is wired up),
    or rejected with a clear message when too large."""
    if _is_pdf(mime_type, filename):
        if len(file_bytes) > OCR_SPACE_UPLOAD_LIMIT_BYTES:
            raise OCRServiceError(
                "This PDF is too large for automatic extraction. Please upload a clearer image of the slip."
            )
        return file_bytes, filename or "slip.pdf", "application/pdf"

    if len(file_bytes) <= OCR_SPACE_UPLOAD_LIMIT_BYTES:
        upload_bytes = file_bytes
    else:
        upload_bytes = await _optimize_image_for_ocr(file_bytes)
    return upload_bytes, "slip.jpg", "image/jpeg"


# ---------------------------------------------------------------------------
# OCR.Space HTTP call via the shared client.
# ---------------------------------------------------------------------------


async def _call_ocr_space(upload_bytes: bytes, upload_filename: str, upload_mime_type: str) -> tuple[str, list[dict]]:
    api_key = settings.OCR_SPACE_API_KEY.strip()
    if not api_key:
        raise OCRServiceUnavailableError()

    url = settings.OCR_SPACE_API_URL.strip() or "https://api.ocr.space/parse/image"
    data = {
        "apikey": api_key,
        "language": "eng",
        # Word-position overlay is required to reconstruct table columns
        # (see `slip_parser.reconstruct_table_fields`) — OCR.Space's plain
        # text output loses column alignment entirely for multi-column
        # tables (e.g. "Nug | Particulars | Weight | Rate"), printing all
        # column headers first and all values afterwards with no reliable
        # line-based correspondence between them.
        "isOverlayRequired": "true",
        "OCREngine": "2",
        "scale": "true",
        "detectOrientation": "true",
    }
    files = {"file": (upload_filename, upload_bytes, upload_mime_type)}

    client = _get_client()
    logger.info("[OCR] OCR.Space request started")
    try:
        response = await client.post(url, data=data, files=files)
    except httpx.TimeoutException as exc:
        logger.warning("[OCR] OCR.Space request timed out")
        raise OCRServiceError("The OCR service took too long to respond. Please try again.") from exc
    except httpx.HTTPError as exc:
        logger.warning("[OCR] OCR.Space request failed: network error")
        raise OCRServiceError("The OCR service could not be reached. Please try again.") from exc

    logger.info("[OCR] OCR.Space response received status=%s", response.status_code)

    if response.status_code == 403:
        raise OCRServiceUnavailableError()
    if response.status_code == 429:
        logger.warning("[OCR] OCR.Space request failed status=429")
        raise OCRServiceError("Automatic extraction is temporarily unavailable. Please try again later.")
    if response.status_code == 400:
        raise OCRServiceError("The slip could not be processed. Please upload a clearer image.")
    if response.status_code >= 500:
        logger.warning("[OCR] OCR.Space request failed status=%s", response.status_code)
        raise OCRServiceError("The OCR service is temporarily unavailable. Please try again later.")
    if response.status_code != 200:
        logger.warning("[OCR] OCR.Space request failed status=%s", response.status_code)
        raise OCRServiceError("Couldn't extract the slip. Try a clearer image.")

    try:
        payload = response.json()
    except ValueError as exc:
        raise OCRServiceError("The OCR service returned an unreadable result. Please try again.") from exc

    if payload.get("IsErroredOnProcessing"):
        raw_message = payload.get("ErrorMessage") or "Unknown OCR error"
        message = raw_message[0] if isinstance(raw_message, list) and raw_message else str(raw_message)
        logger.warning("[OCR] OCR.Space processing error: %s", message)
        if "rate" in message.lower() or "limit" in message.lower():
            raise OCRServiceError("Automatic extraction is temporarily unavailable. Please try again later.")
        raise OCRServiceError("The slip is difficult to read. Please upload a clearer image.")

    results = payload.get("ParsedResults") or []
    text = "\n".join(r.get("ParsedText", "") for r in results if r.get("ParsedText"))
    if not text.strip():
        raise OCRServiceError("The slip is difficult to read. Please upload a clearer image.")

    overlay_lines: list[dict] = []
    for r in results:
        overlay_lines.extend((r.get("TextOverlay") or {}).get("Lines") or [])

    logger.info("[OCR] extraction completed")
    return text, overlay_lines


# ---------------------------------------------------------------------------
# Public entry point.
# ---------------------------------------------------------------------------


async def extract_slip_fields(file_bytes: bytes, mime_type: str, filename: str = "slip") -> dict:
    """Sends the slip (image or PDF) to OCR.Space and returns the extracted
    GR field dictionary. Fields are parsed primarily from the raw OCR text
    (`parse_slip_text`); any field a multi-column table left unmatched
    (position-based line text can't tell which value belongs under which
    header) is then filled in, where possible, from the word-position
    overlay via `reconstruct_table_fields` — never overriding a value the
    text parser already found. Raises `OCRServiceUnavailableError` when no
    API key is configured and `OCRServiceError` for provider/parsing
    failures."""
    if not settings.OCR_SPACE_API_KEY.strip():
        raise OCRServiceUnavailableError()

    upload_bytes, upload_filename, upload_mime_type = await _prepare_upload(file_bytes, mime_type, filename)
    text, overlay_lines = await _call_ocr_space(upload_bytes, upload_filename, upload_mime_type)
    result = parse_slip_text(text)

    if overlay_lines:
        table_fields = reconstruct_table_fields(overlay_lines)
        for key, value in table_fields.items():
            if result.get(key) is None:
                result[key] = value

    return result
