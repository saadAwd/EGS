import os
import json
import datetime
import logging
import sys
from typing import Any, Dict, List, Optional

# Configure logging - ensure messages go to stderr for Gunicorn to capture
logging.basicConfig(
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stderr)],
    force=True,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Helper function for guaranteed log visibility (both print and logger)
def log_always(msg):
    """Log message that will always appear in Gunicorn error log"""
    # Write directly to stderr (captured by Gunicorn) and also use logger
    # Use logger.error() to ensure it appears in Gunicorn error log
    print(msg, file=sys.stderr, flush=True)
    logger.error(msg)  # Use error level to ensure visibility in Gunicorn error log

# Lazy import to avoid import error if dependency not installed during other flows
try:
    from pycampbellcr1000 import CR1000  # type: ignore
except Exception:  # pragma: no cover - optional until installed
    CR1000 = None  # type: ignore


class CR1000Client:
    """Thin client for Campbell Scientific CR1000 via PakBus/serial.

    Uses logger clock for time windows per best practice to avoid host/logger drift.
    """

    def __init__(self,
                 serial_port: str | None = None,
                 baud: int | None = None,
                 table_default: str | None = None) -> None:
        port = serial_port or os.getenv("CR1000_SERIAL_PORT", "/dev/cu.usbserial-1230")
        speed = baud or int(os.getenv("CR1000_BAUD", "9600"))
        table_name = table_default or os.getenv("CR1000_TABLE", "Tbl_1min")

        self.url = f"serial:{port}:{speed}"
        self.table_default = table_name

    def _open(self):
        if CR1000 is None:
            raise RuntimeError("pycampbellcr1000 is not installed. pip install pycampbellcr1000 pyserial")
        return CR1000.from_url(self.url)

    @staticmethod
    def _clean_record(record: Dict[Any, Any]) -> Dict[str, Any]:
        def decode_key(k: Any) -> str:
            if isinstance(k, (bytes, bytearray)):
                return k.decode("utf-8", errors="ignore")
            return str(k)

        def default(obj: Any) -> str:
            try:
                return str(obj)
            except Exception:
                return ""

        cleaned: Dict[str, Any] = {decode_key(k): v for k, v in record.items()}
        # Normalize common CR1000 fields (strip stray b'' prefixes in field names)
        normalized: Dict[str, Any] = {}
        for k, v in cleaned.items():
            nk = k
            if k.startswith("b'") and k.endswith("'"):
                nk = k[2:-1]
            normalized[nk] = v
        # Ensure JSON serializable values for safety
        json.loads(json.dumps(normalized, default=default))
        return normalized

    def get_time(self) -> datetime.datetime:
        dev = self._open()
        return dev.gettime()

    def latest(self, table: Optional[str] = None) -> Dict[str, Any]:
        table_name = table or self.table_default
        dev = self._open()
        now_logger = dev.gettime()
        start = now_logger - datetime.timedelta(minutes=2)
        data = dev.get_data(table_name, start, now_logger)
        latest = data[-1] if data else {}
        return self._clean_record(latest) if latest else {}

    def range(self, minutes: int, table: Optional[str] = None) -> List[Dict[str, Any]]:
        table_name = table or self.table_default
        if minutes <= 0:
            return []
        dev = self._open()
        now_logger = dev.gettime()
        start = now_logger - datetime.timedelta(minutes=minutes)
        rows = dev.get_data(table_name, start, now_logger) or []
        return [self._clean_record(r) for r in rows]


