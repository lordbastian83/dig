"""CLI + 24/7 scheduler entry point for the desk.

    python -m hedgedesk.main once   AAPL MSFT NVDA     # one committee pass
    python -m hedgedesk.main watch  AAPL MSFT          # run every N minutes
    python -m hedgedesk.main exits                     # sweep open positions
    python -m hedgedesk.main learn  <run_id> <ret>     # feed back realized P&L

In production this process is the thing Azure keeps alive (see deploy/). It is
deliberately dependency-light: a plain loop + sleep, no Celery/airflow needed to
start. Swap ``watch`` for an Azure Container App cron or a real scheduler later.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time

from .config import get_settings
from .hermes.orchestrator import Hermes
from .orchestration.pipeline import DeskPipeline

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
)
log = logging.getLogger("hedgedesk.main")


def _print_verdict(run) -> None:
    v = run.verdict
    print(json.dumps({
        "run_id": run.run_id,
        "ticker": run.ticker,
        "verdict": v.verdict.value,
        "conviction": f"{v.conviction_score}/10",
        "debate_winner": run.debate.winner if run.debate else None,
        "ticket": v.ticket.model_dump() if v.ticket else None,
        "risk_approved": run.risk.approved if run.risk else None,
        "valuation_5y": (
            [run.valuation.blended_low, run.valuation.blended_high]
            if run.valuation else None
        ),
        "rationale": v.rationale,
    }, indent=2, default=str))


def cmd_once(pipe: DeskPipeline, tickers: list[str]) -> None:
    for t in pipe.hermes.route(tickers):
        _print_verdict(pipe.run(t))


def cmd_watch(pipe: DeskPipeline, tickers: list[str], every_min: int = 240) -> None:
    log.info("watch mode: %s every %d min", tickers, every_min)
    while True:  # the 24/7 loop
        for t in pipe.hermes.route(tickers):
            try:
                _print_verdict(pipe.run(t))
            except Exception as exc:
                log.exception("run failed for %s: %s", t, exc)
        time.sleep(every_min * 60)


def cmd_learn(hermes: Hermes, run_id: str, ret_pct: float) -> None:
    ok = hermes.close_position(run_id, ret_pct)
    print(f"learned={ok} prior={hermes.prior(refresh=True).as_prompt_note()}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="hedgedesk")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("once").add_argument("tickers", nargs="+")
    w = sub.add_parser("watch")
    w.add_argument("tickers", nargs="+")
    w.add_argument("--every-min", type=int, default=240)
    sub.add_parser("exits")
    sv = sub.add_parser("serve", help="24/7 service with /health + /status HTTP endpoints (Azure entrypoint)")
    sv.add_argument("tickers", nargs="*", help="universe (defaults to config/universe.yaml or HEDGEDESK_UNIVERSE)")
    sv.add_argument("--every-min", type=int, default=None)
    sv.add_argument("--port", type=int, default=None)
    lr = sub.add_parser("learn")
    lr.add_argument("run_id")
    lr.add_argument("return_pct", type=float)
    args = p.parse_args(argv)

    get_settings()  # validate config early
    pipe = DeskPipeline()

    if args.cmd == "once":
        cmd_once(pipe, args.tickers)
    elif args.cmd == "watch":
        cmd_watch(pipe, args.tickers, args.every_min)
    elif args.cmd == "serve":
        from .service import DeskService
        DeskService(
            universe=args.tickers or None,
            every_min=args.every_min,
            port=args.port,
            pipeline=pipe,
        ).serve()
    elif args.cmd == "exits":
        log.info("exit sweep: wire open positions from your broker/store here")
    elif args.cmd == "learn":
        cmd_learn(pipe.hermes, args.run_id, args.return_pct)
    return 0


if __name__ == "__main__":
    sys.exit(main())
