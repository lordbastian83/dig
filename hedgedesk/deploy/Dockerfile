# Production image for the 24/7 desk service.
# Build from the hedgedesk/ directory:
#   docker build -f deploy/Dockerfile -t hedgedesk .
# OpenBB is heavy and optional — live data works without it (yfinance + Crypto.com).
# Opt in with:  docker build --build-arg INSTALL_OPENBB=1 -f deploy/Dockerfile -t hedgedesk .
FROM python:3.11-slim

ARG INSTALL_OPENBB=0
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt README.md ./
COPY hedgedesk ./hedgedesk
COPY config ./config

# Core + live data (no key needed). OpenBB only when explicitly requested.
RUN pip install --no-cache-dir -e ".[data,hermes]" \
    && if [ "$INSTALL_OPENBB" = "1" ]; then pip install --no-cache-dir "openbb>=4.3"; fi

ENV HEDGEDESK_MODEL=claude-fable-5 \
    PORT=8080 \
    PYTHONUNBUFFERED=1

# Audit ledger lives on a mounted volume so Hermes' learning survives restarts.
VOLUME ["/app/runs"]
EXPOSE 8080

# Liveness: the service must answer /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

# 24/7 service: committee loop + health/status HTTP endpoints.
ENTRYPOINT ["python", "-m", "hedgedesk.main"]
CMD ["serve"]
