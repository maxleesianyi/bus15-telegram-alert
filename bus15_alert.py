#!/usr/bin/env python3
"""Send a Telegram alert for catchable SBS/LTA bus arrivals."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


LTA_BUS_ARRIVAL_URL = "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival"
SINGAPORE_TZ = ZoneInfo("Asia/Singapore")


@dataclass(frozen=True)
class BusArrival:
    label: str
    eta_minutes: int | None
    load: str | None = None
    bus_type: str | None = None


@dataclass(frozen=True)
class Config:
    lta_account_key: str
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    service_no: str = "15"
    bus_stop_code: str = "75591"
    walk_minutes: int = 10
    buffer_minutes: int = 2
    dry_run: bool = False

    @property
    def leave_threshold_minutes(self) -> int:
        return self.walk_minutes + self.buffer_minutes


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_dotenv_if_present(path: Path = Path(".env")) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.lstrip("\ufeff").split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def read_config() -> Config:
    load_dotenv_if_present()
    dry_run = os.getenv("DRY_RUN", "").strip().lower() in {"1", "true", "yes", "on"}
    telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip() or None
    telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip() or None

    if not dry_run:
        if not telegram_bot_token:
            raise RuntimeError("Missing required environment variable: TELEGRAM_BOT_TOKEN")
        if not telegram_chat_id:
            raise RuntimeError("Missing required environment variable: TELEGRAM_CHAT_ID")

    return Config(
        lta_account_key=require_env("LTA_ACCOUNT_KEY"),
        telegram_bot_token=telegram_bot_token,
        telegram_chat_id=telegram_chat_id,
        service_no=os.getenv("SERVICE_NO", "15").strip(),
        bus_stop_code=os.getenv("BUS_STOP_CODE", "75591").strip(),
        walk_minutes=int(os.getenv("WALK_MINUTES", "10")),
        buffer_minutes=int(os.getenv("BUFFER_MINUTES", "2")),
        dry_run=dry_run,
    )


def should_send_for_current_time(now: datetime) -> bool:
    if os.getenv("GITHUB_EVENT_NAME") != "schedule":
        return True

    is_weekday = now.weekday() < 5
    window_start = now.replace(hour=8, minute=0, second=0, microsecond=0)
    window_end = now.replace(hour=9, minute=30, second=0, microsecond=0)
    return is_weekday and window_start <= now <= window_end


def fetch_bus_arrivals(config: Config) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "BusStopCode": config.bus_stop_code,
            "ServiceNo": config.service_no,
        }
    )
    request = urllib.request.Request(
        f"{LTA_BUS_ARRIVAL_URL}?{query}",
        headers={
            "AccountKey": config.lta_account_key,
            "accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_lta_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(SINGAPORE_TZ)


def minutes_until(arrival_time: datetime | None, now: datetime) -> int | None:
    if arrival_time is None:
        return None
    seconds = (arrival_time - now).total_seconds()
    return max(0, round(seconds / 60))


def parse_arrivals(payload: dict[str, Any], now: datetime) -> list[BusArrival]:
    services = payload.get("Services", [])
    if not services:
        return []

    service = services[0]
    arrivals: list[BusArrival] = []

    for label, key in (
        ("Next", "NextBus"),
        ("Subsequent", "NextBus2"),
        ("Third", "NextBus3"),
    ):
        bus = service.get(key, {}) or {}
        arrival_time = parse_lta_datetime(bus.get("EstimatedArrival"))
        arrivals.append(
            BusArrival(
                label=label,
                eta_minutes=minutes_until(arrival_time, now),
                load=bus.get("Load") or None,
                bus_type=bus.get("Type") or None,
            )
        )

    return arrivals


def format_eta(arrival: BusArrival) -> str:
    if arrival.eta_minutes is None:
        return "not available"

    return f"{arrival.eta_minutes} min"


def first_catchable_arrival(arrivals: list[BusArrival], walk_minutes: int) -> BusArrival | None:
    for arrival in arrivals:
        if arrival.eta_minutes is not None and arrival.eta_minutes >= walk_minutes:
            return arrival
    return None


def compose_message(config: Config, arrivals: list[BusArrival], now: datetime) -> str:
    checked_at = now.strftime("%-I:%M %p") if os.name != "nt" else now.strftime("%#I:%M %p")
    header = f"Bus {config.service_no} at stop {config.bus_stop_code} checked {checked_at} SGT"

    if not arrivals:
        return (
            f"{header}\n\n"
            "No arrival data is available right now. Check the SBS/LTA app before leaving."
        )

    lines = [header, ""]
    for arrival in arrivals[:2]:
        lines.append(f"{arrival.label}: {format_eta(arrival)}")

    best = first_catchable_arrival(arrivals, config.walk_minutes)
    lines.append("")

    if best is None or best.eta_minutes is None:
        lines.append(
            f"No catchable bus is shown yet for a {config.walk_minutes} min walk. "
            "Check again before leaving."
        )
        return "\n".join(lines)

    minutes_to_leave = best.eta_minutes - config.leave_threshold_minutes

    if minutes_to_leave <= 0:
        lines.append(
            f"Leave now for the {best.label.lower()} bus. "
            f"It arrives in {best.eta_minutes} min."
        )
    else:
        leave_at = now + timedelta(minutes=minutes_to_leave)
        leave_time = leave_at.strftime("%-I:%M %p") if os.name != "nt" else leave_at.strftime("%#I:%M %p")
        lines.append(
            f"Best catchable: {best.label.lower()} bus. "
            f"Leave around {leave_time} ({minutes_to_leave} min from now)."
        )

    return "\n".join(lines)


def send_telegram_message(config: Config, text: str) -> None:
    if config.dry_run:
        print(text)
        return

    assert config.telegram_bot_token is not None
    assert config.telegram_chat_id is not None

    url = f"https://api.telegram.org/bot{config.telegram_bot_token}/sendMessage"
    body = urllib.parse.urlencode(
        {
            "chat_id": config.telegram_chat_id,
            "text": text,
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")

    with urllib.request.urlopen(request, timeout=20) as response:
        response_body = json.loads(response.read().decode("utf-8"))
        if not response_body.get("ok"):
            raise RuntimeError(f"Telegram API returned an error: {response_body}")


def main() -> int:
    try:
        config = read_config()
        now = datetime.now(SINGAPORE_TZ)
        if not should_send_for_current_time(now):
            print(f"Skipped because current Singapore time is outside the alert window: {now.isoformat()}")
            return 0

        payload = fetch_bus_arrivals(config)
        arrivals = parse_arrivals(payload, now)
        message = compose_message(config, arrivals, now)
        send_telegram_message(config, message)
        return 0
    except Exception as exc:
        print(f"bus15-alert failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
