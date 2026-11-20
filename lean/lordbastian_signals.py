# LordBastian Signals — QuantConnect Lean port of the FUNDED streams only.
#
# Purpose: independent cross-validation. The rules below were validated
# walk-forward on this repo's own data pipeline (see research-report.md on
# the budsignal-data branch). Running the same rules on QuantConnect's
# minute-level Oanda/Bitfinex data — a completely different data source,
# with modeled spreads and realistic fills — is a robustness check the
# home pipeline cannot give itself. If the edge only exists on one data
# source, that is evidence against the edge, and we want to know.
#
# What is ported (exactly the funded rule set, nothing more):
#   - Daily swing-55: long when the daily close exceeds the prior 55-day
#     high close. Stop 2xATR(14) from entry, trail 3xATR below the highest
#     close since entry (ATR fixed at entry, exits evaluated on daily
#     closes), hard exit after 24 daily bars. LONGS ONLY - shorts failed
#     side-split validation at home and are not traded.
#   - 4h breakout-55 on the markets that kept a net edge out-of-sample
#     (Gold, NAS100, SPX500): long on a 4h close above the prior 55-bar
#     high close. Stop 1.5xATR, trail 2xATR on 4h closes, hard exit after
#     18 bars. LONGS ONLY.
#   - Edge-weighted risk: swing 1.25% of equity per trade, breakout 1.0%.
#     At most 3 positions open, one per market.
#
# Deliberately NOT ported: the cross stream (paper-only forever), shorts,
# the 1h scalp (thin edge, alert-only), pyramiding (tested, failed).
#
# How to run: free account at quantconnect.com -> Create New Algorithm
# (Python) -> replace the template with this file -> Backtest.
# Educational tool, not financial advice.

from AlgorithmImports import *
from collections import deque


class LordBastianSignals(QCAlgorithm):

    SWING_LOOKBACK = 55
    SWING_STOP_ATR = 2.0
    SWING_TRAIL_ATR = 3.0
    SWING_MAX_BARS = 24
    SWING_RISK = 0.0125

    BK_LOOKBACK = 55
    BK_STOP_ATR = 1.5
    BK_TRAIL_ATR = 2.0
    BK_MAX_BARS = 18
    BK_RISK = 0.010

    MAX_POSITIONS = 3

    def Initialize(self):
        self.SetStartDate(2023, 9, 1)
        self.SetCash(4500)  # ~ GBP 3,500

        # The home desk's eight markets on QC's free data:
        # Oanda CFDs for metals/energy/indices, Oanda forex, Bitfinex crypto.
        cfds = ["XAUUSD", "WTICOUSD", "SPX500USD", "NAS100USD", "US30USD"]
        fx = ["GBPUSD", "EURUSD"]
        self.bk_markets = set()

        self.sym = {}
        for tk in cfds:
            self.sym[tk] = self.AddCfd(tk, Resolution.Hour, Market.Oanda).Symbol
        for tk in fx:
            self.sym[tk] = self.AddForex(tk, Resolution.Hour, Market.Oanda).Symbol
        self.sym["BTCUSD"] = self.AddCrypto("BTCUSD", Resolution.Hour, Market.Bitfinex).Symbol

        # breakout stream only where it kept a net edge out-of-sample
        for tk in ["XAUUSD", "NAS100USD", "SPX500USD"]:
            self.bk_markets.add(self.sym[tk])

        # per-symbol state: consolidated bars, close windows, ATRs, open trade
        self.daily_closes = {}
        self.h4_closes = {}
        self.atr_d = {}
        self.atr_4h = {}
        self.trade = {}  # symbol -> dict(stream, entry, atr, best, bars)

        for tk, s in self.sym.items():
            self.daily_closes[s] = deque(maxlen=self.SWING_LOOKBACK)
            self.h4_closes[s] = deque(maxlen=self.BK_LOOKBACK)
            self.trade[s] = None

            day = TradeBarConsolidator(timedelta(days=1))
            day.DataConsolidated += self.OnDaily
            self.SubscriptionManager.AddConsolidator(s, day)
            self.atr_d[s] = AverageTrueRange(14, MovingAverageType.Wilders)
            self.RegisterIndicator(s, self.atr_d[s], day)

            if s in self.bk_markets:
                h4 = TradeBarConsolidator(timedelta(hours=4))
                h4.DataConsolidated += self.On4Hour
                self.SubscriptionManager.AddConsolidator(s, h4)
                self.atr_4h[s] = AverageTrueRange(14, MovingAverageType.Wilders)
                self.RegisterIndicator(s, self.atr_4h[s], h4)

        self.SetWarmUp(timedelta(days=120))

    # ---------- helpers ----------

    def OpenCount(self):
        return sum(1 for t in self.trade.values() if t is not None)

    def TryEnter(self, symbol, price, atr, stream, stop_atr, risk_frac):
        if self.IsWarmingUp or atr is None or atr <= 0:
            return
        if self.trade[symbol] is not None or self.OpenCount() >= self.MAX_POSITIONS:
            return
        stop_dist = stop_atr * atr
        qty = (self.Portfolio.TotalPortfolioValue * risk_frac) / stop_dist
        qty = float(self.Securities[symbol].SymbolProperties.LotSize) * max(
            1, int(qty / float(self.Securities[symbol].SymbolProperties.LotSize)))
        if qty <= 0:
            return
        self.MarketOrder(symbol, qty)
        self.trade[symbol] = {
            "stream": stream, "entry": price, "atr": atr,
            "best": price, "bars": 0,
        }
        self.Log(f"{symbol.Value} {stream} LONG @ {price:.4f} stop {price - stop_dist:.4f}")

    def Manage(self, symbol, close, stream, stop_atr, trail_atr, max_bars):
        t = self.trade[symbol]
        if t is None or t["stream"] != stream:
            return
        t["bars"] += 1
        t["best"] = max(t["best"], close)
        stop = max(t["entry"] - stop_atr * t["atr"], t["best"] - trail_atr * t["atr"])
        if close <= stop or t["bars"] >= max_bars:
            self.Liquidate(symbol)
            why = "time" if t["bars"] >= max_bars else "trail/stop"
            self.Log(f"{symbol.Value} {stream} exit @ {close:.4f} ({why}, {t['bars']} bars)")
            self.trade[symbol] = None

    # ---------- streams ----------

    def OnDaily(self, sender, bar):
        s = bar.Symbol
        closes = self.daily_closes[s]
        prior_high = max(closes) if len(closes) == self.SWING_LOOKBACK else None
        atr = self.atr_d[s].Current.Value if self.atr_d[s].IsReady else None

        self.Manage(s, bar.Close, "swing", self.SWING_STOP_ATR,
                    self.SWING_TRAIL_ATR, self.SWING_MAX_BARS)

        if prior_high is not None and bar.Close > prior_high:
            self.TryEnter(s, bar.Close, atr, "swing",
                          self.SWING_STOP_ATR, self.SWING_RISK)
        closes.append(bar.Close)

    def On4Hour(self, sender, bar):
        s = bar.Symbol
        closes = self.h4_closes[s]
        prior_high = max(closes) if len(closes) == self.BK_LOOKBACK else None
        atr = self.atr_4h[s].Current.Value if self.atr_4h[s].IsReady else None

        self.Manage(s, bar.Close, "breakout", self.BK_STOP_ATR,
                    self.BK_TRAIL_ATR, self.BK_MAX_BARS)

        if prior_high is not None and bar.Close > prior_high:
            self.TryEnter(s, bar.Close, atr, "breakout",
                          self.BK_STOP_ATR, self.BK_RISK)
        closes.append(bar.Close)
