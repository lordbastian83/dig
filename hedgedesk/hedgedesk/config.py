"""Central configuration for the AI Hedge Fund Desk.

Everything tunable — the LLM model, the analyst roster, risk limits, the data
provider credentials — is resolved here so the rest of the codebase never reads
``os.environ`` directly. Values come from (in order of precedence): explicit
constructor args, environment variables, then the YAML files under ``config/``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - yaml is a declared dependency
    yaml = None

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"


def _load_yaml(name: str) -> dict[str, Any]:
    path = CONFIG_DIR / name
    if not path.exists() or yaml is None:
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


@dataclass
class RiskLimits:
    """Hard portfolio guardrails the Risk Manager enforces mechanically.

    These are the *deterministic* backstops. They run in Python, before and
    independent of any LLM judgement, so a hallucinated ticket can never breach
    them silently.
    """

    max_position_pct: float = 0.08          # single-name cap (% of NAV)
    max_sector_pct: float = 0.25            # sector concentration cap
    max_gross_exposure: float = 1.50        # gross long+short as multiple of NAV
    max_net_exposure: float = 1.00          # directional tilt cap
    max_name_vol_annualized: float = 0.90   # skip names above this realized vol
    max_daily_drawdown_pct: float = 0.04    # circuit breaker: halt new risk
    min_reward_to_risk: float = 1.5         # ticket target/stop must clear this

    @classmethod
    def load(cls) -> "RiskLimits":
        data = _load_yaml("risk_limits.yaml")
        known = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in data.items() if k in known})


@dataclass
class Settings:
    """Top-level runtime settings for a desk session."""

    # --- LLM (Claude Fable is the reasoning engine for every agent) ---
    model: str = field(default_factory=lambda: os.getenv("HEDGEDESK_MODEL", "claude-fable-5"))
    max_tokens: int = 4096
    temperature: float = 0.2                # low: we want disciplined, not creative, judgement
    anthropic_api_key: str | None = field(
        default_factory=lambda: os.getenv("ANTHROPIC_API_KEY")
    )

    # --- Data (OpenBB is the terminal) ---
    openbb_pat: str | None = field(default_factory=lambda: os.getenv("OPENBB_PAT"))
    data_cache_ttl_seconds: int = 900       # reuse pulls within a 15m window

    # --- Committee behaviour ---
    debate_rounds: int = 2                  # bull<->bear rebuttal exchanges
    analyst_concurrency: int = 7            # run the 7 analysts in parallel

    # --- Persistence / Hermes ---
    audit_dir: Path = field(default_factory=lambda: REPO_ROOT / "runs")
    hermes_endpoint: str | None = field(default_factory=lambda: os.getenv("HERMES_ENDPOINT"))
    hermes_api_key: str | None = field(default_factory=lambda: os.getenv("HERMES_API_KEY"))

    risk: RiskLimits = field(default_factory=RiskLimits.load)

    def __post_init__(self) -> None:
        overrides = _load_yaml("settings.yaml")
        for key, value in overrides.items():
            if hasattr(self, key) and not os.getenv(f"HEDGEDESK_{key.upper()}"):
                setattr(self, key, value)
        self.audit_dir = Path(self.audit_dir)
        self.audit_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide singleton so every agent shares one config + cache."""
    return Settings()
