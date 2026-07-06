"""Agent seats.

The desk is a fixed org chart implemented as classes:

    AnalystAgent  x7   (parallel)     -> Phase 1
    BullResearcher / BearResearcher   -> Phase 2 (debate loop)
    Trader / RiskManager / FundManager -> Phase 3

Every agent shares one ``ClaudeClient`` (Claude Fable) and returns a typed
Pydantic object, never free text the caller has to parse.
"""

from .analysts import AnalystAgent, build_analyst_desk
from .committee import BearResearcher, BullResearcher, DebateModerator
from .execution import FundManager, RiskManager, Trader

__all__ = [
    "AnalystAgent",
    "build_analyst_desk",
    "BullResearcher",
    "BearResearcher",
    "DebateModerator",
    "Trader",
    "RiskManager",
    "FundManager",
]
