"""Tolerant field extraction from raw OCR text of an Indian transport GR slip.

OCR.Space returns plain text, not structured fields, so this module maps
that text onto the fixed schema the mobile Create GR form expects
(`SlipExtractedFields` in `mobile/src/services/slipOcr.ts`). Transport slips
vary in layout/labels, so every field is matched with a tolerant regex
(multiple label spellings, optional punctuation/spacing) rather than an
exact template. A field is left ``None`` whenever it can't be confidently
read — values are never invented.
"""
from __future__ import annotations

import re
from typing import Any

# Keys mirror the mobile `SlipExtractedFields` / `AdminCreateGRScreen` form
# exactly, so the client can pre-fill without remapping.
FIELDS = [
    "grNumber",
    "grDate",
    "consignorName",
    "consigneeName",
    "fromAddress",
    "toAddress",
    "particulars",
    "packageCount",
    "weight",
    "transportCompany",
    "gstin",
    "rate",
    "freight",
    "labour",
    "pf",
    "doorDelivery",
    "taxGst",
    "netAmount",
    "specialService",
    "proprietor",
    "phone",
]

_NUMERIC_FIELDS = {"packageCount", "weight", "rate", "freight", "labour", "pf", "doorDelivery", "taxGst", "netAmount"}

# Each pattern is matched line-by-line (case-insensitive), against the text
# that follows the label on the same line. The first matching line wins.
_LABEL_PATTERNS: dict[str, str] = {
    # Requires at least one digit in the captured token so a bare label match
    # (e.g. a "GR Charge" table header with no colon) can't capture a plain
    # word as the GR number.
    "grNumber": r"G\.?\s*R\.?\s*(?:NO|NUMBER)?\.?\s*[:\-]?\s*(?!DATE)([A-Z0-9\-\/]*\d[A-Z0-9\-\/]*)",
    "grDate": (
        r"(?:G\.?\s*R\.?\s*)?DATE\s*[:\-]?\s*"
        r"(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\-\/\s][A-Za-z]{3,9}[\-\/\s]\d{2,4})"
    ),
    # "Consigner"/"Consignee" (with an -er) are common misspellings on
    # printed Indian transport slips - matched alongside the correct forms.
    "consignorName": r"(?:CONSIGNOR|CONSIGNER|SENDER)(?:\s*NAME)?\s*[:\-]\s*(.+)",
    "consigneeName": r"(?:CONSIGNEE|RECEIVER)(?:\s*NAME)?\s*[:\-]\s*(.+)",
    "fromAddress": r"^FROM\s*[:\-]\s*(.+)",
    "toAddress": r"^TO\s*[:\-]\s*(.+)",
    "particulars": r"PARTICULARS?\s*[:\-]\s*(.+)",
    "packageCount": r"(?:NO\.?\s*OF\s*)?(?:PACKAGES?|PKGS?|BUNDLES?|BAGS?)\s*[:\-]?\s*(\d+)",
    "weight": r"WEIGHT\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:KGS?)?",
    "gstin": r"GSTIN\s*[:\-]?\s*([0-9A-Z]{15})",
    "rate": r"RATE\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "freight": r"FREIGHT\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "labour": r"(?:LABOUR|LABOR|HAMALI)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "pf": r"P\.?\s*F\.?\s*(?:CHARGE)?\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "doorDelivery": r"DOOR\s*DELIVERY\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "taxGst": r"(?:TAX\s*\/?\s*GST|GST\s*AMOUNT|TAX\s*AMOUNT)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "netAmount": r"NET\s*(?:AMOUNT|TOTAL)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "specialService": r"SPECIAL\s*SERVICE\s*[:\-]\s*(.+)",
    "proprietor": r"PROPRIETOR\s*[:\-]\s*(.+)",
    "phone": r"(?:PHONE|MOB(?:ILE)?|CONTACT)\.?\s*(?:NO\.?)?\s*[:\-]?\s*([+0-9][\d\-\s]{7,15}\d)",
    "transportCompany": r"(?:TRANSPORT\s*(?:CO\.?|COMPANY)?)\s*[:\-]\s*(.+)",
}

_COMPILED = {key: re.compile(pattern, re.IGNORECASE) for key, pattern in _LABEL_PATTERNS.items()}


def _clean_string(value: str) -> str | None:
    value = re.sub(r"\s+", " ", value).strip(" :-\t")
    return value or None


def _clean_number(value: str) -> float | int | None:
    value = value.replace(",", "").strip()
    if not value:
        return None
    try:
        as_float = float(value)
    except ValueError:
        return None
    return int(as_float) if as_float.is_integer() else as_float


_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _normalize_date(raw: str) -> str | None:
    """Best-effort normalization of a matched date string to ISO 8601
    (YYYY-MM-DD), matching what the mobile Create GR form expects
    (`parseOcrDate` in `AdminCreateGRScreen.tsx`). Returns the cleaned raw
    string unchanged if it can't be confidently normalized (still useful to
    a human reviewing the field, just not auto-mapped into the date input)."""
    raw = raw.strip()

    iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", raw)
    if iso:
        return raw

    # DD-Mon-YY(YY), e.g. "05-Aug-26" or "05 Aug 2026".
    month_name = re.match(r"^(\d{1,2})[\-\/\s]([A-Za-z]{3,9})[\-\/\s](\d{2,4})$", raw)
    if month_name:
        day, month_str, year = month_name.groups()
        month = _MONTHS.get(month_str[:3].lower())
        if month:
            year_num = int(year)
            if year_num < 100:
                year_num += 2000
            return f"{year_num:04d}-{month:02d}-{int(day):02d}"
        return raw

    # DD/MM/YYYY or DD-MM-YY etc.
    numeric = re.match(r"^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$", raw)
    if numeric:
        day, month, year = numeric.groups()
        year_num = int(year)
        if year_num < 100:
            year_num += 2000
        try:
            return f"{year_num:04d}-{int(month):02d}-{int(day):02d}"
        except ValueError:
            return raw

    return raw


def parse_slip_text(text: str) -> dict[str, Any]:
    """Extracts the GR field schema from raw OCR text. Every key in `FIELDS`
    is always present in the result; unmatched fields are `None`."""
    result: dict[str, Any] = {key: None for key in FIELDS}
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n") if line.strip()]

    for key, pattern in _COMPILED.items():
        for line in lines:
            match = pattern.search(line)
            if not match:
                continue
            raw = match.group(1)
            if key in _NUMERIC_FIELDS:
                cleaned = _clean_number(raw)
            elif key == "grDate":
                cleaned = _normalize_date(raw)
            else:
                cleaned = _clean_string(raw)
            if cleaned is not None:
                result[key] = cleaned
                break

    # OCR'd table-based slips frequently print a label on its own line with
    # the value in the next cell/line down (e.g. "G.R. No" then "006404" on
    # the following line, or "From" then the city on the line after) rather
    # than "Label: value" on one line, which the patterns above can't catch.
    # Only used for fields still unmatched, and only takes a next-line value
    # that looks like plausible content (not another label).
    _LABEL_ONLY_FALLBACKS: dict[str, re.Pattern[str]] = {
        "grNumber": re.compile(r"^(?:TRANS\s*)?G\.?\s*R\.?\s*(?:NO\.?|NUMBER)?\.?\s*[:\-]?\s*$", re.IGNORECASE),
        "fromAddress": re.compile(r"^FROM\s*[:\-]?\s*$", re.IGNORECASE),
        "toAddress": re.compile(r"^TO\s*[:\-]?\s*$", re.IGNORECASE),
        "proprietor": re.compile(r"^PROPRIETOR\s*[:\-]?\s*$", re.IGNORECASE),
    }
    for key, label_pattern in _LABEL_ONLY_FALLBACKS.items():
        if result[key] is not None:
            continue
        for idx, line in enumerate(lines[:-1]):
            if not label_pattern.match(line):
                continue
            candidate = lines[idx + 1]
            if key == "grNumber":
                if re.fullmatch(r"[A-Z0-9\-\/]*\d[A-Z0-9\-\/]*", candidate, re.IGNORECASE):
                    result[key] = _clean_string(candidate)
                    break
            else:
                # Skip if the "value" line is itself obviously another label
                # (all-caps, no digits, very short - e.g. "TO" printed twice).
                looks_like_label = candidate.isupper() and len(candidate) <= 3
                if not looks_like_label:
                    cleaned = _clean_string(candidate)
                    if cleaned:
                        result[key] = cleaned
                        break

    # Transport slips commonly print the company name as an unlabelled
    # heading (e.g. "ABC TRANSPORT COMPANY") rather than "Transport Co: ABC",
    # so the labelled regex above often finds nothing. Fall back to the
    # first heading-like line that contains "TRANSPORT" but isn't itself
    # some other labelled field (GSTIN/phone/etc. lines can mention it too).
    if result["transportCompany"] is None:
        for line in lines[:6]:
            if re.search(r"TRANSPORT", line, re.IGNORECASE) and not re.search(r"[:\-]\s*\S", line):
                cleaned = _clean_string(line)
                if cleaned:
                    result["transportCompany"] = cleaned
                    break

    return result
