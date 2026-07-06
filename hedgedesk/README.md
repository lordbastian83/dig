# AI Hedge Fund Desk

A fully automated, 24/7 multi-agent investment committee. It simulates a real
fund desk — researching, debating, risk-checking, and signing off on trades —
and **learns from every run** so its theses sharpen over time.

> Educational / research scaffold. **Not financial advice.** No order is placed
> by this code; it produces audited JSON verdicts you bridge to an execution
> venue yourself.

## The stack

| Layer | Role | Where it lives |
|---|---|---|
| **Data terminal** | Multi-provider live-data chain — OpenBB (premium), Yahoo Finance (equities, no key), Crypto.com (crypto, no key), synthetic floor. Prices, fundamentals, estimates, news, flow/ownership, options, macro | `hedgedesk/data/gateway.py` + `data/providers/` |
| **TradingAgents pattern** | The agentic org chart: 7 analysts → Bull vs Bear → Trader → Risk → Fund Manager | `hedgedesk/agents/` |
| **Hermes** | Routing + learning brain: captures audits, learns from winners/losers, injects a sharpened prior | `hedgedesk/hermes/` |
| **Claude Fable** | Reasoning engine behind every seat | `hedgedesk/llm/client.py` |

## The pipeline (4 phases)

```
                         ┌─────────────── OpenBB (single data gateway) ───────────────┐
                         ▼                                                             │
 Phase 1  ANALYST DESK   Technical · Fundamentals · Estimates · News/Sentiment ·      │  parallel
                         Flow/Ownership · Options · Macro   ── 7 seats, in parallel ──┘
                         │  (dossier of 7 typed AnalystReports)
                         ▼
 Phase 2  COMMITTEE      Bull Researcher  ⇄  Bear Researcher   → Moderator adjudicates
                         │  (DebateResult: winner, structural ceiling, synthesis)
                         ▼
 Phase 3  EXECUTION      Trader → sized ticket
                         Risk Manager → mechanical limits + LLM judgement (veto)
                         Fund Manager → VERDICT (ACCUMULATE/HOLD/…), conviction /10
                         ▼
 Phase 4  VALUATION      Blended DCF + Exit-Multiple + Monte Carlo → 5y target range
                         │
                         ▼
            Hermes.capture(DeskRun)  →  append-only audit ledger  →  learned prior
```

Every arrow carries a **typed Pydantic object** (`orchestration/schemas.py`), so
a malformed LLM output fails at the boundary instead of poisoning the audit log.

## Quick start

```bash
cd hedgedesk
python -m venv .venv && . .venv/bin/activate
pip install -e .            # core deps; add ".[data]" for OpenBB
cp .env.example .env        # add ANTHROPIC_API_KEY (+ OPENBB_PAT for live data)

# Verify live data first (real indicators, no API key):
python scripts/live_check.py BTC_USDT        # live crypto via Crypto.com
python scripts/live_check.py AAPL            # live equities via yfinance

# One committee pass over a few names (equities or crypto pairs):
python -m hedgedesk.main once AAPL MSFT NVDA
python -m hedgedesk.main once BTC_USDT ETH_USDT

# 24/7 loop (re-run every 4h, matching a 4h candle cadence):
python -m hedgedesk.main watch AAPL MSFT --every-min 240

# 24/7 SERVICE with health/status endpoints (this is the Azure entrypoint):
python -m hedgedesk.main serve AAPL BTC_USDT --every-min 240 --port 8080
#   GET /health  -> liveness   GET /status -> per-ticker state   GET /verdicts

# Later, teach Hermes what actually happened (realized +6%):
python -m hedgedesk.main learn <run_id> 0.06
```

Runs **fully offline with synthetic data** when keys are absent (analysts just
report lower conviction) — so you can exercise the whole desk before wiring live
feeds. `pytest tests/` proves the wiring end-to-end with the LLM stubbed.

## Sample verdict (what the Fund Manager emits)

```json
{
  "run_id": "a1b2c3d4e5f6",
  "ticker": "NVDA",
  "verdict": "ACCUMULATE",
  "conviction": "7/10",
  "debate_winner": "BULL",
  "ticket": {"direction": "LONG", "entry": 118.0, "stop": 108.5,
             "target": 145.0, "size_pct": 0.05, "reward_to_risk": 2.84},
  "risk_approved": true,
  "valuation_5y": [132.0, 210.0],
  "rationale": "..."
}
```

This JSON is the bridge point: pipe it into TradingView alerts, a Saxo/IBKR
order router, or a human approval queue.

## Go live on Azure (one command)

```bash
az login
export ANTHROPIC_API_KEY=sk-ant-...        # required
export OPENBB_PAT=...                       # optional (premium equity data)
./deploy/azure/deploy.sh                    # builds the image in ACR, provisions, deploys
```

`deploy.sh` builds the image **server-side in ACR** (no local Docker needed),
provisions a Container Apps environment with a persistent Azure Files audit
ledger, wires your API key as a secret, and starts the service with a `/health`
probe and one always-on replica. It prints the live URL; `curl https://<fqdn>/status`
shows each ticker's latest verdict. CI/CD (`.github/workflows/hedgedesk-deploy.yml`)
keeps it updated on every push. Full runbook: [`docs/DEPLOY_AZURE.md`](docs/DEPLOY_AZURE.md).

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full design & wiring guide.
- [`docs/LIVE_DATA.md`](docs/LIVE_DATA.md) — the provider chain, indicators, and how to verify live data.
- [`docs/HERMES_LEARNING.md`](docs/HERMES_LEARNING.md) — how the audit→learn loop works.
- [`docs/DEPLOY_AZURE.md`](docs/DEPLOY_AZURE.md) — 24/7 hosting on Azure.

## Prompt templates

The institutional-fiduciary prompts for the **Bull Researcher**, **Bear
Researcher**, and **Risk Manager** live in `hedgedesk/prompts/committee.py` and
`hedgedesk/prompts/execution.py` — tune them without touching control flow.
