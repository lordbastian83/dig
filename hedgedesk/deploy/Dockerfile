# 24/7 desk container. Build from the hedgedesk/ directory:
#   docker build -f deploy/Dockerfile -t hedgedesk .
FROM python:3.11-slim

WORKDIR /app

# System deps some OpenBB providers need (numpy/pandas wheels are prebuilt).
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt README.md ./
COPY hedgedesk ./hedgedesk
COPY config ./config

RUN pip install --no-cache-dir -e ".[data,hermes]"

# Persist the audit ledger on a mounted volume so learning survives restarts.
ENV HEDGEDESK_MODEL=claude-fable-5
VOLUME ["/app/runs"]

# Default: run the committee loop 24/7 over the watchlist every 4h.
ENTRYPOINT ["python", "-m", "hedgedesk.main"]
CMD ["watch", "AAPL", "MSFT", "NVDA", "--every-min", "240"]
