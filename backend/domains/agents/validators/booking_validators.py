"""Validation and extraction helpers for English voice booking turns."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from .phone import normalize_phone


CONFIRM_WORDS = {"yes", "yeah", "yep", "confirm", "okay", "ok", "book it", "go ahead", "please confirm"}
CANCEL_WORDS = {"no", "cancel", "stop", "never mind", "nevermind", "do not book", "don't book"}


@dataclass(frozen=True)
class ParsedDateTime:
    starts_at: datetime
    display_date: str
    display_time: str


def normalize_booking_phone(value: str | None) -> str:
    normalized = normalize_phone(value)
    if not normalized:
        raise ValueError("Please share a valid phone number.")
    return normalized


def validate_customer_name(value: str | None) -> str:
    value = re.sub(r"\s+", " ", (value or "").strip())
    if len(value) < 2:
        raise ValueError("Please share the customer name for the booking.")
    return value


def parse_booking_datetime(message: str, *, reference: datetime | None = None, timezone_name: str = "Asia/Kolkata") -> ParsedDateTime | None:
    reference = reference or datetime.now(timezone.utc)
    parsed_date = parse_booking_date(message, reference=reference)
    parsed_time = parse_booking_time(message)
    if not parsed_date or not parsed_time:
        return None
    starts_at = datetime.combine(parsed_date, parsed_time)
    return ParsedDateTime(
        starts_at=starts_at,
        display_date=starts_at.strftime("%d %b %Y"),
        display_time=starts_at.strftime("%I:%M %p").lstrip("0"),
    )


def parse_booking_date(message: str, *, reference: datetime | None = None) -> date | None:
    reference = reference or datetime.now(timezone.utc)
    lowered = message.lower()
    today = reference.date()

    if "today" in lowered:
        return today
    if "tomorrow" in lowered:
        return today + timedelta(days=1)

    explicit = re.search(r"\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b", lowered)
    if explicit:
        day = int(explicit.group(1))
        month = int(explicit.group(2))
        year_text = explicit.group(3)
        year = today.year if not year_text else int(year_text)
        if year < 100:
            year += 2000
        try:
            parsed = date(year, month, day)
            return parsed if parsed >= today else None
        except ValueError:
            return None

    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    for name, weekday in weekdays.items():
        if name in lowered:
            days_ahead = (weekday - today.weekday()) % 7
            if days_ahead == 0 or f"next {name}" in lowered:
                days_ahead = 7
            return today + timedelta(days=days_ahead)
    return None


def parse_booking_time(message: str) -> time | None:
    lowered = message.lower().replace(".", "")
    match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", lowered)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    period = match.group(3)
    if minute > 59:
        return None
    if period == "pm" and hour < 12:
        hour += 12
    elif period == "am" and hour == 12:
        hour = 0
    elif not period and 1 <= hour <= 7:
        hour += 12
    if hour > 23:
        return None
    return time(hour, minute)


def extract_name_and_phone(message: str) -> tuple[str | None, str | None]:
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", message)
    phone = normalize_phone(phone_match.group(0)) if phone_match else None
    without_phone = message
    if phone_match:
        without_phone = (message[: phone_match.start()] + " " + message[phone_match.end() :]).strip()
    name = re.sub(r"\b(my name is|this is|name is|phone is|number is|for)\b", " ", without_phone, flags=re.I)
    name = re.sub(r"[,.;:]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return (name or None), phone


def extract_booking_reference(message: str) -> str | None:
    match = re.search(r"\b(FLX-[A-Z0-9]{4,12}|[0-9a-f]{8}-[0-9a-f-]{27,})\b", message, re.I)
    return match.group(1).upper() if match else None


def is_confirmation(message: str) -> bool:
    lowered = message.lower().strip(" .!,")
    return any(word in lowered for word in CONFIRM_WORDS)


def is_cancellation(message: str) -> bool:
    lowered = message.lower().strip(" .!,")
    return any(word in lowered for word in CANCEL_WORDS)


def resolve_service(message: str, business_data: dict[str, Any]) -> dict[str, Any]:
    services = business_data.get("products_services") or business_data.get("services") or []
    lowered = message.lower()
    for service in services:
        if not isinstance(service, dict):
            continue
        name = str(service.get("name") or "")
        if name and name.lower() in lowered:
            return {
                "id": service.get("id"),
                "name": name,
                "duration": int(service.get("duration") or service.get("duration_minutes") or 60),
                "price": float(service.get("price") or service.get("price_amount") or 0),
            }
    return {"id": None, "name": "Appointment", "duration": 60, "price": 0.0}


def slot_matches(slots: list[dict[str, Any]], requested: time) -> bool:
    if not slots:
        return True
    requested_text = requested.strftime("%H:%M")
    for slot in slots:
        if slot.get("time") == requested_text and slot.get("available", True):
            return True
    return False


def format_slot_choices(slots: list[dict[str, Any]], limit: int = 3) -> str:
    choices: list[str] = []
    for slot in slots:
        if not slot.get("available", True):
            continue
        raw = slot.get("time")
        if not raw:
            continue
        try:
            parsed = datetime.strptime(raw, "%H:%M")
            choices.append(parsed.strftime("%I:%M %p").lstrip("0"))
        except ValueError:
            choices.append(str(raw))
        if len(choices) >= limit:
            break
    return ", ".join(choices)
