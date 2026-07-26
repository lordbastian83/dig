# LordBastian Bloodstock

The Dubai diamond-in-the-rough programme: find the next Imperial Emperor —
an elite-pedigree cast-off bought before the ring prices in the dirt upside —
and send it to Meydan.

## Contents

- **`investment-analysis-2026-07.md`** — the July 2026 market prospectus:
  sourced sale statistics, the four-pillar analysis and the EV models behind
  every max-bid limit.
- **`imperial-emperor-replication-screen.md`** — the 6-filter shopping list
  and the ~£60k valuation math (hard limit 56,000 gns clean vet / 45,000 gns
  incomplete).
- **`app/`** — the **Bloodstock Scanner**: a static, dependency-free web app
  (same pattern and palette as `budsignal/`) that turns the screen into a
  workflow tool:
  - the 6-filter shopping list, always on screen
  - score any lot → PASS/REJECT plus a computed hard max bid in guineas,
    with the math shown
  - watchlist with status pipeline (watch → shortlist → vet ordered → bid →
    bought/passed), persisted in localStorage, CSV export and JSON
    backup/restore
  - sales calendar with countdowns to the key 2026 windows
  - editable model parameters (residual tree, costs, margin, budget, rating
    band) — a perfect-score lot reproduces the committed 56,000 gns limit

## Running the scanner

```sh
cd bloodstock/app
python3 -m http.server 8080   # or just open index.html
```

## Workflow

1. Catalogue drops (~early Oct for the Tattersalls Autumn HIT Sale) →
   run every plausible lot through the scanner.
2. Only 6/6 lots go to the shortlist; order vet files for those.
3. Bid to the printed limit. Never past it — the limit is the edge.
