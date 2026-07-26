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
- **`venues-2026-27.md`** — the buying map: every venue ranked by edge,
  including the Arqana Autumn Sale (French PSF form as a dirt proxy) and why
  the ERA Dubai ring is the exit, not the entry.
- **`DATA.md`** — the full data spec: the 13 fields the scanner needs, which
  are automatable, and the three feeds worth adding (BHA ratings — free;
  The Racing API; catalogue scrapes).
- **`ingest.mjs`** — catalogue CSV → enriched `lots.json` pipeline scaffold
  (The Racing API, Actions-secret pattern like budsignal's notifier).
- **`app/`** — the **Bloodstock Scanner**: a static, dependency-free web app
  (same pattern and palette as `budsignal/`) that turns the screen into a
  workflow tool:
  - the 6-filter shopping list, always on screen
  - score any lot → PASS/REJECT plus a computed hard max bid in guineas,
    with the math shown
  - watchlist with status pipeline (watch → shortlist → vet ordered → bid →
    bought/passed), persisted in localStorage, CSV export and JSON
    backup/restore
  - **bulk catalogue import** — drop in a CSV of a whole sale catalogue and
    every lot is scored instantly (sire tier auto-derived from the pedigree
    text; see `DATA.md` for the columns)
  - sales calendar with countdowns to the key 2026 windows
  - editable model parameters (residual tree, costs, margin, budget, rating
    band) — a perfect-score lot reproduces the committed 56,000 gns limit

## Running the scanner

```sh
cd bloodstock/app
python3 -m http.server 8080   # or just open index.html
```

The scanner is a PWA: once served over HTTPS (see hosting below), open it on
your phone and "Add to Home Screen" — it installs as an app and the shell
works offline at the sales ground.

## Hosting on Azure (Static Web Apps, free tier)

The deploy workflow is `.github/workflows/bloodstock-azure.yml`. One-time
setup:

1. Azure portal → Create resource → **Static Web App** → Free plan, any
   region. Deployment source: **Other**.
2. On the created resource: **Manage deployment token** → copy it.
3. GitHub repo → Settings → Secrets and variables → Actions → new secret
   **`AZURE_STATIC_WEB_APPS_API_TOKEN_BLOODSTOCK`** = that token.
4. Run the workflow from the Actions tab (or push to `master` touching
   `bloodstock/app/**`). Your app URL is on the resource's overview page.

## Pipeline (automated)

- **`.github/workflows/bloodstock-watch.yml`** — daily page watcher;
  Telegrams (existing bot) when a sale-house page changes, i.e. a catalogue
  drops. State lives on the `bloodstock-data` branch.
- **`.github/workflows/bloodstock-ingest.yml`** — manual run: scrape a
  catalogue URL (or use `bloodstock/catalogue.csv`), enrich every lot via
  **The Racing API Pro** (secrets `RACING_API_USERNAME` /
  `RACING_API_PASSWORD` — add them in Settings → Secrets → Actions, never
  paste them in chat or code), publish scored `lots.json` to
  `bloodstock-data`.
- **`comps.mjs`** — sale results CSV → computed sire medians in
  `app/data/sire-medians.json`, replacing the labelled seed estimates. The
  app's **value gap** column (max bid − expected hammer) and **Rank by value
  gap** button turn a scored catalogue into a ranked shopping list — the
  diamond in the rough is row one.
- **`scrape-tattersalls.mjs`** — catalogue scraper; selectors are config and
  will need a 10-minute tune against live markup when the October catalogue
  drops (marked in the file).
- **`outcomes.csv`** — log every screened lot's hammer price and 12-month
  outcome; after one cycle the assumed probability tree gets replaced with
  measured frequencies. Computed, never curated.

## Workflow

1. Catalogue drops (~early Oct for the Tattersalls Autumn HIT Sale) →
   run every plausible lot through the scanner.
2. Only 6/6 lots go to the shortlist; order vet files for those.
3. Bid to the printed limit. Never past it — the limit is the edge.
