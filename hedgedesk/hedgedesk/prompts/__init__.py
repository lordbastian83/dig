"""Prompt library for the desk.

Prompts are kept out of the agent classes so a quant can tune the *voice* of
each seat (Bull, Bear, Risk Manager, Fund Manager) without touching control
flow. Every template is a plain ``str.format`` string; the agent fills the
``{...}`` slots from typed data and hands the result to Claude Fable.
"""

from .analysts import ANALYST_SPECS, ANALYST_SYSTEM, analyst_prompt
from .committee import BEAR_PROMPT, BULL_PROMPT, DEBATE_JUDGE_PROMPT
from .execution import FUND_MANAGER_PROMPT, RISK_MANAGER_PROMPT, TRADER_PROMPT

__all__ = [
    "ANALYST_SPECS",
    "ANALYST_SYSTEM",
    "analyst_prompt",
    "BULL_PROMPT",
    "BEAR_PROMPT",
    "DEBATE_JUDGE_PROMPT",
    "TRADER_PROMPT",
    "RISK_MANAGER_PROMPT",
    "FUND_MANAGER_PROMPT",
]
