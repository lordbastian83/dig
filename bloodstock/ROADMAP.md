# Roadmap — from scoring tool to horse-finding machine

**Goal:** the app doesn't just score lots you type in; it ranks every lot in
every catalogue by *value gap* and tells you where the diamond is.

## APIs to link, in order of payoff

| # | Feed | Cost | What it unlocks | Status |
|---|------|------|-----------------|--------|
| 1 | **BHA official ratings** (weekly spreadsheet, britishhorseracing.com) | Free, no key | Rating filter for every GB horse | Just download — wire into `ingest.mjs` |
| 2 | **The Racing API** (theracingapi.com, basic-auth REST) | Cheap monthly tier | Career starts, results history, AW-form flag, ratings trajectory for UK/IRE | Scaffolded in `ingest.mjs` — needs your credentials as Actions secrets |
| 3 | **Catalogue scrapers** (Tattersalls / Goffs / Arqana lot pages) | Free, our code | The lot list itself + pedigree text + black-type detection — the input to everything | To build; one GitHub Action per sale house, budsignal-notify pattern |
| 4 | **Past sale results** (sale-house results pages) | Free, our code | Sire medians and comp pricing → the expected-hammer-price model | To build |
| 5 | **Exchange rates** (any free FX API) | Free | gns/€/$ → one all-in £ number per lot | Trivial |
| 6 | US form (Equibase) | Commercial, pricey | Beyer-band screen for Keeneland windows | Later — manual entry for the Nov/Jan sales is fine at our volume |
| 7 | Timeform / Racing Post ratings, Weatherbys pedigrees | Commercial, no public API | Nice-to-have second opinions | Skip; catalogue black-type + BHA marks cover the screen |

No API exists for: vet files (by design — the −20% rule stays manual) and
live bidding. Nothing worth money is missing from tiers 1–5.

## Features, ranked by "finds a better horse per £ spent"

1. **Value-gap ranking (the big one).** Today the app answers "is this lot a
   BUY and at what limit?" The winning question is "which lot has the widest
   gap between my EV cap and what the ring will pay?" Build: expected-price
   model per lot (sire median × rating adjustment from feed #4) → rank all
   catalogue lots by `EV cap − expected price`. The diamond in the rough is
   literally the top of that sort.
2. **Auto-scan pipeline.** GitHub Action: catalogue drops → scraper → ingest
   → scored `lots.json` published to a data branch → app loads it on visit.
   Zero manual CSV work. Same architecture as budsignal's research workflow.
3. **Telegram alerts.** Reuse budsignal's notifier: catalogue-drop alert,
   "N lots passed the screen" summary, withdrawal alerts for shortlisted
   lots. The infra already exists in this repo.
4. **Data-driven sire tiers.** The A/B dirt-sire list is currently expert
   judgement. Compute it instead: scrape Meydan/UAE results by sire (win% of
   European imports by sire line) and re-rank annually. This is the most
   defensible edge in the whole system — nobody else is pricing sires by
   *dirt translation rate*.
5. **Honest outcome tracking (the budsignal ethos).** Log every lot the
   screen scored, what it hammered for, and its rating/earnings 12 months
   later. After one cycle you can replace the assumed probability tree
   (10/20/40/30) with measured frequencies — computed, never curated.
6. **Shared watchlist.** localStorage is single-browser. Azure Static Web
   Apps supports built-in auth + a small Functions API; or commit the
   watchlist JSON to a data branch via PR. Needed once syndicate members
   want the same list at the sale ground.
7. **All-in cost calculator.** Hammer price → +commission, VAT treatment,
   transport, insurance, per venue and currency. Makes the budget ceiling
   honest across Newmarket/Deauville/Keeneland.
8. **US rating translation.** Beyer 80–95 band mapping for the Keeneland
   windows so the same screen runs on US lots.

## Sequencing against the calendar

- **Before ~6 Oct (Autumn HIT catalogue):** #1–#3 and feeds 1–4. This is
  the set that matters — the October catalogue is the season's main event.
- **Winter:** #4 (UAE results accumulate during Carnival), #5 begins
  automatically once the first cycle's lots are logged.
- **When syndicate members join:** #6, #7.
