"""The always-on desk service — what runs 24/7 on Azure.

Two things in one process:

1. A background worker thread that runs the committee over the universe on a
   fixed cadence (and, separately, sweeps open positions for exits).
2. A tiny stdlib HTTP server (no framework dependency) exposing:
     GET /health   -> 200 liveness probe (Azure Container Apps health check)
     GET /status   -> desk state: universe, cadence, per-ticker last run/error
     GET /verdicts -> the most recent signed verdicts from the audit ledger

Design for uptime: the HTTP server starts FIRST and stays up even if committee
runs fail (missing API key, a flaky provider). A run failing for one ticker is
logged into /status and the loop continues — the service never crashes on a bad
tick, so the liveness probe stays green and you can see what's wrong.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .config import get_settings
from .orchestration.pipeline import DeskPipeline

log = logging.getLogger("hedgedesk.service")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DeskState:
    """Thread-safe snapshot of what the worker is doing, surfaced via /status."""

    def __init__(self, universe: list[str], every_min: int) -> None:
        self._lock = threading.Lock()
        self.started_at = _now()
        self.universe = universe
        self.every_min = every_min
        self.cycles = 0
        self.last_cycle_at: str | None = None
        self.per_ticker: dict[str, dict] = {t: {"state": "pending"} for t in universe}

    def record(self, ticker: str, **fields) -> None:
        with self._lock:
            self.per_ticker[ticker] = {"updated_at": _now(), **fields}

    def cycle_done(self) -> None:
        with self._lock:
            self.cycles += 1
            self.last_cycle_at = _now()

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "started_at": self.started_at,
                "universe": self.universe,
                "cadence_minutes": self.every_min,
                "cycles_completed": self.cycles,
                "last_cycle_at": self.last_cycle_at,
                "tickers": dict(self.per_ticker),
            }


class DeskService:
    def __init__(
        self,
        universe: list[str] | None = None,
        every_min: int | None = None,
        port: int | None = None,
        pipeline: DeskPipeline | None = None,
    ) -> None:
        settings = get_settings()
        self.universe = universe or _default_universe()
        self.every_min = every_min or int(os.getenv("HEDGEDESK_EVERY_MIN", "240"))
        self.port = port or int(os.getenv("PORT", "8080"))
        self.pipeline = pipeline or DeskPipeline(settings)
        self.state = DeskState(self.universe, self.every_min)
        self._stop = threading.Event()

    # ------------------------------------------------------------- worker loop
    def _run_once(self, ticker: str) -> None:
        try:
            self.state.record(ticker, state="running")
            run = self.pipeline.run(ticker)
            v = run.verdict
            self.state.record(
                ticker, state="ok", run_id=run.run_id,
                verdict=v.verdict.value if v else None,
                conviction=v.conviction_score if v else None,
                source=run.analyst_reports[0].metrics.get("_source") if run.analyst_reports else None,
            )
            log.info("%s -> %s %s/10", ticker,
                     v.verdict.value if v else "?", v.conviction_score if v else "?")
        except Exception as exc:  # never let one ticker kill the loop
            self.state.record(ticker, state="error", error=str(exc)[:300])
            log.exception("run failed for %s", ticker)

    def _worker(self) -> None:
        log.info("worker started: %s every %d min", self.universe, self.every_min)
        while not self._stop.is_set():
            ordered = self.pipeline.hermes.route(self.universe)
            for ticker in ordered:
                if self._stop.is_set():
                    break
                self._run_once(ticker)
            self.state.cycle_done()
            # Interruptible sleep so shutdown is prompt.
            self._stop.wait(self.every_min * 60)

    # ------------------------------------------------------------- http server
    def _handler(self):
        service = self

        class Handler(BaseHTTPRequestHandler):
            def _send(self, code: int, body: dict) -> None:
                payload = json.dumps(body, default=str).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def do_GET(self):  # noqa: N802
                if self.path.startswith("/health"):
                    self._send(200, {"status": "ok", "time": _now()})
                elif self.path.startswith("/status"):
                    self._send(200, service.state.snapshot())
                elif self.path.startswith("/verdicts"):
                    self._send(200, {"verdicts": service._recent_verdicts()})
                else:
                    self._send(404, {"error": "not found",
                                     "routes": ["/health", "/status", "/verdicts"]})

            def log_message(self, *args):  # silence default stderr spam
                return

        return Handler

    def _recent_verdicts(self, limit: int = 20) -> list[dict]:
        runs = list(self.pipeline.hermes.audit.iter_runs())[-limit:]
        return [
            {
                "run_id": r.run_id, "ticker": r.ticker,
                "verdict": r.verdict.verdict.value if r.verdict else None,
                "conviction": r.verdict.conviction_score if r.verdict else None,
                "at": r.finished_at,
            }
            for r in reversed(runs)
        ]

    # ------------------------------------------------------------------- serve
    def serve(self) -> None:
        server = ThreadingHTTPServer(("0.0.0.0", self.port), self._handler())
        worker = threading.Thread(target=self._worker, name="desk-worker", daemon=True)
        worker.start()
        log.info("health/status server on :%d", self.port)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            self._stop.set()
            server.shutdown()


def _default_universe() -> list[str]:
    env = os.getenv("HEDGEDESK_UNIVERSE")
    if env:
        return [t.strip() for t in env.split(",") if t.strip()]
    # Fall back to the configured watchlist (config/universe.yaml).
    try:
        import yaml
        from .config import CONFIG_DIR
        data = yaml.safe_load((CONFIG_DIR / "universe.yaml").read_text()) or {}
        wl = data.get("watchlist") or []
        if wl:
            return wl
    except Exception:
        pass
    return ["AAPL", "MSFT", "NVDA", "BTC_USDT", "ETH_USDT"]
