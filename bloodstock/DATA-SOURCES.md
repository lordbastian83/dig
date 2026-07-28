# Data sources to API in

What the scanner uses today, and what to plug in next to make it "god tier".
Priority = impact on finding the right Dubai dirt horse ÷ effort to integrate.

## Live now
- **The Racing API (Pro)** — results, horse/dam records, ratings (OR), some
  RPR/TSR. Powers the radar, off-market prospects, form, distance, going,
  courses, dam production. Regions swept: GB, IRE, FR.

## Priority 1 — biggest wins
| Source | Unlocks | Access | Notes |
|---|---|---|---|
| **Sale catalogue feeds** (Tattersalls, Goffs, Arqana, Keeneland, Inglis) | Auto-score *upcoming* lots, not just past runners — the shopping list becomes live | Mostly **no public API**; catalogues publish as web pages / downloadable PDFs/XML close to the sale. Options: (a) paste/export CSV (works today), (b) a per-sale scraper, (c) Weatherbys/ROR data licence | This is the single highest-value add: turns "score a horse I typed in" into "rank the whole October sale for me" |
| **Sale results / price history** (same houses + Tattersalls Online) | Real comps for valuation instead of sire-median estimates → tighter max bids and honest value gaps | Public results pages per sale; a scraper or a bloodstock data licence | Replaces the modelled `expectedPrice` with actual hammer prices |
| **Racing Post Bloodstock / Weatherbys GSB** | Full pedigree (4–5 generations), black-type flags verified, damline production | Commercial licence | Removes the manual "verify black type" caveat and powers a real nick engine |

## Priority 2 — sharper intelligence
| Source | Unlocks | Access |
|---|---|---|
| **TrueNicks / pedigree nick ratings** | Replace our heuristic dirt-cross score with the industry nick rating (A++ … F) for sire × broodmare-sire | Commercial API/report |
| **Total Performance Data (TPD)** | Sectional times & true speed figures — real "does it have a Meydan gear" evidence, esp. on AW | Commercial feed; UK/IRE AW + some turf |
| **Etalon / Plusvital genetics** (myostatin / speed-gene, distance aptitude) | DNA-based trip & precocity aptitude — a horse's *genetic* best distance, independent of form | Per-horse test (buyer-commissioned), not a bulk API |
| **Emirates Racing Authority / Meydan results** | Close the loop: track how our picks actually run at the Carnival, and mine what wins there | ERA results site; scraper |

## Priority 3 — operational
| Source | Unlocks | Access |
|---|---|---|
| **Wind-op / gelding / vet notes** | The vetting discount becomes data-driven | RP has some wind-op flags; most is manual at inspection |
| **Weather / going forecasts** (Meydan + UK AW) | Confirm a horse's ground is on offer in its target races | Public weather APIs |
| **FX rates** (gns/€/$) | Normalise guide prices across Tattersalls/Arqana/Keeneland to one currency | Any FX API |

## How each plugs in
- **Catalogue + results + pedigree** → new fields on the candidate/lot object
  (`guide`, verified `blackType`, `nickRating`, real comps) consumed by the
  existing engine — no UI rework, just richer inputs.
- **TPD / genetics / sectionals** → new engine terms in `dubaiFit` and a
  "speed/aptitude" section in the profile.
- Anything without an API (catalogues, sale results, ERA) → a small scraper
  in a scheduled workflow that publishes JSON to the `bloodstock-data` branch,
  exactly like `candidates.json` / `prospects.json` today.

## Credentials needed (when we integrate)
Add as GitHub Actions secrets, same pattern as `RACING_API_*`:
- catalogue/results data licence key(s)
- pedigree provider key (Weatherbys / RP / TrueNicks)
- TPD feed key
Ask before scraping any site — check each house's terms; several license
their data and a paid feed is cleaner (and legal) than scraping.
