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

## Feature parity map — vs a full CV bloodstock platform (e.g. their 7 modules)
| Their module | Vault racing status | To reach parity |
|---|---|---|
| **Sales Intelligence** (catalogue analysis, lot ranking) | ✅ Sale shopping list — every lot scored, ranked, BUY/OVER vs guide | Live catalogue feed so it fills itself (Priority 1) |
| **Pedigree Analysis** (nicking, dosage, female family) | ◑ dirt-nick score built; dosage + female-family strength to add | Pedigree data licence (Weatherbys/RP) for verified 5-gen + chef-de-race points → true Dosage Index/Profile |
| **Sale Inspection** (CV conformation/biomechanics) | ◑ manual conformation scorer (enter observations → graded, feeds vet call) | **Computer-vision pose model** — the real moat. Needs an ML service (see below); UI + scoring already in place to receive it |
| **Training Analysis** (stride, breeze, GPS) | ✗ not built | GPS/sectional feed (TPD, StrideMASTER) + a breeze biomechanics model |
| **Market Reports / analytics** | ◑ at-a-glance dashboard strip | A market-data feed for trend/avg-price-by-house/ROI-by-cycle charts |
| **Horse Database** | ◑ radar + prospects + watchlist, synced | The pedigree/sales-history licence turns it into a full searchable DB |
| **Market Valuation & ROI** | ✅ Conservative/Base/Upside bands + ROI outlook in every profile & PDF | Real sale-price comps sharpen the bands |
| **Advisory** | — human, out of software scope | — |

## Computer-vision biomechanics (their moat) — how we'd add it honestly
Pose-estimation of a horse from photos/video (joint angles, stride length,
extension, symmetry, conformation angles) is a machine-learning task — it
cannot be faked in the static app. To add it for real:
- A **horse-pose model** (e.g. an animal-pose estimator such as a
  DeepLabCut/ViTPose model fine-tuned on horses, or a vendor CV API) running
  as a service; the app uploads a photo/clip and receives keypoints + angles.
- We already score conformation from angle inputs, so the model's output
  drops straight into the existing `conformationScore` and profile section —
  no UI rework, just swap manual entry for detected angles.
- **Dosage** (speed/stamina aptitude): computable once we have verified
  4–5-generation pedigrees with chef-de-race classifications — a data licence,
  not ML.

## Credentials needed (when we integrate)
Add as GitHub Actions secrets, same pattern as `RACING_API_*`:
- catalogue/results data licence key(s)
- pedigree provider key (Weatherbys / RP / TrueNicks)
- TPD feed key
Ask before scraping any site — check each house's terms; several license
their data and a paid feed is cleaner (and legal) than scraping.
