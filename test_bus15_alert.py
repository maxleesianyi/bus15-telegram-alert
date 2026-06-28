from datetime import datetime
import unittest
from zoneinfo import ZoneInfo

from bus15_alert import BusArrival, Config, compose_message, parse_arrivals


SGT = ZoneInfo("Asia/Singapore")


class Bus15AlertTests(unittest.TestCase):
    def test_compose_message_recommends_subsequent_when_next_is_too_tight(self):
        config = Config(
            lta_account_key="test",
            telegram_bot_token=None,
            telegram_chat_id=None,
            walk_minutes=10,
            buffer_minutes=2,
            dry_run=True,
        )
        now = datetime(2026, 6, 29, 8, 15, tzinfo=SGT)
        arrivals = [
            BusArrival("Next", 7),
            BusArrival("Subsequent", 18),
        ]

        message = compose_message(config, arrivals, now)

        self.assertIn("Next: 7 min", message)
        self.assertIn("Subsequent: 18 min", message)
        self.assertIn("Best catchable: subsequent bus", message)
        self.assertIn("Leave around 8:21 AM", message)

    def test_compose_message_says_leave_now_when_inside_buffer(self):
        config = Config(
            lta_account_key="test",
            telegram_bot_token=None,
            telegram_chat_id=None,
            walk_minutes=10,
            buffer_minutes=2,
            dry_run=True,
        )
        now = datetime(2026, 6, 29, 8, 30, tzinfo=SGT)
        arrivals = [
            BusArrival("Next", 11),
            BusArrival("Subsequent", 24),
        ]

        message = compose_message(config, arrivals, now)

        self.assertIn("Leave now for the next bus", message)

    def test_parse_arrivals_handles_lta_payload(self):
        now = datetime(2026, 6, 29, 8, 15, tzinfo=SGT)
        payload = {
            "Services": [
                {
                    "ServiceNo": "15",
                    "NextBus": {
                        "EstimatedArrival": "2026-06-29T08:25:00+08:00",
                        "Load": "SEA",
                        "Type": "SD",
                    },
                    "NextBus2": {
                        "EstimatedArrival": "2026-06-29T08:40:00+08:00",
                        "Load": "SDA",
                        "Type": "DD",
                    },
                    "NextBus3": {"EstimatedArrival": ""},
                }
            ]
        }

        arrivals = parse_arrivals(payload, now)

        self.assertEqual(arrivals[0], BusArrival("Next", 10, "SEA", "SD"))
        self.assertEqual(arrivals[1], BusArrival("Subsequent", 25, "SDA", "DD"))
        self.assertEqual(arrivals[2], BusArrival("Third", None))


if __name__ == "__main__":
    unittest.main()
