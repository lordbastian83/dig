# Architecture & Wiring Guide

This document is the "how it's wired" companion to the code. Read it top-to-
bottom to understand how a ticker becomes an audited verdict.

## Design principles

1. **One data gateway.** Every market fact enters through `OpenBBGateway`. The
   7 analysts never call OpenBB directly, so we get one login, one TTL cache
   (they run in parallel and would otherwise stampede the same endpoints), and
   one place to swap providers or add fallbacks.
2. **Typed contracts between phases.** Agents return Pydantic models, never free
   text. LLM output is validated at the boundary (`llm/client.py` forces
   tool-call JSON, validates, retries once). A hallucinated verdict raises; it
   never silently enters the audit log.
3. **Judgement vs arithmetic are separated.** The Risk Manager's *arithmetic*
   (position cap, R:R, concentration, gross exposure, drawdown breaker) runs in
   deterministic Python and **cannot be argued out of by the LLM**. The LLM adds
   only the judgement the numbers miss (correlation, liquidity, regime). A ticket
   must clear both.
4. **Degrade, don't crash.** Missing data → synthetic fallback + capped
   conviction. A single analyst throwing → logged and skipped, the run
   continues. The desk running 24/7 must survive a flaky feed.
5. **The audit log is the product.** Everything is captured so Hermes can learn
   and so any decision can be replayed after it goes wrong.

## Component map

```
config.py                 Settings + RiskLimits (env > yaml > defaults), singleton
llm/client.py             ClaudeClient — Claude Fable; complete() + complete_json(schema)
data/openbb_gateway.py    OpenBBGateway — 7 named slices, TTL cache, synthetic fallback
orchestration/schemas.py  All typed contracts (AnalystReport … DeskRun)
orchestration/pipeline.py DeskPipeline.run(ticker) — the 4-phase wiring
prompts/                  analysts / committee (Bull,Bear,Judge) / execution (Trader,Risk,FM)
agents/                   AnalystAgent×7, Bull/Bear/Moderator, Trader/Risk/FundManager
portfolio/valuation.py    Blended DCF + exit-multiple + Monte Carlo
portfolio/exit_engine.py  Trailing stops + thesis-invalidation on OPEN positions
hermes/                   audit (ledger) · memory (learned prior) · orchestrator (route+learn)
main.py                   CLI: once / watch / exits / learn
```

## Phase 1 — Analyst desk (parallel fan-out)

`DeskPipeline._phase1` submits all seven `AnalystAgent`s to a `ThreadPoolExecutor`
(`analyst_concurrency=7`). The seats are **data-driven** from `ANALYST_SPECS`:
each spec binds a seat to exactly one OpenBB slice and one mandate, so the seven
lenses stay genuinely distinct while sharing one tested code path. Add a spec →
it joins the fan-out automatically. Thread pool (not asyncio) because the OpenBB
SDK and the Anthropic SDK are sync; I/O-bound work parallelises fine on threads.

Each seat returns an `AnalystReport{signal, conviction, key_points, metrics,
risks}`. Synthetic/degraded data caps conviction at 0.5 (enforced in the prompt).

## Phase 2 — The committee debate

`DebateModerator.run` runs an **alternating** loop (`debate_rounds`, default 2):
Bull opens on the dossier → Bear rebuts *seeing the Bull's argument* → Bull
rebuts the Bear → … Each side always receives the opponent's latest turn
(`opponent_block`), so this is a real exchange, not two monologues. The Moderator
then adjudicates the transcript into a `DebateResult{winner, structural_ceiling,
synthesis}` — it scores who survived, it does not add new arguments.

The three committee prompts are written to the **institutional-fiduciary**
standard: state a thesis, cite specific dossier numbers, attack the opponent's
strongest point, and declare a falsifier. See `prompts/committee.py`.

## Phase 3 — Execution chain

```
Trader.run(debate, market, portfolio)      → TradeTicket (entry/stop/target/size)
RiskManager.run(ticket, portfolio, regime) → RiskAssessment (mechanical ∪ LLM)
FundManager.run(debate, ticket, risk, val) → Verdict (verdict + conviction/10)
```

The Trader may return `FLAT` — a respectable answer on a toss-up. The Risk
Manager merges mechanical `BLOCK`s with its LLM memo; **any BLOCK forces
`approved=False`** regardless of what the model said. The Fund Manager reconciles
debate + risk + valuation into the signed verdict and adopts the Risk Manager's
`adjusted_ticket` if one was proposed (resize-over-reject).

## Phase 4 — Valuation

`blended_valuation` runs three independent models and brackets them into a 5-year
range: low = min(DCF, MC p10), high = max(exit-multiple, MC p90). Monte Carlo uses
a fixed seed so the audit is reproducible. It runs **before** the verdict so the
Fund Manager can weigh committee conviction against model headroom — if the desk
is bullish but every path caps below spot, that tension shows up in the rationale.

The **exit engine** (`portfolio/exit_engine.py`) is separate: it runs on a
schedule over *open* positions, ratcheting trailing stops and firing
thesis-invalidation triggers. Mechanical, never LLM — a stop must fire the same
way every time.

## Extending / wiring live

- **Live data:** fill the `_OPENBB_ADAPTERS` in `openbb_gateway.py` with your
  providers/columns. The synthetic fallback shows the exact dict shape each
  slice must return.
- **Portfolio state:** replace `_empty_book()` with a real book snapshot (from
  your broker or a positions store) so the Risk Manager sees actual exposure.
- **Execution bridge:** consume the `Verdict` JSON from `main.py` and route it —
  TradingView webhook, Saxo/IBKR API, or a human approval queue.
- **TradingAgents:** the `agents/` package mirrors the TradingAgents topology; to
  adopt their library directly, implement `Agent.run` seams against their nodes.
