# Phase 8 — S3-Compatible Object Storage + Magic-Byte Validation

**Date:** 2026-08-21
**Status:** IMPLEMENTED — Local-backend tests passed (13/13)

---

## Summary

Phase 8 adds **dual-backend file storage** (local filesystem + S3-compatible
object storage) and **server-side magic-byte MIME validation** to replace the
previous client-reported-only approach.

## Changes Made

### 1. `app/services/storage_service.py` — Full Rewrite

**Before:** Simple local-only save/resolve with no MIME validation.

**After:**
- **Dual backend:** `STORAGE_BACKEND=local` (dev) / `STORAGE_BACKEND=s3` (prod)
- **Magic-byte validation:** Inspects first 32 bytes to verify file content
  matches allowed types (JPEG, PNG, WEBP, PDF). Rejects disguised files
  (e.g., `.exe` renamed to `.jpg`).
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- **S3 support:** boto3 client with configurable endpoint (MinIO, R2, Spaces)
- **Presigned URLs:** 5-minute expiry for S3 downloads
- **`file_exists()`:** Backend-agnostic file existence check
- **`generate_download_url()`:** Returns presigned URL (S3) or raises (local)

### 2. `app/core/config.py` — New Settings

```
S3_ENDPOINT_URL: str = ""         # Custom endpoint for non-AWS providers
S3_PRESIGNED_URL_EXPIRY: int = 300 # 5-minute presigned URL lifetime
```

### 3. `app/api/v1/gr.py` — Admin Attachment Endpoints

- **Upload:** Unchanged (already used `save_upload()`)
- **Download:** Now checks `file_exists()` first, returns presigned redirect
  for S3, or `FileResponse` for local

### 4. `app/api/v1/dashboards.py` — Shared Attachment Endpoints

- Same changes as gr.py: presigned URL for S3, FileResponse for local
- Added `settings` import at module level

### 5. `requirements.txt` — New Dependency

```
boto3==1.40.0
```

### 6. `.env.example` — S3 Configuration

```env
STORAGE_BACKEND=local
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT_URL=
S3_PRESIGNED_URL_EXPIRY=300
```

## Test Results (Local Backend)

| # | Test | Result |
|---|------|--------|
| 1 | Admin login | PASS |
| 2 | Get order list | PASS |
| 3 | Upload JPEG (magic: FF D8 FF) | PASS — mime=image/jpeg |
| 4 | Download JPEG (content matches) | PASS |
| 5 | Upload PNG (magic: 89 50 4E 47 0D 0A 1A 0A) | PASS — mime=image/png |
| 6 | Upload PDF (magic: 25 50 44 46) | PASS — mime=application/pdf |
| 7 | Upload WEBP (magic: RIFF...WEBP) | PASS — mime=image/webp |
| 8 | Reject MZ header as image/jpeg | PASS — 422 |
| 9 | Reject HTML as application/pdf | PASS — 422 |
| 10 | Reject empty file | PASS — 422 |
| 11 | Reject GIF (not in allowlist) | PASS — 422 |
| 12 | Dashboard upload endpoint | PASS |
| 13 | Dashboard download endpoint | PASS — 200, content verified |

## Security Improvements

| Issue (Phase 7) | Fix (Phase 8) |
|-----------------|---------------|
| MIME type from client header only | Magic-byte inspection of first 32 bytes |
| Local storage unsafe for multi-instance | S3 backend for production |
| Render ephemeral disk wipes files | S3 persistent storage |
| No file type validation server-side | Allowlist + magic-byte enforcement |

## Files Modified

| File | Change |
|------|--------|
| `app/services/storage_service.py` | Full rewrite (dual backend + validation) |
| `app/core/config.py` | +2 settings (S3_ENDPOINT_URL, presigned expiry) |
| `app/api/v1/gr.py` | Download: presigned URL for S3 |
| `app/api/v1/dashboards.py` | Download: presigned URL for S3, +settings import |
| `requirements.txt` | +boto3==1.40.0 |
| `.env.example` | +6 S3 config variables |

## NOT Done (Requires Production S3 Bucket)

- S3 bucket provisioning and IAM policy setup
- S3 test bucket validation (13 test scenarios)
- Multi-instance simulation test
- Render environment variable configuration

These require actual S3 credentials and a real bucket, which is a deployment
step, not a code change.

## Constraints Honored

- Mobile SQLite: not modified
- Mobile image storage: not modified
- Next.js: not modified
- Redis: not modified
- Celery: not modified
- Authentication: not changed
- RBAC: not changed
- Tenancy: not changed
- Docker/K8s: not added
- Existing DB records: not deleted
- Existing attachments: not deleted
- Tables: not dropped/truncated
- No commits/pushes made
