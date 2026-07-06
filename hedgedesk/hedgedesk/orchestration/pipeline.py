"""The four-phase desk pipeline — the wiring guide, in code.

    Phase 1  Research    : 7 analysts, in parallel, off OpenBB data
    Phase 2  Committee   : Bull vs Bear debate -> adjudicated result
    Phase 3  Execution   : Trader -> Risk Manager -> Fund Manager verdict
    Phase 4  Valuation   : blended DCF + exit-multiple + Monte Carlo range

Hermes wraps the whole thing: it injects the learned prior before Phase 2 and
captures the full ``DeskRun`` after the verdict. One call, ``DeskPipeline.run``,
takes a ticker and returns a signed, audited ``DeskRun``.
"""

from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from ..agents import DebateModerator, FundManager, RiskManager, Trader, build_analyst_desk
from ..config import Settings, get_settings
from ..data.openbb_gateway import OpenBBGateway
from ..hermes.orchestrator import Hermes
from ..llm.client import ClaudeClient
from ..portfolio.valuation import blended_valuation
from .schemas import AnalystReport, DeskRun, Verdict, VerdictType

log = logging.getLogger("hedgedesk.pipeline")


class DeskPipeline:
    def __init__(
        self,
        settings: Settings | None = None,
        llm: ClaudeClient | None = None,
        gateway: OpenBBGateway | None = None,
        hermes: Hermes | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.llm = llm or ClaudeClient(self.settings)
        self.gateway = gateway or OpenBBGateway(self.settings)
        self.hermes = hermes or Hermes(self.settings)

        # Instantiate the org chart once; reuse across tickers.
        self.analysts = build_analyst_desk(self.llm)
        self.moderator = DebateModerator(self.llm, rounds=self.settings.debate_rounds)
        self.trader = Trader(self.llm)
        self.risk = RiskManager(self.llm, self.settings.risk)
        self.fund_manager = FundManager(self.llm)

    # ------------------------------------------------------------------- run
    def run(self, ticker: str, portfolio: dict | None = None) -> DeskRun:
        portfolio = portfolio or _empty_book()
        run = DeskRun(run_id=uuid.uuid4().hex[:12], ticker=ticker)
        log.info("desk run %s starting for %s", run.run_id, ticker)

        data = self.gateway.full(ticker)

        # ---- Phase 1: analyst desk in parallel ----
        run.analyst_reports = self._phase1(ticker, data)

        # ---- Phase 2: committee debate (Hermes prior injected) ----
        run.debate = self.moderator.run(ticker, run.analyst_reports)

        # ---- Phase 4 (computed before verdict so FM sees the range) ----
        run.valuation = self._phase4(ticker, data)

        # ---- Phase 3: execution chain ----
        run.ticket = self.trader.run(
            ticker, run.debate, data["technical"], portfolio
        )
        regime = {"macro": data["macro"], "options": data["options"]}
        run.risk = self.risk.run(run.ticket, portfolio, regime)
        run.verdict = self.fund_manager.run(
            ticker, run.debate, run.ticket, run.risk, run.valuation
        )
        run.verdict.audit_id = run.run_id
        run.finished_at = run.verdict.created_at

        # ---- Hermes: capture for learning ----
        self.hermes.capture(run)
        log.info(
            "desk run %s -> %s conv %s/10",
            run.run_id, run.verdict.verdict.value, run.verdict.conviction_score,
        )
        return run

    # ---------------------------------------------------------------- phases
    def _phase1(self, ticker: str, data: dict) -> list[AnalystReport]:
        """Fan the 7 analysts out concurrently; each reads only its slice."""
        reports: list[AnalystReport] = []
        with ThreadPoolExecutor(max_workers=self.settings.analyst_concurrency) as pool:
            futures = {
                pool.submit(a.run, ticker, data[a.spec.slice]): a for a in self.analysts
            }
            for fut in futures:
                a = futures[fut]
                try:
                    reports.append(fut.result())
                except Exception as exc:  # one seat failing must not sink the run
                    log.warning("analyst %s failed: %s", a.name, exc)
        return reports

    def _phase4(self, ticker: str, data: dict):
        """Best-effort valuation from whatever fundamentals OpenBB returned."""
        f = data["fundamentals"]
        t = data["technical"]
        # Prefer live realized vol (works for crypto too); fall back to option IV.
        vol = t.get("realized_vol") or data["options"].get("atm_iv") or 0.30
        # DCF/exit-multiple are meaningless without real cash flows (crypto, or an
        # equity whose fundamentals fell through to synthetic) -> Monte-Carlo only.
        reliable = not f.get("_synthetic") and f.get("eps") is not None
        try:
            return blended_valuation(
                ticker,
                spot=float(t.get("last") or 100.0),
                fcf_per_share=float(f.get("eps") or 3.0) * 0.8,  # crude FCF proxy
                eps=float(f.get("eps") or 3.0),
                # With no fundamentals, use a driftless GBM (median ≈ spot) — an
                # honest "no directional view" prior rather than a borrowed growth.
                growth=(float(f.get("revenue_growth") or 0.08) or 0.08) if reliable else 0.0,
                vol=float(vol) or 0.30,
                fundamentals_reliable=reliable,
            )
        except Exception as exc:
            log.warning("valuation failed for %s: %s", ticker, exc)
            return None


def _empty_book() -> dict:
    return {
        "gross_exposure": 0.0,
        "net_exposure": 0.0,
        "daily_drawdown_pct": 0.0,
        "sector_exposure": {},
        "ticker_sector": {},
        "positions": [],
    }
