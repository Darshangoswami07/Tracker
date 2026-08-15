"""OCR extraction for GR transport slips using a remote vision model.

The mobile app reads/writes business GR data exclusively through the local
SQLite repository, but slip *extraction* is a transient, stateless helper
call: the image bytes are sent to a vision model over HTTPS and the returned
JSON is POSTed back to the device, where it is used to pre-fill the Create GR
form and then saved locally (the extracted text is not persisted server-side).
OCR therefore requires internet, but everything downstream stays local.
"""
from __future__ import annotations

import base64
import json
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import OCRServiceError, OCRServiceUnavailableError

# Model used for vision extraction. Configurable so deployments can pin a
# specific tier without a code change. "response_mime_type": "application/json"
# requires a model that supports JSON mode (Gemini 1.5/2.x flash+ all do).
DEFAULT_MODEL = "gemini-2.0-flash"

# The extracted payload deliberately mirrors the mobile Create GR form
# (AdminCreateGRScreen) so the client can pre-fill without remapping.
SLIP_EXTRACTION_PROMPT = """You are an OCR engine specialized in Indian transport
GR (Goods Receipt) slips. Extract the fields below from the document image and
return ONLY a single JSON object. Use exactly these keys. Omit (do not include)
any key whose value is not present or legible on the slip. Keep original casing
where available. For dates return ISO 8601 (YYYY-MM-DD) when a date is legible,
otherwise omit.

Keys:
- grNumber (string): the GR / L.R. / consignment number
- transportCompany (string): transport company / lorry owner name
- gstin (string): GSTIN printed on the slip
- grDate (string, YYYY-MM-DD): GR date
- consignorName (string): sender / consignor name
- consigneeName (string): receiver / consignee name
- fromAddress (string): pickup / from city and address
- toAddress (string): delivery / to city and address
- particulars (string): description of goods / parcels
- packageCount (number): number of packages / bundles / bags
- weight (number): total weight in kg
- rate (number): rate per kg or per package if printed
- freight (number): freight amount (Rs.)
- labour (number): labour / hamali charge (Rs.)
- pf (number): P.F. / forwarding charge (Rs.)
- doorDelivery (number): door delivery charge (Rs.)
- taxGst (number): GST amount (Rs.)
- netAmount (number): net / total payable amount (Rs.)
- specialService (string): any special instructions / service notes
- proprietor (string): proprietor / owner name of the transport company
- phone (string): phone number(s) printed on the slip

Do not invent values. Return valid JSON only."""


def _build_payload(image_bytes: bytes, mime_type: str) -> dict[str, Any]:
    return {
        "contents": [
            {
                "parts": [
                    {"text": SLIP_EXTRACTION_PROMPT},
                    {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode("ascii")}},
                ]
            }
        ],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }


async def extract_slip_fields(image_bytes: bytes, mime_type: str) -> dict[str, Any]:
    """Sends the slip image to the configured vision model and returns the
    extracted field dictionary. Raises ``OCRServiceUnavailableError`` when no
    API key is configured and ``OCRServiceError`` for model/provider failures."""
    api_key = settings.GOOGLE_API_KEY.strip()
    if not api_key:
        raise OCRServiceUnavailableError()

    model = (settings.GOOGLE_GEMINI_MODEL or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {"x-goog-api-key": api_key}

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, json=_build_payload(image_bytes, mime_type), headers=headers)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise OCRServiceError("The OCR service could not be reached. Please try again.") from exc

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise OCRServiceError("The OCR service returned an unreadable result. Please try again.") from exc