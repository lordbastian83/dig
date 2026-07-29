# Data the scanner needs — and where to get it

The scanner scores a lot from 13 fields. Here is exactly what each one is,
whether it can be automated, and the cheapest working source. Add whichever
feeds you can; the app accepts manual entry, bulk CSV import, and (once an
ingest feed exists) a generated `lots.json`.

## Field spec (per lot)

| # | Field | Filter it feeds | Automatable? | Best source |
|---|-------|-----------------|--------------|-------------|
| 1 | `name` | identity | ✅ | sale catalogue |
| 2 | `lot` | identity | ✅ | sale catalogue |
| 3 | `sale` | calendar | ✅ | sale catalogue |
| 4 | `sire` | F2 dirt sire line | ✅ | sale catalogue |
| 5 | `dam` (+ damsire) | F2/F3 | ✅ | sale catalogue |
| 6 | `vendor` / breeder | F1 powerhouse cast-off | ✅ | sale catalogue |
| 7 | `rating` (BHA/IFHA official) | F4 rating 85–95 | ✅ | **BHA publishes ratings free** (weekly downloadable spreadsheet at britishhorseracing.com) or The Racing API |
| 8 | `starts` (career) | F5 ≤7 starts | ✅ | The Racing API results, or Racing Post form page |
| 9 | `awForm` (AW/PSF win or best figure) | F6 dirt proxy | ✅ | derive from results: UK Tapeta/Polytrack (Newcastle, Wolverhampton, Kempton, Lingfield, Southwell, Chelmsford) **and French PSF (Deauville, Chantilly, Cagnes-sur-Mer, Pornichet)** — French PSF form is an underrated dirt proxy and French cast-offs price cheaper |
| 10 | `blackType` (first two dams) | F3 residual floor | ⚠️ partial | catalogue page shows black type in bold caps — a scraper can detect it; proper verification needs a pedigree DB (Weatherbys/commercial, no free API) |
| 11 | `sireTier` (A/B/none) | F2 | ✅ | static list maintained in the app — no feed needed |
| 12 | `vet` (clean/incomplete) | mandatory −20% rule | ❌ **never** | sale-house repository + your own vet. No API exists or ever will; this stays manual and that's the point of the rule |
| 13 | `notes` | judgement | ❌ | you, at the sale ground |

## The three feeds worth adding, in order

1. **BHA official ratings — free.** The BHA publishes the full ratings list
   as a downloadable spreadsheet, updated weekly. Covers field 7 for every
   GB-trained horse. Zero cost, zero auth.
2. **The Racing API (theracingapi.com) — cheap tier.** REST, HTTP basic
   auth. Gives horse search, full results history → fields 8 and 9 derive
   directly (count rows; flag AW courses). Store credentials as GitHub
   Actions secrets (`RACING_API_USERNAME` / `RACING_API_PASSWORD`), same
   pattern as budsignal's `FMP_API_KEY`.
3. **Catalogue scrape — free but per-sale-house work.** Tattersalls, Goffs
   and Arqana publish every lot as a public web page (plus PDF), but none
   offer an API. A small scraper per house (run in a GitHub Action when the
   catalogue drops) yields fields 1–6 and a black-type heuristic for 10.
   Until that exists, the app's **Import CSV** button does the same job from
   a hand-built sheet in minutes.

## Auto-loading catalogues (live now)

Drop a sale's catalogue as a CSV into **`bloodstock/catalogues/`** (one file
per sale, same columns as the CSV import below). On push — and daily — the
`bloodstock-catalogue.yml` workflow runs `bloodstock/catalogue.mjs`, which
parses each file, maps every row to a scored lot, optionally enriches rating
& form via The Racing API (for rows with a `horseid`), and publishes
`catalogue.json` to the `bloodstock-data` branch. The app fetches it on load
and fills the **Sale shopping list** with a sale picker — no typing. A future
per-house scraper just needs to write its output CSV into that folder; the
rest of the pipeline already exists. (`sample-tattersalls-october.csv` ships
as a worked example — delete it once real catalogues land.)

## Pipeline (mirrors budsignal's architecture)

```
catalogue (scrape or CSV)
        │
   ingest.mjs  ──  The Racing API (starts, AW form)  +  BHA ratings sheet
        │
    lots.json  →  app "Restore JSON" / Import CSV  →  scored watchlist
```

`bloodstock/ingest.mjs` is the scaffold for the middle step — it reads a
catalogue CSV, enriches each horse, and emits an app-ready JSON. Endpoints
are marked where they must be verified against The Racing API docs once you
have credentials.

## CSV import format

Header row (order-insensitive, extras ignored). Two importers use it:
**Import catalogue CSV** on the watchlist (bulk add), and the **Sale shopping
list** (scores + ranks + BUY/OVER verdict, no auto-add).

```
name,lot,sale,sire,dam,damsire,vendor,rating,starts,age,sex,sireTier,vet,powerhouse,blackType,awForm,distBest,wins,guide,notes
```

- `sireTier` = `A`/`B`/empty (auto-derived from sire/damsire if blank)
- `vet` = `clean`/`incomplete`/`unknown` · booleans accept `true/yes/1`
- `damsire` — feeds the dirt-nick score (or put it in `dam` as `Name (Damsire)`)
- `distBest` — best trip in furlongs, if known · `age`, `sex` — for Dubai fit
- `guide` — expected/guide price (any currency symbols stripped). With a guide,
  the shopping list grades each lot **BUY** (our max ≥ guide), **STRETCH**
  (within 10%), or **OVER** (market above our limit). Only the minimum
  `name` + a `sire`/`dam` is required; everything else sharpens the score.
