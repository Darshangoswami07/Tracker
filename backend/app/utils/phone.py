"""Indian mobile number validation/normalisation shared by signup schemas.

Public self-service signup only accepts Indian mobile numbers: exactly 10
digits beginning with 6, 7, 8 or 9, stored normalised as ``+91XXXXXXXXXX``.
"""
from __future__ import annotations

import re

INDIAN_PHONE_RE = re.compile(r"^[6-9][0-9]{9}$")
COUNTRY_CODE = "+91"
PHONE_LENGTH = 10


def normalize_indian_phone(value: str) -> str:
    """Return ``+91`` followed by the 10 extracted digits.

    Strips every non-digit and tolerates a pasted/autofilled ``+91`` prefix.
    Callers must validate with :func:`is_valid_indian_phone` first — this only
    normalises an already-valid 10-digit number.
    """
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return f"{COUNTRY_CODE}{digits[:PHONE_LENGTH]}"


def is_valid_indian_phone(value: str) -> bool:
    """True only for a bare 10-digit Indian mobile number (no country code)."""
    return bool(INDIAN_PHONE_RE.match(value or ""))


def validate_indian_phone(value: str) -> str:
    """Pydantic ``mode="before"`` validator: enforce the rule, then normalise.

    Accepts a bare 10-digit number or a ``+91``-prefixed one and always stores
    ``+91XXXXXXXXXX``. Raises ``ValueError`` for anything else (letters, spaces,
    emoji, too few/many digits, or a number not starting with 6-9). Length is
    enforced strictly — an 11-digit value is NOT truncated, it is rejected.
    """
    digits = re.sub(r"\D", "", value or "")
    # A pasted/autofilled "+91" prefix yields 12 digits starting with "91".
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != PHONE_LENGTH or not INDIAN_PHONE_RE.match(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)")
    return f"{COUNTRY_CODE}{digits}"
