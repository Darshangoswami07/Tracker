"""Fixed operational areas — mirrors `mobile/src/constants/areas.ts`.

Kept as a small standalone module (not shared code, since mobile and backend
are separate language runtimes) so both sides validate/normalize against the
exact same three area names.
"""
from __future__ import annotations

AREAS: tuple[str, ...] = ("Bageshwar", "Almora", "Garur Someshwar")

_AREA_LOOKUP = {area.strip().lower(): area for area in AREAS}


def normalize_area(text: str | None) -> str | None:
    """Matches free text against the fixed area list, tolerant of case and
    surrounding/duplicate whitespace. Returns None when it doesn't match."""
    if not text:
        return None
    key = " ".join(text.strip().lower().split())
    return _AREA_LOOKUP.get(key)
