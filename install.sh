#!/usr/bin/env bash
#
# install.sh — build and set up a `dig` node (digd)
#
# This automates the manual steps described in networks/testnet-3/README.md:
#   * checks prerequisites (git, go, a C compiler, jq)
#   * builds and installs the `digd` binary with `go install ./...`
#   * initialises the node home directory (~/.dig) with your moniker
#   * installs the network genesis file
#
# Usage:
#   ./install.sh [options]
#
# Options:
#   -m, --moniker <name>     Public validator/node name (default: current hostname)
#   -c, --chain-id <id>      Chain id to init against (default: dig-testnet-3)
#   -n, --network <name>     Network dir under networks/ for genesis (default: testnet-3)
#       --home <path>        Node home directory (default: ~/.dig)
#       --build-only         Only build & install digd; skip node init and genesis
#       --skip-build         Skip building; only init the node and place genesis
#   -y, --yes                Non-interactive; assume "yes" and overwrite existing config
#   -h, --help               Show this help and exit
#
# Environment overrides:
#   DIG_MONIKER, DIG_CHAIN_ID, DIG_NETWORK, DIG_HOME
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Pretty output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD="$(tput bold)"; RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"; RESET="$(tput sgr0)"
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

info()  { printf '%s==>%s %s\n' "${BLUE}${BOLD}" "${RESET}" "$*"; }
ok()    { printf '%s ok %s %s\n' "${GREEN}${BOLD}" "${RESET}" "$*"; }
warn()  { printf '%swarn%s %s\n' "${YELLOW}${BOLD}" "${RESET}" "$*" >&2; }
die()   { printf '%serr %s %s\n' "${RED}${BOLD}" "${RESET}" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Defaults & argument parsing
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MONIKER="${DIG_MONIKER:-$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo dig-node)}"
CHAIN_ID="${DIG_CHAIN_ID:-dig-testnet-3}"
NETWORK="${DIG_NETWORK:-testnet-3}"
DIG_HOME="${DIG_HOME:-$HOME/.dig}"
BUILD_ONLY=false
SKIP_BUILD=false
ASSUME_YES=false

# Print the leading comment block (everything from the line after the shebang
# up to, but not including, the first non-comment line).
usage() {
  awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' "$0"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--moniker)   MONIKER="${2:?--moniker needs a value}"; shift 2 ;;
    -c|--chain-id)  CHAIN_ID="${2:?--chain-id needs a value}"; shift 2 ;;
    -n|--network)   NETWORK="${2:?--network needs a value}"; shift 2 ;;
    --home)         DIG_HOME="${2:?--home needs a value}"; shift 2 ;;
    --build-only)   BUILD_ONLY=true; shift ;;
    --skip-build)   SKIP_BUILD=true; shift ;;
    -y|--yes)       ASSUME_YES=true; shift ;;
    -h|--help)      usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_prereqs() {
  info "Checking prerequisites"
  local missing=0

  if ! command -v git >/dev/null 2>&1; then
    warn "git not found"; missing=1
  fi

  if ! command -v go >/dev/null 2>&1; then
    warn "go not found — install Go 1.17+ from https://go.dev/dl/"
    missing=1
  else
    local gover
    gover="$(go version | awk '{print $3}' | sed 's/^go//')"
    ok "go ${gover}"
  fi

  # A C compiler is required for the CGO-based dependencies (e.g. rocksdb/leveldb).
  if ! command -v gcc >/dev/null 2>&1 && ! command -v cc >/dev/null 2>&1; then
    warn "no C compiler (gcc/cc) found — on Ubuntu: apt-get install build-essential; on Arch: pacman -S gcc"
    missing=1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    warn "jq not found (needed by some helper scripts) — install with your package manager"
    # jq is not strictly required for a build, so this is a soft warning only.
  fi

  [ "$missing" -eq 0 ] || die "missing required tools; install them and re-run"
  ok "prerequisites satisfied"
}

# ---------------------------------------------------------------------------
# GOPATH / PATH resolution
# ---------------------------------------------------------------------------
resolve_gobin() {
  GOBIN="$(go env GOBIN)"
  if [ -z "$GOBIN" ]; then
    GOBIN="$(go env GOPATH)/bin"
  fi
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
build_digd() {
  info "Building digd (this can take several minutes on low-powered hardware)"
  ( cd "$SCRIPT_DIR" && go install ./... )
  resolve_gobin
  if [ ! -x "$GOBIN/digd" ] && ! command -v digd >/dev/null 2>&1; then
    die "build finished but 'digd' was not found in $GOBIN or PATH"
  fi
  ok "digd installed to ${GOBIN}/digd"

  case ":$PATH:" in
    *":$GOBIN:"*) : ;;
    *) warn "$GOBIN is not on your PATH. Add it with:"
       printf '      export PATH=\"%s:$PATH\"\n' "$GOBIN" ;;
  esac
}

# Return a runnable path to digd (prefers freshly built binary).
digd_bin() {
  if [ -n "${GOBIN:-}" ] && [ -x "$GOBIN/digd" ]; then
    echo "$GOBIN/digd"
  elif command -v digd >/dev/null 2>&1; then
    command -v digd
  else
    die "digd not found; run without --skip-build, or add GOPATH/bin to PATH"
  fi
}

# ---------------------------------------------------------------------------
# Node init + genesis
# ---------------------------------------------------------------------------
init_node() {
  local digd; digd="$(digd_bin)"
  local genesis_src="$SCRIPT_DIR/networks/$NETWORK/genesis.json"

  [ -f "$genesis_src" ] || die "genesis file not found: $genesis_src (check --network)"

  info "Initialising node '$MONIKER' (chain-id: $CHAIN_ID, home: $DIG_HOME)"

  local init_flags=""
  if [ -f "$DIG_HOME/config/genesis.json" ]; then
    if [ "$ASSUME_YES" = true ]; then
      init_flags="-o"
      warn "existing config found — overwriting (--yes)"
    else
      printf '%s?%s Existing config at %s. Overwrite? [y/N] ' "${YELLOW}${BOLD}" "${RESET}" "$DIG_HOME/config"
      read -r reply
      case "$reply" in
        [yY]|[yY][eE][sS]) init_flags="-o" ;;
        *) die "aborted; existing config left untouched" ;;
      esac
    fi
  fi

  # shellcheck disable=SC2086
  "$digd" init $init_flags "$MONIKER" --chain-id "$CHAIN_ID" --home "$DIG_HOME"

  info "Installing genesis from networks/$NETWORK"
  cp "$genesis_src" "$DIG_HOME/config/genesis.json"
  ok "genesis installed to $DIG_HOME/config/genesis.json"
}

# ---------------------------------------------------------------------------
# Summary / next steps
# ---------------------------------------------------------------------------
next_steps() {
  local digd; digd="$(digd_bin 2>/dev/null || echo digd)"
  printf '\n%sInstall complete.%s Next steps:\n' "${GREEN}${BOLD}" "${RESET}"
  cat <<EOF

  1. Create or import your validator keys:
       ${digd} keys add validator            # save the mnemonic somewhere safe

  2. Show your validator public key:
       ${digd} tendermint show-validator --home ${DIG_HOME}

  3. Generate a genesis transaction (for joining as a validator):
       ${digd} gentx validator 100000udig --chain-id ${CHAIN_ID} --home ${DIG_HOME}
       cp ${DIG_HOME}/config/gentx/* ${SCRIPT_DIR}/networks/${NETWORK}/

  4. Start your node:
       ${digd} start --home ${DIG_HOME}

  See networks/${NETWORK}/README.md for full validator/PR instructions.
EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  info "dig install — moniker=${MONIKER} chain-id=${CHAIN_ID} network=${NETWORK}"

  check_prereqs

  if [ "$SKIP_BUILD" = true ]; then
    warn "skipping build (--skip-build)"
    resolve_gobin
  else
    build_digd
  fi

  if [ "$BUILD_ONLY" = true ]; then
    ok "build-only requested; skipping node init"
  else
    init_node
    next_steps
  fi
}

main "$@"
