"""Company-related helper utilities."""
from __future__ import annotations


def normalize_company_name(value: str) -> str:
    """Collapses runs of whitespace and trims the edges of a company name.

    Used both for canonicalizing input and for comparing existing companies
    so that 'Metro Freight Lines', '  metro  freight lines  ' and
    'Metro   Freight Lines' are all treated as the same company.
    """
    return " ".join(str(value).split())
