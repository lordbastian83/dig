#!/usr/bin/env bash
# Run the desk locally with ONE command. No Azure, no API key required.
#
#   ./run.sh                      # serve on http://localhost:8080 over the default universe
#   ./run.sh once BTC_USDT AAPL   # one committee pass, print verdicts, exit
#
# With no ANTHROPIC_API_KEY the desk runs in heuristic mode (rule-based verdicts
# on live data). Export the key to upgrade to the full Claude Fable committee:
#   export ANTHROPIC_API_KEY=sk-ant-...   then re-run.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "▸ First run: creating virtualenv and installing…"
  python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -e ".[data]"
fi

CMD="${1:-serve}"; shift || true
if [[ "$CMD" == "serve" ]]; then
  echo "▸ Desk serving on http://localhost:${PORT:-8080}  (GET /health /status /verdicts)"
  exec ./.venv/bin/python -m hedgedesk.main serve "$@"
else
  exec ./.venv/bin/python -m hedgedesk.main "$CMD" "$@"
fi
