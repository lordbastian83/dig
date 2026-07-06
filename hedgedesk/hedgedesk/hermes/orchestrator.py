"""Hermes orchestrator — the routing + learning brain that wraps the desk.

Hermes sits ABOVE the four-phase pipeline. Its two jobs:

1. ROUTE: decide what the desk works on and with what context. It pulls the
   learned ``DeskPrior`` from memory and injects it so each run benefits from
   every prior run. It can also prioritise the universe (e.g. re-examine names
   where a seat that is *currently reliable* flipped signal).

2. LEARN: after positions resolve, feed realized P&L back into the audit ledger
   (``close_position``) so the prior sharpens. This closes the loop —
   winning/losing trades change how the next committee is briefed.

If a real Hermes service endpoint is configured (``HERMES_ENDPOINT``), routing
decisions and priors are mirrored to it; otherwise Hermes runs fully local off
the JSONL ledger. Either way the desk learns.
"""

from __future__ import annotations

import logging

from ..config import Settings, get_settings
from ..orchestration.schemas import DeskRun
from .audit import AuditLog
from .memory import DeskPrior, build_prior

log = logging.getLogger("hedgedesk.hermes")


class Hermes:
    def __init__(self, settings: Settings | None = None, audit: AuditLog | None = None) -> None:
        self.settings = settings or get_settings()
        self.audit = audit or AuditLog(self.settings.audit_dir)
        self._prior: DeskPrior | None = None

    # ------------------------------------------------------------------ route
    def prior(self, refresh: bool = False) -> DeskPrior:
        """The learned context injected into each new run."""
        if self._prior is None or refresh:
            self._prior = build_prior(self.audit)
        return self._prior

    def brief_context(self) -> str:
        """One-paragraph learned prior to prepend to committee prompts."""
        return self.prior().as_prompt_note()

    def route(self, universe: list[str]) -> list[str]:
        """Order the universe by where the desk's learned edge is highest.

        Default: names first where our currently-reliable seats have the most to
        say. Placeholder ranking uses ticker stability; wire richer signals (a
        real Hermes policy model) at this seam.
        """
        prior = self.prior()
        if not prior.sample_size:
            return list(universe)
        # Stable, explainable ordering; replace with a learned policy over time.
        return sorted(universe)

    # ------------------------------------------------------------------ learn
    def capture(self, run: DeskRun) -> str:
        """Persist a completed run to the audit ledger."""
        path = self.audit.record(run)
        self._mirror_remote("run", run.model_dump())
        log.info("captured run %s for %s -> %s", run.run_id, run.ticker, path)
        return path

    def close_position(self, run_id: str, return_pct: float, notes: str = "") -> bool:
        """Report realized P&L for a past decision and refresh the prior.

        This is the learning event: a winning or losing trade updates seat
        reliability and debate calibration for every future run.
        """
        ok = self.audit.update_outcome(
            run_id, {"return_pct": return_pct, "notes": notes}
        )
        if ok:
            self.prior(refresh=True)  # re-learn immediately
            self._mirror_remote("outcome", {"run_id": run_id, "return_pct": return_pct})
            log.info("learned from %s: realized %.1f%%", run_id, return_pct * 100)
        return ok

    # ---------------------------------------------------------------- remote
    def _mirror_remote(self, kind: str, payload: dict) -> None:
        """Best-effort push to a hosted Hermes; never blocks the desk."""
        if not self.settings.hermes_endpoint:
            return
        try:  # pragma: no cover - network
            import httpx

            httpx.post(
                f"{self.settings.hermes_endpoint.rstrip('/')}/ingest/{kind}",
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.hermes_api_key or ''}"},
                timeout=5.0,
            )
        except Exception as exc:
            log.debug("hermes mirror (%s) skipped: %s", kind, exc)
