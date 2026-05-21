"""Phone-number normalization for caller lookup."""

from __future__ import annotations

import re


def normalize_phone(value: str | None, default_country_code: str = "+91") -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.startswith("+"):
        digits = "+" + re.sub(r"\D", "", raw)
    elif raw.startswith("00"):
        digits = "+" + re.sub(r"\D", "", raw[2:])
    else:
        digits_only = re.sub(r"\D", "", raw)
        if len(digits_only) == 10 and default_country_code:
            digits = f"{default_country_code}{digits_only}"
        elif digits_only:
            digits = f"+{digits_only}"
        else:
            return None
    return digits if len(re.sub(r"\D", "", digits)) >= 8 else None

