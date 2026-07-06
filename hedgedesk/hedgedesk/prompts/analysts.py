"""The 7 analyst seats.

Each spec pairs a *seat* with the OpenBB data slice it consumes and the specific
lens it must apply. The orchestrator instantiates one agent per spec and runs
all seven in parallel — this list is the single source of truth for "who is on
the analyst desk". Add a seat here and it joins the fan-out automatically.
"""

from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class AnalystSpec:
    key: str          # stable id used in registry + audit
    seat: str         # human name of the seat
    slice: str        # OpenBBGateway slice it reads
    mandate: str      # the lens / what it must judge


ANALYST_SPECS: tuple[AnalystSpec, ...] = (
    AnalystSpec(
        "technical", "Technical Analyst", "technical",
        "Momentum, moving-average posture (price vs 50/200-day), RSI regime, "
        "and price action. Is trend and momentum with us or against us right now?",
    ),
    AnalystSpec(
        "fundamentals", "Fundamentals Analyst", "fundamentals",
        "Valuation (P/E), earnings power (EPS), and margin quality (gross & net "
        "margin, revenue growth). Is this a good business at a defensible price?",
    ),
    AnalystSpec(
        "estimates", "Estimates Analyst", "estimates",
        "Sell-side ratings and consensus price targets. Where does the Street sit "
        "versus spot, and is sentiment crowded or contrarian?",
    ),
    AnalystSpec(
        "news_sentiment", "News/Sentiment Analyst", "news",
        "Recent headlines. Score net sentiment (-1..+1), flag catalysts and "
        "narrative risk. Distinguish durable news from noise.",
    ),
    AnalystSpec(
        "flow_ownership", "Flow/Ownership Analyst", "flow",
        "Institutional ownership breadth, short interest, and days-to-cover. Who "
        "is positioned, and is there squeeze or distribution risk?",
    ),
    AnalystSpec(
        "options", "Options Analyst", "options",
        "Implied volatility level, put/call ratio, and options flow. What is the "
        "options market pricing for magnitude and direction?",
    ),
    AnalystSpec(
        "macro", "Macro Analyst", "macro",
        "Treasury yields, VIX, and sector backdrop. Is the macro regime a "
        "tailwind or a headwind for this kind of asset today?",
    ),
)

ANALYST_SYSTEM = (
    "You are the {seat} on a systematic hedge-fund analyst desk. You cover ONE "
    "lens and stay in it — do not opine outside your mandate. Ground every claim "
    "in the numbers provided; if a field is null, treat it as unknown and lower "
    "your conviction accordingly. Be blunt about your own uncertainty."
)

ANALYST_PROMPT = """Ticker under review: {ticker}

Your mandate:
{mandate}

Data pulled from OpenBB for your lens ({slice} slice):
{data}

Deliver your read:
- signal: BULLISH / BEARISH / NEUTRAL for a swing-to-position horizon.
- conviction: 0.0–1.0. Anchor it: 0.5 = genuinely balanced, >0.7 only when the
  data in YOUR lens is clearly one-sided. Degraded/synthetic data caps you at 0.5.
- key_points: at most 4, each citing a specific number you were given.
- risks: what in your own lens could make you wrong.
- metrics: echo back the 2–4 numbers most load-bearing to your call.
"""


def analyst_prompt(spec: AnalystSpec, ticker: str, data: dict) -> str:
    return ANALYST_PROMPT.format(
        ticker=ticker,
        mandate=spec.mandate,
        slice=spec.slice,
        data=json.dumps(data, indent=2, default=str),
    )
