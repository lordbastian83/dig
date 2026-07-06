# Wiring Hermes: audit capture + learning from winners & losers

Hermes is the desk's memory. It answers a question a static prompt never can:
*"given how our seats have actually performed, whom should the committee trust
this time?"* This is how the loop is wired.

## The loop in one picture

```
  DeskPipeline.run(ticker)
        │  produces a full DeskRun (inputs + every agent output + verdict)
        ▼
  Hermes.capture(run) ─────────────► append-only JSONL ledger  (runs/desk-YYYY-MM-DD.jsonl)
        │                                     │
        │                                     │  (days/weeks later, position resolves)
        ▼                                     ▼
  next run's committee   ◄──── DeskPrior ◄─── Hermes.close_position(run_id, return_pct)
   (prior injected as                          rewrites that run's `outcome`, then
    a prompt preamble)                         rebuilds the prior immediately
```

Two events drive it: **capture** (write the decision) and **close** (write what
happened). Learning is just recomputing a small `DeskPrior` from every resolved
run.

## 1. Capture — the append-only audit ledger

`hermes/audit.py` writes each completed `DeskRun` as one JSON line to a per-day
file. Append-only on purpose: **an audit trail you can edit is not an audit
trail.** The record is the *entire* run — the 7 analyst reports, the full debate
transcript, the ticket, the risk memo, the verdict — so a losing trade can later
be replayed to find exactly which seat was confidently wrong.

```python
hermes = Hermes()
run = pipeline.run("NVDA")     # DeskPipeline calls hermes.capture(run) internally
# → runs/desk-2026-07-06.jsonl gains one line; run.run_id is the handle
```

The **only** permitted mutation is *adding* the resolved `outcome` later
(`update_outcome`). The decision itself is frozen.

## 2. Close — teach it what happened

When a position resolves (you hit a target, a stop, or close manually), report
the realized return. This is the learning event:

```bash
python -m hedgedesk.main learn a1b2c3d4e5f6 0.06     # that trade made +6%
```

or programmatically (e.g. from your exit engine / broker callback):

```python
hermes.close_position(run_id="a1b2c3d4e5f6", return_pct=0.06, notes="hit target")
```

`close_position` writes the outcome onto the frozen run and **immediately
rebuilds the prior**, so the very next committee is smarter.

## 3. Learn — what the prior actually computes

`hermes/memory.build_prior` streams every *resolved* run and distils
(`DeskPrior`):

- **Seat reliability** — for each analyst seat, a conviction-weighted hit rate:
  when the Technical Analyst said BULLISH with conviction 0.8 and the trade won,
  that seat earns credit proportional to its confidence. Seats that are
  *confidently wrong* are penalised most. This is the core signal — it tells the
  committee whom to weight.
- **Debate-winner edge** — the average realized return of trades taken in the
  direction the debate winner argued. If BULL-wins systematically lose money,
  the desk learns its bull case is over-optimistic.
- **Conviction calibration** — realized win rate bucketed by the Fund Manager's
  0–10 conviction score. Surfaces over/under-confidence (e.g. "our 8s only win
  55% of the time" → deflate future 8s).

## 4. Inject — close the loop into the next run

`Hermes.brief_context()` renders the prior into a one-paragraph preamble:

```
LEARNED PRIOR (from 143 resolved trades): seat hit-rates —
flow_ownership=71%, macro=64%, technical=58%, news_sentiment=44% …
Debate-winner realized edge +2.3%. Weight the more reliable seats more
heavily and discount seats that have historically been confidently wrong.
```

Prepend this to the committee/fund-manager prompts (wire it into
`DebateModerator`/`FundManager` prompt construction, or into
`ClaudeClient.DESK_SYSTEM` at run start) and the desk's judgement compounds:
sharper theses, right-sized conviction, seats trusted in proportion to their
track record — with **zero retraining**, just a recomputed prior.

## 5. Optional: hosted Hermes service

Set `HERMES_ENDPOINT` (+ `HERMES_API_KEY`) and every capture/outcome is also
mirrored to that service (`_mirror_remote`, best-effort, never blocks the desk).
Use it to run a heavier learned routing policy, share the ledger across desks, or
train a model on the audit corpus — then have `Hermes.route()` call it to
prioritise the universe. Without the endpoint, Hermes runs fully local off the
JSONL ledger and still learns.

## Why this design

- **Explainable.** The prior is arithmetic over an inspectable ledger, not a
  black box. You can always answer "why did conviction drop?"
- **Robust.** Learning is idempotent recomputation; corrupt/half-written lines
  are skipped, not fatal.
- **Honest.** Same philosophy as the existing budsignal research: performance is
  *computed from replayed history*, never curated.
