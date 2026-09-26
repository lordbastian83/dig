# Memory

## Me
LordBastian (GitHub: lordbastian83), Vault Money (www.vaultmoney.io). This repo started as the
`dig` Cosmos chain; active work is now the LordBastian trading-signal and
bloodstock projects below.

## Projects
| Name | What | Where |
|------|------|-------|
| **Signals / budsignal** | LordBastian swing-signal dashboard (crypto, gold, US30, GBP/USD) + Telegram alerts, intel desk, news wire, opportunity scanner | `budsignal/` → GitHub Pages |
| **lean** | QuantConnect port of the funded streams, for independent cross-validation | `budsignal/lean/` |
| **Bloodstock** | "Find the next Imperial Emperor": scanner for elite-pedigree horses to buy cheap and race on dirt at Meydan | `bloodstock/`, app in `bloodstock/app/` → Azure Static Web Apps |
| **dig** (legacy) | Cosmos SDK hub chain (Go), Vue + Flutter clients, Pi image | `app/`, `cmd/`, `vue/`, `flutter/`, `.pi/` |

## Terms
| Term | Meaning |
|------|---------|
| ledger | Tracked record of every fired signal and its resolution |
| scalp stream | Validated 1h signal stream (hourly job) |
| swing-55 | Daily swing strategy variant used in research |
| intel desk | Macro calendar, Congress trades, insiders, Polymarket |
| wire / news floor | RSS + web news feed pages |
| screen / 6 filters | Bloodstock replication screen (`imperial-emperor-replication-screen.md`) |
| max bid / hard limit | Computed bid cap in guineas (56,000 gns clean vet) |
| radar / watch | Daily bloodstock scan and catalogue page watcher |
| calibration | Bloodstock backtest (`backtest.mjs`), monthly |
| gns | Guineas (£1.05) |

## How the code works
- Front-ends are static, dependency-free HTML/JS: no build step, no backend.
- `budsignal/engine.js` is shared by the site and `notify.mjs`: change rules once.
- Signals use closed candles only and must never repaint. Track records are
  computed from the rules, never curated.
- Jobs are Node 22 `.mjs` scripts run by cron in `.github/workflows/`
  (`budsignal-*`, `bloodstock-*`, `market-snapshot`, `opportunities`).
- Data: Binance → Coinbase (crypto); FMP → Twelve Data (gold/indices/FX);
  ORTEX; The Racing API; Tattersalls catalogue scrapes.
- Secrets live only in Actions secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `FMP_API_KEY`, `ORTEX_API_KEY`, `RACING_API_USERNAME`/`PASSWORD`,
  `ANTHROPIC_API_KEY`, `AZURE_STATIC_WEB_APPS_API_TOKEN_BLOODSTOCK`.
  Browser-side keys stay in localStorage. Never commit keys.
- A failing notifier (e.g. blocked Telegram chat) must never freeze the ledger.

## Conventions
- One PR per change, squash-merged, title prefixed by area
  (`intel:`, `notify:`, `Scanner:`, `LordBastian signals:`, `research:`, `lean:`).
- Project skills live in `.claude/skills/` (see its README).

## Preferences
- Evidence over assertion: measure the value of a filter against a baseline.
- Plain-English explanations. Never present outputs as financial advice.

→ Add new terms, people and project detail here, or in `memory/` once this
file grows past ~100 lines.
