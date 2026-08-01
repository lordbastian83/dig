# House-native catalogue exports

Drop a sale house's **raw CSV export** here (headers exactly as the house
provides them — "Hip", "Broodmare Sire", "Consignor", "Estimate", etc.). The
matching entry in `../../scrapers/sources.json` maps those headers to the
app's fields via its `columns` block, so you don't rename anything.

Files here are read ONLY by the alias-aware scraper (SCRAPE=1). App-canonical
CSVs (headers already matching name,lot,sire,dam,…) go one level up in
`catalogues/` instead, where the direct scan handles them.
