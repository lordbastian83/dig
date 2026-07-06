"""Phase 4 exit-rule engine — monitors OPEN positions, not new ideas.

Runs on a schedule (see ``main.py``) independently of the research pipeline. For
each open position it evaluates deterministic exit rules against fresh prices:

  * trailing stop (ratchets up on longs, down on shorts, never loosens),
  * hard stop / target,
  * thesis-invalidation triggers registered when the position was opened.

It emits ``ExitSignal``s; whether to act is the Fund Manager's call, but the
mechanical trigger is never left to an LLM — a trailing stop must fire the same
way every time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from ..orchestration.schemas import Direction


@dataclass
class Position:
    ticker: str
    direction: Direction
    entry: float
    stop: float
    target: float | None
    size_pct: float
    trail_pct: float = 0.05                 # trailing stop distance
    high_water: float = field(default=0.0)  # best favorable price seen
    # Named thesis-invalidation triggers: fn(context)->bool. E.g. "guidance cut".
    invalidation_triggers: dict[str, Callable[[dict], bool]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.high_water:
            self.high_water = self.entry


@dataclass
class ExitSignal:
    ticker: str
    action: str          # "EXIT" | "TIGHTEN" | "HOLD"
    reason: str
    new_stop: float | None = None


def evaluate_position(pos: Position, price: float, context: dict | None = None) -> ExitSignal:
    context = context or {}
    long = pos.direction == Direction.LONG

    # 1. thesis invalidation — highest priority, overrides price levels
    for name, trigger in pos.invalidation_triggers.items():
        try:
            if trigger(context):
                return ExitSignal(pos.ticker, "EXIT", f"thesis invalidated: {name}")
        except Exception:  # a broken trigger must not wedge the engine
            continue

    # 2. ratchet the trailing stop in the favorable direction only
    if long:
        pos.high_water = max(pos.high_water, price)
        trail_stop = pos.high_water * (1 - pos.trail_pct)
        new_stop = max(pos.stop, trail_stop)
    else:
        pos.high_water = min(pos.high_water, price) if pos.high_water else price
        trail_stop = pos.high_water * (1 + pos.trail_pct)
        new_stop = min(pos.stop, trail_stop)

    # 3. hard stop breach
    stop_hit = price <= new_stop if long else price >= new_stop
    if stop_hit:
        return ExitSignal(pos.ticker, "EXIT", f"stop breached at {price:.2f}", new_stop)

    # 4. target reached
    if pos.target is not None:
        target_hit = price >= pos.target if long else price <= pos.target
        if target_hit:
            return ExitSignal(pos.ticker, "EXIT", f"target reached at {price:.2f}")

    # 5. tightened trailing stop (informational)
    if abs(new_stop - pos.stop) > 1e-9:
        pos.stop = new_stop
        return ExitSignal(pos.ticker, "TIGHTEN", f"trail stop -> {new_stop:.2f}", new_stop)

    return ExitSignal(pos.ticker, "HOLD", "within thesis and levels")
