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
    "deliveryAt",
    "particulars",
    "packageCount",
    "packageType",
    "weight",
    "transportCompany",
    "transportPhone",
    "gstin",
    "ewbNumber",
    "billType",
    "rate",
    "goodsValue",
    "grCharge",
    "freight",
    "labour",
    "pf",
    "doorDelivery",
    "taxGst",
    "netAmount",
    "toPay",
    "specialService",
    "proprietor",
    "proprietorPhone",
    "phone",
]

_NUMERIC_FIELDS = {
    "packageCount", "weight", "rate", "goodsValue", "grCharge",
    "freight", "labour", "pf", "doorDelivery", "taxGst", "netAmount", "toPay",
}

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
    "deliveryAt": r"^DELIVERY\s*AT\s*[:\-]\s*(.+)",
    "particulars": r"PARTICULARS?\s*[:\-]\s*(.+)",
    "packageCount": r"(?:NO\.?\s*OF\s*)?(?:PACKAGES?|PKGS?|BUNDLES?|BAGS?|NUGS?|QTY|QUANTITY|PCS|BOXES?|CARTONS?)\s*[:\-]?\s*(\d+)",
    "weight": r"WEIGHT\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:KGS?)?",
    "gstin": r"GSTIN\s*[:\-]?\s*([0-9A-Z]{15})",
    "ewbNumber": r"EWB\.?\s*NO\.?\s*\(?S?\)?\s*[:\-]?\s*([A-Z0-9\-]+)",
    "billType": r"(?:BILTI|BILL|BITTI)\s*TYPE\s*[:\-]?\s*([A-Za-z][A-Za-z ]*)",
    "rate": r"RATE\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "goodsValue": r"VALUE\s*OF\s*GOODS\s*(?:RS\.?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "grCharge": r"GR\s*CHARGE\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "freight": r"FREIGHT\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "labour": r"(?:LABOUR|LABOR|HAMALI)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "pf": r"P\.?\s*F\.?\s*(?:CHARGE)?\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "doorDelivery": r"DOOR\s*(?:DELIVERY|DEL\.?)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "taxGst": r"(?:TAX\s*\(?\/?\s*GST\)?|GST\s*AMOUNT|TAX\s*AMOUNT)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "netAmount": r"NET\s*(?:AMOUNT|TOTAL)\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "toPay": r"TO\s*PAY\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    "specialService": r"SPECIAL\s*SERVICE\s*[:\-]\s*(.+)",
    "proprietor": r"PROPRIETOR\s*[:\-]\s*(.+)",
    "phone": r"(?:PHONE|MOB(?:ILE)?|CONTACT)\.?\s*(?:NO\.?)?\s*[:\-]?\s*([+0-9][\d\-\s]{7,15}\d)",
    "transportCompany": r"(?:TRANSPORT\s*(?:CO\.?|COMPANY)?)\s*[:\-]\s*(.+)",
    # The transport company's own contact number, printed in the letterhead
    # block (e.g. "Ph No - Tp Nagar :9458993020, 7351732030"). Requires the
    # mandatory "NO" after "PH" specifically so this never matches the
    # consignee's own "Delivery At ... Ph : <number>" line, which only ever
    # says "Ph :" with no "No" - that number belongs to the consignee's
    # delivery contact, not the transport company.
    "transportPhone": r"PH\.?\s*NO\.?\b[^0-9]{0,25}([0-9][\d\-\s]{7,14}[0-9])",
}

_COMPILED = {key: re.compile(pattern, re.IGNORECASE) for key, pattern in _LABEL_PATTERNS.items()}


def _clean_string(value: str) -> str | None:
    value = re.sub(r"\s+", " ", value).strip(" :-\t")
    # OCR frequently tokenizes brackets as their own word (e.g. "Peti", "[",
    # "TAR", "]"), which the space-join above turns into "Peti [ TAR ]" -
    # collapse that back to how it's actually printed ("Peti [TAR]").
    value = re.sub(r"\[\s+", "[", value)
    value = re.sub(r"\s+\]", "]", value)
    return value or None


def _extract_number(value: str) -> float | int | None:
    """Finds the first numeric token within a string and parses just that —
    used only for overlay-reconstructed table cells, which can legitimately
    include a joined unit word (e.g. "40 Kg ." for a weight cell spanning
    two OCR words). Unlike `_clean_number`, this does not require the whole
    string to be a bare number."""
    match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
    if not match:
        return None
    as_float = float(match.group(0))
    return int(as_float) if as_float.is_integer() else as_float


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


# The GR form's Bill Type is strictly a two-value status (never a third
# "Not Paid" bucket): "Paid" (already paid) or "To Pay" (payment pending).
# Slips print several equivalent spellings ("TBB", "To Be Billed") for the
# pending case - all normalized to the same two canonical values the mobile
# form's toggle actually offers, so an OCR-detected value always matches one
# of the two chips instead of silently failing to select either.
_BILL_TYPE_PAID = re.compile(r"^PAID$", re.IGNORECASE)
_BILL_TYPE_TO_PAY = re.compile(r"^(?:TO\s*PAY|TBB|TO\s*BE\s*BILLED)$", re.IGNORECASE)


def _normalize_bill_type(raw: str | None) -> str | None:
    if not raw:
        return raw
    normalized = raw.strip()
    if _BILL_TYPE_PAID.fullmatch(normalized):
        return "Paid"
    if _BILL_TYPE_TO_PAY.fullmatch(normalized):
        return "To Pay"
    return raw


# Package/unit-count column headers seen on real GR slips (e.g. "Nug" is a
# common regional term for a package/bundle unit). Reused both to reconstruct
# the goods table's count column (`_GOODS_COLUMN_HEADERS` below) and to read
# the header word itself as the shipment's `packageType` - the printed
# column header literally names the unit type ("Nug", "Bags", "Boxes", ...),
# distinct from the numeric count value below it.
_PACKAGE_TYPE_CANONICAL: dict[str, str] = {
    "nug": "Nug", "nugs": "Nug",
    "pkg": "Pkg", "pkgs": "Pkgs",
    "package": "Package", "packages": "Packages",
    "bag": "Bag", "bags": "Bags",
    "box": "Box", "boxes": "Boxes",
    "carton": "Carton", "cartons": "Cartons",
    "bundle": "Bundle", "bundles": "Bundles",
    "pcs": "Pcs",
}
_PACKAGE_TYPE_TOKEN = re.compile(
    r"\b(" + "|".join(_PACKAGE_TYPE_CANONICAL.keys()) + r")\b", re.IGNORECASE
)


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
            elif key == "billType":
                cleaned = _normalize_bill_type(_clean_string(raw))
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
        "billType": re.compile(r"^(?:BILTI|BILL|BITTI)\s*TYPE\s*[:\-]?\s*$", re.IGNORECASE),
    }
    # Every label word/phrase that can appear as its own bare line on these
    # slips. Used to reject a "next line" candidate that is actually another
    # label (e.g. "From" immediately followed by "To" with no value between
    # them, or "To" immediately followed by "GR Charge") rather than a real
    # value — table-scrambled OCR text frequently prints several labels in a
    # row before any of their values. Deliberately conservative: if the next
    # line is itself a label, the field is left unmatched rather than reading
    # further down and risking a wrong guess.
    _KNOWN_LABEL_LINE = re.compile(
        r"^(?:"
        r"FROM|TO|DELIVERY\s*AT|"
        r"(?:TRANS\s*)?G\.?\s*R\.?\s*(?:NO\.?|NUMBER|DATE)?|GSTIN|"
        r"CONSIGNOR|CONSIGNER|CONSIGNEE|SENDER|RECEIVER|"
        r"PARTICULARS?|NUGS?|WEIGHT|RATE|KGS?|P\.?M\.?|"
        r"GR\s*CHARGE|FREIGHT|LABOUR|LABOR|HAMALI|P\.?\s*F\.?|"
        r"DOOR\s*(?:DELIVERY|DEL\.?)|TAX\s*\(?\/?\s*GST\)?|"
        r"NET\s*(?:AMOUNT|TOTAL)|TO\s*PAY|VALUE\s*OF\s*GOODS(?:\s*RS\.?)?|"
        r"(?:BILTI|BILL|BITTI)\s*TYPE|EWB\.?\s*NO\.?\s*\(?S?\)?|"
        r"SPECIAL\s*SERVICE|PROPRIETOR|PHONE|MOB(?:ILE)?|"
        r"TRANSPORT\s*(?:CO\.?|COMPANY)?|DRIVER\s*COPY|AUTHORIZED\s*SIGNATORY"
        r")\s*[:\-]?\s*$",
        re.IGNORECASE,
    )
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
            elif key == "billType":
                # "To Pay" is a legitimate bill-type VALUE here, even though
                # "TO PAY" also appears in `_KNOWN_LABEL_LINE` as a charges-
                # table label elsewhere on the same slip (a "To Pay" amount
                # column) — the generic label-line guard would otherwise
                # wrongly reject the real value.
                if re.fullmatch(r"(?:PAID|TO\s*PAY|TBB|TO\s*BE\s*BILLED)", candidate.strip(), re.IGNORECASE):
                    result[key] = _normalize_bill_type(_clean_string(candidate))
                    break
            else:
                if not _KNOWN_LABEL_LINE.match(candidate):
                    cleaned = _clean_string(candidate)
                    if cleaned:
                        result[key] = cleaned
                        # "Proprietor:" is often followed by the name on one
                        # line and their phone number on the very next —
                        # only taken when that next line looks like an
                        # actual phone number, never invented.
                        if key == "proprietor" and idx + 2 < len(lines):
                            phone_candidate = lines[idx + 2].strip()
                            if re.fullmatch(r"[+0-9][\d\-\s]{7,15}\d", phone_candidate):
                                result["proprietorPhone"] = _clean_string(phone_candidate)
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

    # "Special Service" is commonly printed as a bare label followed by a
    # vertical list of route/service names (one per line) rather than
    # "Special Service: X, Y, Z" on one line, which the labelled regex above
    # can't catch. Collects consecutive plausible lines after the label,
    # stopping at the first line that's itself a known table label (so it
    # never swallows the next section) or a bare number (a neighbouring
    # column's value bleeding in from the same row).
    if result["specialService"] is None:
        label_line = re.compile(r"^SPECIAL\s*SERVICE\s*[:\-]?\s*$", re.IGNORECASE)
        for idx, line in enumerate(lines):
            if not label_line.match(line):
                continue
            collected: list[str] = []
            # Capped at 6 collected names (not 6 raw lines): a route/service
            # list is normally a handful of short place names, not an
            # open-ended scan — bounding the RESULT keeps this from ever
            # swallowing the next section (e.g. the goods table's
            # Particulars value, which has no label of its own on this same
            # layout), while a wider raw-line window tolerates a stray
            # numeric value from a neighbouring column bleeding in between
            # names.
            for candidate in lines[idx + 1 : idx + 12]:
                if _KNOWN_LABEL_LINE.match(candidate):
                    break
                if re.fullmatch(r"[\d.,]+", candidate.strip()):
                    continue
                cleaned = _clean_string(candidate)
                if cleaned:
                    collected.append(cleaned)
                if len(collected) >= 6:
                    break
            if collected:
                result["specialService"] = ", ".join(collected)
            break

    # The goods table's package/unit-count column is headed by the unit's
    # own name ("Nug", "Bags", "Boxes", ...) rather than a generic "Package
    # Type" label — that header word IS the packageType value. Table-column
    # reconstruction (`reconstruct_table_fields`) also derives this from the
    # word-position overlay when available; this text-only fallback covers
    # the common case where the header renders as its own bare OCR line
    # (matched by exact match here, not substring search, so it can never
    # pick up the word from unrelated running text elsewhere on the slip).
    if result["packageType"] is None:
        for line in lines:
            candidate = line.strip(" :-\t")
            match = _PACKAGE_TYPE_TOKEN.fullmatch(candidate)
            if match:
                result["packageType"] = _PACKAGE_TYPE_CANONICAL[match.group(1).lower()]
                break

    return result


class _OverlayWord:
    """A single OCR'd word with its pixel position (from OCR.Space's
    `TextOverlay.Lines[].Words[]`), used only for table-column
    reconstruction below."""

    __slots__ = ("text", "left", "top")

    def __init__(self, text: str, left: float, top: float) -> None:
        self.text = text
        self.left = left
        self.top = top


def _flatten_overlay_words(overlay_lines: list[dict]) -> list[_OverlayWord]:
    words: list[_OverlayWord] = []
    for line in overlay_lines:
        for w in line.get("Words") or []:
            text = (w.get("WordText") or "").strip()
            if not text:
                continue
            try:
                words.append(_OverlayWord(text, float(w["Left"]), float(w["Top"])))
            except (KeyError, TypeError, ValueError):
                continue
    return words


def _clean_label_token(text: str) -> str:
    """Strips all punctuation (not just leading/trailing) so a single OCR'd
    token like "P.F" (one word, internal dot) matches the "pf" header key
    the same way separately-tokenized "P" "." "F" would."""
    return re.sub(r"[\s.:()\-]+", "", text).lower()


# Table column headers this module knows how to reconstruct, grouped by the
# table they belong to (a slip's goods table and charges table are printed
# independently and — since these are photographed, not scanned, documents —
# can each end up oriented differently in OCR.Space's coordinate output, so
# axis detection below runs separately per group rather than once globally).
# Every recognized package/unit-count header word maps to the same
# `packageCount` field (the table's count column, whatever it's called on a
# given slip) — `_PACKAGE_TYPE_CANONICAL`'s keys are reused here so the two
# stay in sync automatically.
_GOODS_COLUMN_HEADERS: dict[str, str] = {
    **{token: "packageCount" for token in _PACKAGE_TYPE_CANONICAL},
    "particulars": "particulars",
    "weight": "weight",
    "rate": "rate",
}
_CHARGES_COLUMN_HEADERS: dict[str, str] = {
    "charge": "grCharge",
    "freight": "freight",
    "labour": "labour",
    "labor": "labour",
    "pf": "pf",
    "door": "doorDelivery",
    "tax": "taxGst",
    "amount": "netAmount",
}
# "From"/"To" printed as two bare labels with their values elsewhere on the
# slip (the same table-scrambling this whole module works around) rather
# than "From: <value>" on one line. Treated as its own 2-column group so its
# axis/tolerance is derived from just these two headers' own spacing.
_ROUTE_COLUMN_HEADERS: dict[str, str] = {
    "from": "fromAddress",
    "to": "toAddress",
}


def _find_header_words(words: list[_OverlayWord], header_map: dict[str, str]) -> dict[str, _OverlayWord]:
    """Finds one representative overlay word per field for a header group,
    matching by exact cleaned-token text. First match wins per field."""
    found: dict[str, _OverlayWord] = {}
    for w in words:
        token = _clean_label_token(w.text)
        field = header_map.get(token)
        if field and field not in found:
            found[field] = w
    return found


def _reconstruct_column_group(all_words: list[_OverlayWord], header_words: dict[str, _OverlayWord]) -> dict[str, str]:
    """Given the located header words for one table (e.g. Nug/Particulars/
    Weight/Rate), finds each header's value by matching overlay position —
    real table-structure understanding rather than line/text order.

    Photographed (not scanned) slips are rarely perfectly axis-aligned, and
    OCR.Space's overlay coordinates aren't guaranteed to follow a fixed
    row/column convention, so the "row axis" (the coordinate the header
    words share) is detected per table: whichever of Left/Top has a smaller
    spread across the located header words is the row axis: header words in
    the same physical row that share it are the header row, and their
    values live at matching positions along the other (column) axis, in a
    different row-axis position.

    Deliberately conservative: a header with no aligned candidate word is
    left out of the result entirely (caller only fills still-null fields;
    nothing here is ever invented)."""
    if len(header_words) < 2:
        return {}

    lefts = [w.left for w in header_words.values()]
    tops = [w.top for w in header_words.values()]
    row_axis = "left" if (max(lefts) - min(lefts)) < (max(tops) - min(tops)) else "top"
    col_axis = "top" if row_axis == "left" else "left"

    def row_pos(w: _OverlayWord) -> float:
        return w.left if row_axis == "left" else w.top

    def col_pos(w: _OverlayWord) -> float:
        return w.top if row_axis == "left" else w.left

    header_row = sum(row_pos(w) for w in header_words.values()) / len(header_words)
    header_ids = {id(w) for w in header_words.values()}
    # MAX_ROW_GAP bounds how far from the header row a value row can
    # plausibly be (a full page of unrelated text otherwise dilutes the
    # search); ROW_BAND is how close two words' row-axis positions must be
    # to count as "the same value row".
    ROW_BAND = 32.0
    MAX_ROW_GAP = 260.0
    MIN_COLUMN_MATCHES = 2
    # Column tolerance must adapt to THIS table's own header spacing rather
    # than use one fixed pixel value: a 4-column goods table (headers ~90px+
    # apart) needs a looser tolerance than a 7-column charges table (headers
    # as little as ~25px apart), and a single generous constant caused two
    # confirmed failures in testing — an adjacent column's value bleeding
    # into a neighboring header, and a value from a completely different
    # table (weight's "10") being picked up as a charges column just because
    # it happened to fall within a wide fixed tolerance. Capped at half the
    # smallest gap between this group's own header columns so it can never
    # bleed past a neighboring column, with a sensible floor/ceiling.
    header_cols = sorted({col_pos(w) for w in header_words.values()})
    gaps = [b - a for a, b in zip(header_cols, header_cols[1:])]
    COL_TOL = min(60.0, max(15.0, (min(gaps) / 2) if gaps else 60.0))

    candidates = [
        w
        for w in all_words
        if id(w) not in header_ids and ROW_BAND < abs(row_pos(w) - header_row) <= MAX_ROW_GAP
    ]
    if not candidates:
        return {}

    # Only cluster words that already column-align with AT LEAST ONE header
    # — clustering the full candidate pool by row-axis proximity alone was
    # tried first and proved unreliable on a dense printed page: rows of
    # unrelated text (dates, footer lines, other labels) sit just as close
    # together as a genuine value row, so a fixed "same row" tolerance
    # either split real rows apart (a tilted photo can drift a single row
    # more than a tight tolerance allows) or swallowed unrelated text into
    # one giant chain (a looser tolerance merges adjacent-but-different
    # printed lines on a dense slip). Pre-filtering to only words that
    # already sit under some header's column shrinks the pool enough that
    # this ambiguity mostly disappears — unrelated text coincidentally
    # aligning under MULTIPLE different columns AND clustering together
    # row-wise is a much rarer coincidence than aligning under just one.
    column_aligned = [w for w in candidates if any(abs(col_pos(w) - hc) <= COL_TOL for hc in header_cols)]
    if not column_aligned:
        return {}
    column_aligned.sort(key=row_pos)
    rows: list[list[_OverlayWord]] = []
    for w in column_aligned:
        if rows and abs(row_pos(w) - row_pos(rows[-1][-1])) <= ROW_BAND:
            rows[-1].append(w)
        else:
            rows.append([w])

    def cell_is_plausible(field: str, cell_words: list[_OverlayWord]) -> bool:
        """A column-position match only counts if the aligned text actually
        looks like a value for that field's type — a numeric field (weight,
        rate, charges, ...) needs a parseable number among the words, not
        just any word that happens to land near the coordinate. This is
        what actually disambiguates the real value row from a coincidental
        alignment with unrelated text elsewhere on the page (e.g. a
        consignee name briefly outscoring the real row in testing)."""
        text = " ".join(w.text for w in cell_words).strip()
        if not text:
            return False
        if field in _NUMERIC_FIELDS:
            return _extract_number(text) is not None
        return True

    scored: list[tuple[int, float, list[_OverlayWord]]] = []
    for row in rows:
        matched_fields = {
            field
            for field, hw in header_words.items()
            if cell_is_plausible(field, [w for w in row if abs(col_pos(w) - col_pos(hw)) <= COL_TOL])
        }
        if not matched_fields:
            continue
        distance = abs(row_pos(row[0]) - header_row)
        scored.append((len(matched_fields), distance, row))

    if not scored:
        return {}
    scored.sort(key=lambda s: (-s[0], s[1]))
    best_score, best_distance, best_row = scored[0]
    if best_score < MIN_COLUMN_MATCHES:
        return {}
    # Refuse to guess when a second row scores just as well — on a dense
    # printed page, a coincidental column-alignment tie is a real risk (seen
    # in testing: a consignee name line briefly out-scored the actual value
    # row) and picking one arbitrarily is exactly the kind of wrong-value
    # guess this module must never make.
    if len(scored) > 1 and scored[1][0] == best_score:
        return {}

    result: dict[str, str] = {}
    for field, header_word in header_words.items():
        hcol = col_pos(header_word)
        cell_words = sorted((w for w in best_row if abs(col_pos(w) - hcol) <= COL_TOL), key=col_pos)
        text = " ".join(w.text for w in cell_words).strip()
        if text:
            result[field] = text

    return result


def reconstruct_table_fields(overlay_lines: list[dict]) -> dict[str, Any]:
    """Best-effort table-column reconstruction from OCR.Space's word-position
    overlay, used to fill goods-table and charges-table fields that the
    line-based `parse_slip_text` regexes couldn't — those regexes require a
    label and its value on the same OCR line (or an immediately-adjacent
    one), which multi-column tables routinely violate: OCR.Space frequently
    emits every column header first and every value afterwards, with no
    reliable textual adjacency between a header and its value.

    Returns only the fields it found a confident positional match for
    (never a full/guessed schema) — the caller merges this in as a fallback,
    only for fields the primary text parser left `None`."""
    words = _flatten_overlay_words(overlay_lines)
    if not words:
        return {}

    result: dict[str, Any] = {}
    for header_map in (_GOODS_COLUMN_HEADERS, _CHARGES_COLUMN_HEADERS, _ROUTE_COLUMN_HEADERS):
        header_words = _find_header_words(words, header_map)
        # The goods table's count-column header word (e.g. "Nug") IS the
        # packageType value - read directly off the header word itself, not
        # the row of values below it, so this doesn't depend on the count
        # cell actually being locatable (positional matching below can fail
        # for that cell independently, e.g. a faint/small digit OCR misses
        # entirely, without that meaning the unit-type label is unknown).
        if "packageCount" in header_words and "packageType" not in result:
            cleaned_type = _clean_string(header_words["packageCount"].text)
            if cleaned_type:
                result["packageType"] = cleaned_type
        matches = _reconstruct_column_group(words, header_words)
        for field, raw in matches.items():
            if field in _NUMERIC_FIELDS:
                cleaned = _extract_number(raw)
            else:
                cleaned = _clean_string(raw)
            if cleaned is not None:
                result[field] = cleaned

    return result
