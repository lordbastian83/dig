"""Phase 4 valuation: Blended DCF + Exit-Multiple + Monte Carlo.

Deterministic quant, no LLM. The Fund Manager consumes the blended 5-year range
as an independent sanity check on the debate — if the committee is bullish but
every valuation path caps below spot, that tension shows up in the verdict.

Everything is intentionally simple and transparent (you can audit every number)
rather than a black box. Swap in richer cash-flow modelling at the marked seams.
"""

from __future__ import annotations

from ..orchestration.schemas import ValuationResult

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


def discounted_cash_flow(
    fcf0: float,
    growth: float,
    discount: float,
    years: int,
    terminal_growth: float = 0.025,
    shares: float = 1.0,
) -> float:
    """Two-stage DCF -> per-share fair value.

    fcf0: trailing free cash flow. growth: near-term FCF growth. discount: WACC.
    """
    pv = 0.0
    fcf = fcf0
    for t in range(1, years + 1):
        fcf *= 1 + growth
        pv += fcf / (1 + discount) ** t
    terminal = fcf * (1 + terminal_growth) / (discount - terminal_growth)
    pv += terminal / (1 + discount) ** years
    return pv / shares


def exit_multiple_value(
    metric_per_share: float, exit_multiple: float, growth: float, years: int
) -> float:
    """Grow a per-share metric (EPS/EBITDA) and apply an exit multiple."""
    return metric_per_share * (1 + growth) ** years * exit_multiple


def monte_carlo_paths(
    spot: float,
    drift: float,
    vol: float,
    years: int,
    sims: int = 10_000,
) -> tuple[float, float, float]:
    """Geometric Brownian Motion terminal-price distribution -> (p10, p50, p90).

    Deterministic across runs (fixed seed) so the audit log is reproducible —
    the desk's honesty principle: the same inputs must yield the same numbers.
    """
    if np is None:  # graceful fallback: crude lognormal approximation
        import math
        mu = (drift - 0.5 * vol**2) * years
        sig = vol * math.sqrt(years)
        p50 = spot * math.exp(mu)
        return (p50 * math.exp(-1.2816 * sig), p50, p50 * math.exp(1.2816 * sig))

    rng = np.random.default_rng(seed=42)
    z = rng.standard_normal(sims)
    terminal = spot * np.exp((drift - 0.5 * vol**2) * years + vol * (years**0.5) * z)
    return (
        float(np.percentile(terminal, 10)),
        float(np.percentile(terminal, 50)),
        float(np.percentile(terminal, 90)),
    )


def blended_valuation(
    ticker: str,
    *,
    spot: float,
    fcf_per_share: float,
    eps: float,
    growth: float = 0.08,
    discount: float = 0.10,
    exit_multiple: float = 18.0,
    vol: float = 0.30,
    years: int = 5,
    fundamentals_reliable: bool = True,
) -> ValuationResult:
    """Combine the models into one 5-year target range.

    The blend is deliberately conservative: the low is the min of the DCF and the
    Monte Carlo p10; the high is the max of the exit-multiple case and the MC p90.
    That brackets the committee's thesis with a model-driven range it must beat.

    ``fundamentals_reliable=False`` (e.g. crypto, or an equity with no real EPS/FCF)
    drops the DCF and exit-multiple legs — they are meaningless without cash flows —
    and returns a Monte-Carlo-only range. Honest beats precise-looking-but-wrong.
    """
    if not fundamentals_reliable:
        # No cash-flow view: present a vol cone centered on spot. Choosing
        # drift = ½σ² cancels GBM volatility drag so the median sits at today's
        # price — an honest "we don't know the direction, here's the dispersion".
        p10, p50, p90 = monte_carlo_paths(spot, drift=0.5 * vol**2, vol=vol, years=years)
        return ValuationResult(
            ticker=ticker,
            dcf_target=None,
            exit_multiple_target=None,
            monte_carlo_p10=round(p10, 2),
            monte_carlo_p50=round(p50, 2),
            monte_carlo_p90=round(p90, 2),
            blended_low=round(p10, 2),
            blended_high=round(p90, 2),
            horizon_years=years,
            notes=(
                f"Monte-Carlo only (no reliable cash flows for {ticker}; DCF/exit-"
                f"multiple omitted). Spot={spot:.0f} → 5y p50={p50:.0f} "
                f"({(p50 / spot - 1) * 100:+.0f}%), range p10–p90 "
                f"[{p10:.0f}, {p90:.0f}] at {vol:.0%} annualized vol."
            ),
        )

    p10, p50, p90 = monte_carlo_paths(spot, drift=growth, vol=vol, years=years)
    dcf = discounted_cash_flow(fcf_per_share, growth, discount, years, shares=1.0)
    exitv = exit_multiple_value(eps, exit_multiple, growth, years)
    low = min([c for c in (dcf, p10) if c and c > 0], default=None)
    high = max([c for c in (exitv, p90) if c and c > 0], default=None)

    return ValuationResult(
        ticker=ticker,
        dcf_target=round(dcf, 2),
        exit_multiple_target=round(exitv, 2),
        monte_carlo_p10=round(p10, 2),
        monte_carlo_p50=round(p50, 2),
        monte_carlo_p90=round(p90, 2),
        blended_low=round(low, 2) if low else None,
        blended_high=round(high, 2) if high else None,
        horizon_years=years,
        notes=(
            f"Blended from DCF={dcf:.0f}, exit-mult={exitv:.0f}, MC p50={p50:.0f}. "
            f"Spot={spot:.0f} → implied 5y upside "
            f"{(p50 / spot - 1) * 100:+.0f}% at median."
        ),
    )
