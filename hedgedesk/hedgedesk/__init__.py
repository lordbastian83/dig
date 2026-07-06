"""AI Hedge Fund Desk — a 24/7 multi-agent investment committee.

Stack:
  OpenBB         — open-source terminal, all market/fundamental/flow/macro data
  TradingAgents  — the agentic org chart (analysts -> debate -> trader -> risk)
  Hermes         — routing + learning brain; captures audits, sharpens the prior
  Claude Fable   — the reasoning engine behind every seat

Entry point: ``hedgedesk.orchestration.pipeline.DeskPipeline``.
"""

from .orchestration.pipeline import DeskPipeline

__all__ = ["DeskPipeline"]
__version__ = "0.1.0"
