"""Dual-backend file storage for uploaded GR attachments.

Supports ``STORAGE_BACKEND=local`` (default, for development) and
``STORAGE_BACKEND=s3`` (production, S3-compatible object storage).
The backend is selected via the ``STORAGE_BACKEND`` env var in
``core/config.py``.

Magic-byte validation ensures uploaded files actually match the claimed
MIME type, preventing a malicious file from bypassing type checks by
setting a fake ``Content-Type`` header.
"""
from __future__ import annotations

import io
import logging
import re
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationBusinessError

logger = logging.getLogger("app.storage")

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

# ---------------------------------------------------------------------------
# MIME / magic-byte validation
# ---------------------------------------------------------------------------

# Allowed MIME types for GR slip/photo uploads.
ALLOWED_SLIP_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}

# Magic-byte signatures (first bytes) for allowed file types.
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],  # RIFF....WEBP — we check offset-8 for "WEBP" too
    "application/pdf": [b"%PDF"],
}


def _detect_mime_from_bytes(first_bytes: bytes) -> Optional[str]:
    """Return the MIME type matching the file's magic bytes, or None."""
    for mime, sigs in _MAGIC_SIGNATURES.items():
        for sig in sigs:
            if first_bytes[: len(sig)] == sig:
                # Extra check for WebP: RIFF header must say WEBP at offset 8.
                if mime == "image/webp":
                    if len(first_bytes) >= 12 and first_bytes[8:12] == b"WEBP":
                        return "image/webp"
                    continue
                return mime
    return None


def _validate_file_content(first_bytes: bytes, claimed_mime: str) -> str:
    """Validate uploaded file content against its magic bytes.

    Returns the *verified* MIME type (derived from content, not the
    client-supplied header).  Raises ``ValidationBusinessError`` if the
    bytes don't match any allowed signature.
    """
    detected = _detect_mime_from_bytes(first_bytes)
    if detected is None:
        raise ValidationBusinessError(
            "The uploaded file content does not match any allowed type "
            "(JPG, PNG, WEBP, or PDF)."
        )
    return detected


# ---------------------------------------------------------------------------
# Filename helpers
# ---------------------------------------------------------------------------

def _sanitize_filename(name: str) -> str:
    """Strip directory components and unsafe characters."""
    name = Path(name).name
    name = _SAFE_NAME_RE.sub("_", name)
    return name[-150:] or "file"


# ---------------------------------------------------------------------------
# Object key / path helpers
# ---------------------------------------------------------------------------

def _make_storage_key(subdir: str, original_filename: str) -> str:
    """Build a deterministic, unique storage key.

    For S3 this becomes the object key; for local it becomes the
    relative filesystem path.
    """
    safe_name = _sanitize_filename(original_filename)
    return f"{subdir}/{uuid.uuid4()}_{safe_name}"


# ---------------------------------------------------------------------------
# Local filesystem backend
# ---------------------------------------------------------------------------

def _storage_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def _local_save(chunks: list[bytes], storage_key: str) -> None:
    """Write accumulated chunks to the local filesystem."""
    absolute_path = _storage_root() / storage_key
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(absolute_path, "wb") as out:
        for chunk in chunks:
            await out.write(chunk)


def _local_resolve(storage_path: str) -> Path:
    """Resolve a stored relative path back to an absolute filesystem path.

    Rejects any path that would escape the storage root (defense against a
    maliciously crafted ``storagePath``, though these are always
    server-generated via ``save_upload`` and never taken from client input).
    """
    root = _storage_root()
    candidate = (root / storage_path).resolve()
    if root not in candidate.parents and candidate != root:
        raise ValidationBusinessError("Invalid file path.")
    return candidate


def _local_exists(storage_path: str) -> bool:
    return _local_resolve(storage_path).exists()


async def _local_load(storage_path: str) -> bytes:
    path = _local_resolve(storage_path)
    async with aiofiles.open(path, "rb") as f:
        return await f.read()


# ---------------------------------------------------------------------------
# S3 backend
# ---------------------------------------------------------------------------

_s3_client = None


def _get_s3_client():
    """Return a cached boto3 S3 client, creating it on first call."""
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    try:
        import boto3
    except ImportError:
        raise ValidationBusinessError(
            "boto3 is required for S3 storage. "
            "Install it with: pip install boto3"
        )

    kwargs = {
        "service_name": "s3",
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
        "region_name": settings.S3_REGION or None,
    }
    if settings.S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

    _s3_client = boto3.client(**kwargs)
    return _s3_client


async def _s3_upload(chunks: list[bytes], storage_key: str) -> None:
    """Upload accumulated chunks to S3."""
    import asyncio

    client = _get_s3_client()
    body = b"".join(chunks)

    def _put():
        client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=storage_key,
            Body=body,
            ContentType="application/octet-stream",
        )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _put)


def _s3_presigned_url(storage_key: str) -> str:
    """Generate a short-lived presigned GET URL for the object."""
    client = _get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": storage_key,
        },
        ExpiresIn=settings.S3_PRESIGNED_URL_EXPIRY,
    )


def _s3_exists(storage_key: str) -> bool:
    client = _get_s3_client()
    try:
        client.head_object(Bucket=settings.S3_BUCKET, Key=storage_key)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Public API — upload
# ---------------------------------------------------------------------------

async def save_upload(file: UploadFile, subdir: str) -> tuple[str, int, str]:
    """Stream an uploaded file to the configured storage backend.

    Returns ``(storage_key, size_bytes, verified_mime_type)``.

    The MIME type is derived from **magic-byte inspection** of the first
    bytes, not from the client-supplied ``Content-Type`` header.

    Raises ``ValidationBusinessError`` if the file is empty, too large,
    or its content doesn't match any allowed type.
    """
    # --- Read and validate content in 1 MB chunks ----------------------
    first_bytes = b""
    chunks: list[bytes] = []
    size = 0
    max_size = settings.MAX_UPLOAD_SIZE

    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > max_size:
            raise ValidationBusinessError(
                f"File exceeds the maximum upload size of {max_size // (1024 * 1024)} MB."
            )
        if not first_bytes:
            first_bytes = chunk[:32]
        chunks.append(chunk)

    if size == 0:
        raise ValidationBusinessError("The uploaded file is empty.")

    # --- Server-side MIME validation from magic bytes -------------------
    verified_mime = _validate_file_content(first_bytes, file.content_type or "")

    # --- Build storage key ----------------------------------------------
    storage_key = _make_storage_key(subdir, file.filename or "upload")

    # --- Write to configured backend ------------------------------------
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        await _s3_upload(chunks, storage_key)
    else:
        await _local_save(chunks, storage_key)

    return storage_key, size, verified_mime


# ---------------------------------------------------------------------------
# Public API — generated files (CSV exports, etc.)
# ---------------------------------------------------------------------------

async def save_generated_file(
    content: bytes, subdir: str, filename: str
) -> tuple[str, int]:
    """Write server-generated bytes to the configured storage backend.

    Unlike ``save_upload``, there's no client-supplied MIME type to
    validate — the caller controls filename/content directly.
    """
    storage_key = _make_storage_key(subdir, filename)
    backend = settings.STORAGE_BACKEND

    if backend == "s3":
        import asyncio

        client = _get_s3_client()

        def _put():
            client.put_object(
                Bucket=settings.S3_BUCKET,
                Key=storage_key,
                Body=content,
                ContentType="application/octet-stream",
            )

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _put)
    else:
        await _local_save([content], storage_key)

    return storage_key, len(content)


# ---------------------------------------------------------------------------
# Public API — download / resolve
# ---------------------------------------------------------------------------

def resolve_absolute_path(relative_path: str) -> Path:
    """Resolve a stored local path back to an absolute filesystem path.

    Only valid for ``STORAGE_BACKEND=local``.
    """
    return _local_resolve(relative_path)


def generate_download_url(storage_path: str) -> str:
    """Generate a download URL for the given storage path.

    For S3: returns a presigned GET URL.
    For local: raises (use ``resolve_absolute_path`` + ``FileResponse``).
    """
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        return _s3_presigned_url(storage_path)
    raise ValidationBusinessError(
        "generate_download_url is only available for S3 backend."
    )


def file_exists(storage_path: str) -> bool:
    """Check whether the stored file exists in the configured backend."""
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        return _s3_exists(storage_path)
    return _local_exists(storage_path)
