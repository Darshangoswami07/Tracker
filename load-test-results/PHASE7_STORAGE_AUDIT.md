# Phase 7: Backend File Storage Audit — Horizontal Scaling Readiness

**Date**: 2026-08-21  
**Status**: AUDIT ONLY — No code changes  
**Scope**: Server-side uploaded files only (mobile local storage untouched)

---

## A. Current Backend Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UPLOAD FLOW                               │
│                                                              │
│  Client ──UploadFile──▶ FastAPI ──save_upload()──▶ Local FS  │
│                                                              │
│  uploads/                                                    │
│  ├── orders/{order_id}/{uuid}_{sanitized_name}              │
│                                                              │
│  DB: order_attachments.storagePath = "orders/{id}/{uuid}_…" │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    DOWNLOAD FLOW                             │
│                                                              │
│  Client ──GET /file──▶ FastAPI ──resolve_absolute_path()──▶  │
│                       ──FileResponse(absolute_path)──▶       │
└─────────────────────────────────────────────────────────────┘
```

### Key Implementation Details

| Aspect | Value | Location |
|--------|-------|----------|
| Storage root | `uploads/` (relative to CWD) | `app/core/config.py:38` |
| Backend selector | `STORAGE_BACKEND=local` (enum exists for S3, unused) | `app/core/config.py:37` |
| Max upload size | 10 MB | `app/core/config.py:42` |
| Allowed MIME types | `*` (config setting), but `storage_service.py` hardcodes JPEG/PNG/WEBP/PDF | `app/core/config.py:44`, `app/services/storage_service.py:23-29` |
| Filename sanitization | `Path(name).name` + regex strip non-`[A-Za-z0-9._-]` | `app/services/storage_service.py:38-41` |
| Path traversal defense | `resolve_absolute_path()` verifies candidate is under root | `app/services/storage_service.py:95-106` |
| Upload streaming | 1 MB chunks via `aiofiles` — **NOT** loaded entirely into memory | `app/services/storage_service.py:64-73` |
| S3 credentials | Scaffolded (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) but all empty strings | `app/core/config.py:46-49` |
| `.gitignore` | `uploads/` excluded from git | `.gitignore:25` |

---

## B. File-Type Inventory

| File Type | Upload Endpoint | Storage Location | DB Model | Must Persist? | Shared Across Instances? | Needs Public Access? |
|-----------|----------------|-----------------|----------|---------------|------------------------|--------------------|
| **Order slip/photo** (GR attachments) | `POST /api/v1/admin/orders/{id}/attachments` | `uploads/orders/{order_id}/{uuid}_{name}` | `order_attachments.storagePath` | **YES** — audit trail, never overwritten | **YES** — multiple instances | **NO** — authenticated-only `FileResponse` |
| **Order slip/photo** (shared dashboard) | `POST /api/v1/orders/{id}/attachments` | Same as above | Same table | **YES** | **YES** | **NO** |
| **OCR input file** | `POST /api/v1/admin/orders/ocr-extract` | **NONE** — read into memory, processed, discarded | **NONE** | **NO** — transient | N/A | N/A |
| **Report CSV** (Report model) | **UNUSED** — model + repository exist, no endpoints call `save_generated_file()` | Would be `uploads/reports/{uuid}_{name}` | `reports.storagePath` | DEAD CODE | DEAD CODE | DEAD CODE |

### What does NOT exist (contrary to FileKind enum suggestions)

The `FileKind` enum defines: `PROFILE`, `COMPANY_LOGO`, `VEHICLE_IMAGE`, `DRIVER_DOCUMENT`, `PROOF_OF_DELIVERY`, `QR`, `BARCODE`, `GENERIC`.  
**None of these have upload endpoints except `GENERIC` (used for GR slip/photo uploads).**  
- No profile image upload  
- No company logo upload  
- No vehicle image upload  
- No driver document upload  
- No QR code generation/storage  

The only files actually uploaded to the backend are **GR order attachments** (slips and photos).

---

## C. Multi-Instance Risks

### Scenario 1: Upload on Instance 1, Download on Instance 2

```
Upload:  Client → LB → FastAPI#1 → uploads/orders/abc/file.jpg  ✅ (written)
Download: Client → LB → FastAPI#2 → resolve_absolute_path("orders/abc/file.jpg")
                                      → uploads/orders/abc/file.jpg  ❌ FILE NOT FOUND
```

**Result: 404 — "Stored file is missing."**  
This is a **hard failure** for the primary use case.

### Scenario 2: Two Instances Simultaneously Serving the Same Order

- Instance 1 serves `GET /admin/orders/abc` → returns attachment URL pointing to Instance 2's load-balanced URL
- Client requests file from Instance 2 → file doesn't exist there
- **Result: Intermittent 404s depending on which instance served the upload vs the download request**

### Scenario 3: Instance Restart / Redeploy

Render free tier (current deployment): ephemeral filesystem. Each deploy wipes `uploads/`.  
**All uploaded GR slips would be permanently lost on every deployment.**

### Scenario 4: Autoscaling / Horizontal Scaling

Any new instance starts with an empty `uploads/`. Only files uploaded during that instance's lifetime are available.  
**Graceful degradation is impossible — the DB references valid files that no longer exist.**

---

## D. Persistence Risks

| Risk | Severity | Details |
|------|----------|---------|
| **Render free tier ephemeral disk** | **CRITICAL** | `uploads/` is wiped on every deploy. Files are permanently lost. |
| **Multi-instance file access** | **CRITICAL** | No shared filesystem. Files written by one instance are invisible to others. |
| **DB references orphaned** | **HIGH** | `order_attachments.storagePath` points to a file that may not exist. Download endpoint returns 404 gracefully, but attachment metadata remains in DB forever. |
| **No cleanup of orphaned files** | **MEDIUM** | Soft-deleted orders (`deletedAt`) still have files on disk. No garbage collection. |
| **No file integrity checks** | **LOW** | No checksum stored. File could be corrupted without detection. |
| **Report model dead code** | **LOW** | `reports` table + `ReportRepository` exist but no endpoints generate or download reports. `save_generated_file()` is never called. |

---

## E. Security Findings

### ✅ Good

| Check | Status | Evidence |
|-------|--------|----------|
| **Path traversal** | **DEFENDED** | `_sanitize_filename()` strips directory components. `resolve_absolute_path()` verifies resolved path stays under root. |
| **Filename sanitization** | **GOOD** | Non-alphanumeric chars replaced with `_`. Truncated to 150 chars. |
| **Extension validation** | **GOOD** | MIME type check in `save_upload()` rejects non-JPEG/PNG/WEBP/PDF. |
| **Max upload size** | **GOOD** | 10 MB limit enforced. Check happens **during** streaming (not after buffering). |
| **Download auth** | **GOOD** | Both download endpoints require authenticated user (`GRAccessUser` / `CurrentUser`). |
| **Company/tenant isolation** | **GOOD** | Upload/download both verify `assert_same_company` / `_assert_order_access`. |
| **User ownership** | **GOOD** | Customers cannot upload (explicit `ForbiddenError`). Admin/Staff/Driver access controlled. |
| **UUID-based naming** | **GOOD** | Uploaded files get `{uuid}_{sanitized_name}` — not predictable. |
| **No static file serving** | **GOOD** | No `StaticFiles` mount. All file access goes through authenticated endpoints. |

### ⚠️ Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| **MIME type from client** | **MEDIUM** | `file.content_type` is client-supplied. A malicious client could upload a `.html`/`.js` file claiming `image/jpeg`. The `FileResponse` serves with the stored `mimeType`, so a browser could render uploaded HTML/JS (XSS). |
| **No file-type double-check** | **MEDIUM** | Server doesn't verify magic bytes (e.g., `filetype` library). Relies entirely on client-reported MIME type. |
| **Download filename header** | **LOW** | `FileResponse(filename=...)` sets `Content-Disposition`. Original filename is stored unsanitized (sanitization only applies to the stored filename, not `originalFilename`). |
| **No rate limiting on downloads** | **LOW** | File download endpoints have no explicit rate limit. General rate limiter applies, but bulk downloads aren't throttled specifically. |
| **No file cleanup on attachment deletion** | **LOW** | Soft-deleting an order doesn't delete the files from disk. Files accumulate indefinitely. |

---

## F. Upload Memory Findings

### Current Implementation (GOOD)

```python
# storage_service.py:64-73
async with aiofiles.open(absolute_path, "wb") as out:
    while chunk := await file.read(1024 * 1024):  # 1 MB chunks
        size += len(chunk)
        if size > max_size:
            # cleanup + reject
        await out.write(chunk)
```

**Streaming write with 1 MB chunks.** The full file is never loaded into memory.

### Memory Pressure Analysis

| Scenario | Memory per Request | Total Memory | Safe? |
|----------|-------------------|--------------|-------|
| 10 concurrent 10MB uploads | ~1 MB buffer each | ~10 MB | ✅ |
| 25 concurrent 10MB uploads | ~1 MB buffer each | ~25 MB | ✅ |
| 50 concurrent 10MB uploads | ~1 MB buffer each | ~50 MB | ✅ |

**Uploads are memory-safe.** The 1 MB chunk buffer is bounded per request.

### OCR Endpoint — Different Pattern

```python
# gr.py:235
data = await file.read()  # FULL FILE INTO MEMORY
```

The OCR endpoint (`POST /admin/orders/ocr-extract`) reads the **entire file into memory** before processing. This is bounded by `MAX_UPLOAD_SIZE` (10 MB), but is a different pattern than the streaming upload.

**OCR memory impact**: Each concurrent OCR request holds up to 10 MB in memory. At 50 concurrent OCR requests, that's 500 MB. The thread executor for Pillow processing also holds the full image bytes.

---

## G. OCR Temporary-File Findings

### How OCR Works

1. Client uploads slip → `POST /admin/orders/ocr-extract`
2. `file.read()` — full bytes in memory
3. `_prepare_upload()` — if image > 1 MB, Pillow optimizes to ≤ 1 MB (in-memory `io.BytesIO`)
4. `_call_ocr_space()` — optimized bytes sent to OCR.Space API
5. Response parsed → JSON returned to client
6. **Nothing stored on disk. Nothing stored in DB.**

### Temporary File Assessment

| Aspect | Finding |
|--------|---------|
| Stored on disk? | **NO** — entirely in-memory |
| Stored in DB? | **NO** — stateless, no persistence |
| Deleted after use? | **YES** — garbage collected when request completes |
| Cleanup guaranteed? | **YES** — Python GC + `io.BytesIO` buffer |
| Multi-instance concern? | **NO** — stateless per-request |

**OCR is safe for horizontal scaling.** No files are persisted.

---

## H. Download/Serving Findings

### Current Implementation

```python
# gr.py:419-423
return FileResponse(
    path=absolute_path,       # resolved from storagePath
    media_type=attachment.mimeType,
    filename=attachment.originalFilename,
)
```

**FastAPI/Starlette streams the file** via `FileResponse`. The file is served from disk, not loaded entirely into memory (Starlette uses `send_file` internally with chunked streaming).

### Download Assessment

| Aspect | Finding |
|--------|---------|
| Streaming? | **YES** — Starlette `FileResponse` streams from disk |
| Memory-safe? | **YES** — no full-file buffering |
| Bottleneck risk? | **LOW** for local disk. Starlette is efficient for file serving. |
| Multi-instance? | **BROKEN** — file must exist on the instance serving the request |

---

## I. Object-Storage Decision

### Analysis

| File Category | Volume | Lifetime | Sharing Need | Recommendation |
|---------------|--------|----------|-------------|----------------|
| **GR attachments** (slips/photos) | Low-medium (1 per GR, maybe 2-3 with replacements) | Permanent (audit trail) | **YES** — multiple instances | **Object storage required** |
| **OCR input** | None (in-memory only) | Transient | No | **No change needed** |
| **Reports** (dead code) | None | N/A | N/A | **Remove or implement later** |

### Decision

```
Backend persistent shared files need object storage: YES
```

**Evidence**:
1. GR attachments are the **only** persistent files
2. They are critical business data (proof of delivery, transport slips)
3. They must survive deploys (Render ephemeral disk doesn't)
4. They must be accessible from multiple instances
5. The `STORAGE_BACKEND=s3` enum and config are already scaffolded — no abstraction needed

### What NOT to move to object storage

- Mobile local files — **unchanged** (per constraint)
- Mobile SQLite — **unchanged** (per constraint)
- OCR input files — **in-memory only, no storage needed**

---

## J. Recommended Storage Architecture

```
Temporary files (OCR)     → in-memory only (current behavior, correct)
Persistent files (GR)     → S3-compatible object storage
Database                  → metadata + object key (storagePath becomes S3 key)
Mobile files              → unchanged local storage
```

### Why NOT local filesystem

| Criterion | Local FS | Object Storage |
|-----------|----------|----------------|
| Multi-instance | **FAILS** | Works |
| Survives deploy (Render) | **FAILS** | Works |
| Survives instance restart | **FAILS** | Works |
| Scales horizontally | **FAILS** | Works |
| Platform independent | Works | Works (S3 API is standard) |

### Why NOT "shared NFS" as alternative

NFS/efs is provider-specific (AWS EFS, Render shared volumes). S3 is:
- Cheaper (pay-per-use vs provisioned throughput)
- More portable (works on Render, Railway, AWS, DigitalOcean, Hetzner)
- Already scaffolded in the codebase (`S3_BUCKET`, `S3_REGION`, etc.)

---

## K. Recommended Storage Architecture (Visual)

```
                    ┌─────────────────────────┐
                    │      FastAPI #1          │
                    │   save_upload()          │
                    │        │                 │
                    │        ▼                 │
                    │  S3 PUT object           │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │   S3-compatible bucket   │
                    │   (Uploads for GR slips) │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │      FastAPI #2          │
                    │  GET /file               │
                    │        │                 │
                    │        ▼                 │
                    │  S3 GET presigned URL    │
                    │  or S3 stream            │
                    └─────────────────────────┘

Database: order_attachments.storagePath = "gr-attachments/{order_id}/{uuid}_{name}"
```

---

## L. Single Next Implementation Phase

**Recommended Phase 8: S3-backed persistent file storage**

Scope:
1. Implement S3 upload/download in `storage_service.py` behind `STORAGE_BACKEND` flag
2. Change `storagePath` semantics: local path → S3 object key
3. Add `boto3` dependency (lightweight S3 client)
4. Add S3 presigned-URL generation for downloads (avoids proxying file bytes through FastAPI)
5. Add S3 env vars to `.env.example` (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`)
6. Migrate existing local files to S3 (if any exist in production)
7. Keep `STORAGE_BACKEND=local` as fallback for development

**Do NOT**:
- Modify mobile storage
- Modify Next.js
- Modify Redis
- Modify Celery
- Remove local storage fallback
- Change DB schema (storagePath column stays String(500), just stores S3 key instead of local path)

---

## M. Safety Confirmation

```
Database schema changed:              NO
Database data changed:                NO
Users modified:                       NO
Admin users modified:                 NO
Super-admin users modified:           NO
Mobile SQLite changed:                NO
Mobile images changed:                NO
Next.js changed:                      NO
Redis changed:                        NO
Celery changed:                       NO
OCR changed:                          NO
Rate limiter changed:                 NO
Real emails sent:                     NO
Commit created:                       NO
Push performed:                       NO
Destructive operations:               NONE
```

---

## Summary

| Category | Finding |
|----------|---------|
| **Only persistent files** | GR order attachments (slips/photos) |
| **Current storage** | Local filesystem (`uploads/`) |
| **Multi-instance safe?** | **NO** — files written by one instance are invisible to others |
| **Deploy-safe?** | **NO** — Render ephemeral disk wipes files on every deploy |
| **Memory-safe?** | **YES** — streaming 1 MB chunks |
| **Security** | Good overall, but MIME type not double-checked server-side |
| **OCR files** | In-memory only, no persistence needed |
| **Dead code** | `Report` model + `save_generated_file()` exist but are unused |
| **Object storage needed?** | **YES** — for GR attachments only |
| **Platform independence** | S3 API is portable across all target platforms |
