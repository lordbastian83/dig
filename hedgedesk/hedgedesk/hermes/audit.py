"""Audit log capture — the raw material Hermes learns from.

Every desk run is written to an append-only JSONL ledger (one file per day) the
moment the verdict is signed. Append-only because an audit trail you can edit is
not an audit trail. The record is the full ``DeskRun`` (inputs, every agent's
output, the verdict) so a losing trade can later be replayed to find which seat
was wrong.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..config import get_settings
from ..orchestration.schemas import DeskRun


class AuditLog:
    def __init__(self, audit_dir: Path | None = None) -> None:
        self.dir = Path(audit_dir or get_settings().audit_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def _today_file(self) -> Path:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self.dir / f"desk-{day}.jsonl"

    def record(self, run: DeskRun) -> str:
        """Append a completed run; returns the path written."""
        path = self._today_file()
        with path.open("a", encoding="utf-8") as fh:
            fh.write(run.model_dump_json() + "\n")
        return str(path)

    def iter_runs(self):
        """Yield every historical run across all ledger files (for learning)."""
        for path in sorted(self.dir.glob("desk-*.jsonl")):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        yield DeskRun.model_validate_json(line)

    def update_outcome(self, run_id: str, outcome: dict) -> bool:
        """Attach realized P&L to a past run once the position resolves.

        Rewrites the ledger file containing the run (the only mutation we allow,
        and only to *add* the resolved outcome — the decision itself is frozen).
        """
        for path in sorted(self.dir.glob("desk-*.jsonl")):
            runs = [DeskRun.model_validate_json(l) for l in path.read_text().splitlines() if l.strip()]
            hit = False
            for r in runs:
                if r.run_id == run_id:
                    r.outcome = outcome
                    hit = True
            if hit:
                path.write_text("\n".join(r.model_dump_json() for r in runs) + "\n")
                return True
        return False
