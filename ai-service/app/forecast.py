"""
Demand forecasting per drug.

Approach: several candidate models compete on each drug's own history.
Each is scored by a rolling-origin backtest (we pretend to be in the past,
forecast the next 14 days, and compare with what really happened), and the
most accurate one is used for the real forecast.

Candidates (simple -> complex):
  moving_average      mean of the last 28 days, flat line               (baseline)
  seasonal_naive      same weekday's average over the last 4 weeks      (baseline)
  seasonal_regression Ridge on weekday + yearly cycle + trend           (ML)
  gradient_boosting   HistGradientBoosting on the same calendar features (ML)

A complex model only wins if it actually beats the baselines on unseen data.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

HORIZON = 14          # days ahead we forecast
BACKTEST_FOLDS = 6    # how many past 14-day windows we test on
MIN_TRAIN_DAYS = 120  # never train on less than this


# ---------------------------------------------------------------- features
def calendar_features(dates: pd.DatetimeIndex, origin: pd.Timestamp) -> np.ndarray:
    """Features known in advance for ANY future date (no leakage from the target)."""
    dow = np.eye(7)[dates.dayofweek]                         # weekday one-hot
    doy = 2 * np.pi * dates.dayofyear.to_numpy() / 365.25
    yearly = np.column_stack([np.sin(doy), np.cos(doy), np.sin(2 * doy), np.cos(2 * doy)])
    trend = ((dates - origin).days.to_numpy() / 365.0).reshape(-1, 1)
    return np.hstack([dow, yearly, trend])


# ---------------------------------------------------------------- models
class MovingAverage:
    name = "moving_average"

    def fit(self, y: pd.Series):
        self.level = float(y.iloc[-28:].mean())
        return self

    def predict(self, dates: pd.DatetimeIndex) -> np.ndarray:
        return np.full(len(dates), self.level)


class SeasonalNaive:
    name = "seasonal_naive"

    def fit(self, y: pd.Series):
        recent = y.iloc[-28:]
        self.by_dow = recent.groupby(recent.index.dayofweek).mean().reindex(range(7), fill_value=0.0)
        return self

    def predict(self, dates: pd.DatetimeIndex) -> np.ndarray:
        return self.by_dow.loc[dates.dayofweek].to_numpy()


class SeasonalRegression:
    name = "seasonal_regression"

    def fit(self, y: pd.Series):
        self.origin = y.index[0]
        self.model = Ridge(alpha=1.0).fit(calendar_features(y.index, self.origin), y.to_numpy())
        return self

    def predict(self, dates: pd.DatetimeIndex) -> np.ndarray:
        return self.model.predict(calendar_features(dates, self.origin))


class GradientBoosting:
    name = "gradient_boosting"

    def fit(self, y: pd.Series):
        self.origin = y.index[0]
        self.model = HistGradientBoostingRegressor(
            max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=20, random_state=0
        ).fit(calendar_features(y.index, self.origin), y.to_numpy())
        return self

    def predict(self, dates: pd.DatetimeIndex) -> np.ndarray:
        return self.model.predict(calendar_features(dates, self.origin))


CANDIDATES = [MovingAverage, SeasonalNaive, SeasonalRegression, GradientBoosting]


# ---------------------------------------------------------------- evaluation
@dataclass
class Score:
    model: str
    wape: float                       # daily error: sum|err| / sum(actual), lower is better
    total_ape: float                  # error of the 14-day TOTAL (what stock planning uses)
    total_errors: list[float] = field(default_factory=list)  # actual - forecast of each 14-day total


def future_dates(last_day: pd.Timestamp, horizon: int) -> pd.DatetimeIndex:
    return pd.date_range(last_day + pd.Timedelta(days=1), periods=horizon, freq="D")


def backtest(y: pd.Series, model_cls, horizon: int = HORIZON, folds: int = BACKTEST_FOLDS) -> Score:
    abs_err, actual_sum, total_errors, totals = 0.0, 0.0, [], []
    for k in range(folds, 0, -1):
        cut = len(y) - k * horizon
        if cut < MIN_TRAIN_DAYS:
            continue
        train, test = y.iloc[:cut], y.iloc[cut:cut + horizon]
        pred = np.clip(model_cls().fit(train).predict(test.index), 0, None)
        abs_err += float(np.abs(test.to_numpy() - pred).sum())
        actual_sum += float(test.sum())
        total_errors.append(float(test.sum() - pred.sum()))
        totals.append(float(test.sum()))
    wape = abs_err / actual_sum if actual_sum else float("inf")
    total_ape = float(np.mean(np.abs(total_errors)) / np.mean(totals)) if totals and np.mean(totals) else float("inf")
    return Score(model_cls.name, round(wape, 4), round(total_ape, 4), total_errors)


# ---------------------------------------------------------------- public API
@dataclass
class DrugForecast:
    model: str
    scores: dict[str, float]          # model -> daily WAPE
    total_error: float                # chosen model's error on 14-day totals
    dates: list[str]
    daily: list[float]
    total: float
    total_errors: list[float]         # backtest errors of the chosen model (used for safety stock)


def forecast_series(y: pd.Series, horizon: int = HORIZON) -> DrugForecast:
    """Pick the best model for this series by backtest, then forecast `horizon` days."""
    y = y.astype(float)
    scores = [backtest(y, m, horizon) for m in CANDIDATES]
    # Lowest error wins; on a tie the simpler model (earlier in CANDIDATES) wins
    best = min(scores, key=lambda s: s.wape)
    best_cls = next(m for m in CANDIDATES if m.name == best.model)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        dates = future_dates(y.index[-1], horizon)
        daily = np.clip(best_cls().fit(y).predict(dates), 0, None)

    return DrugForecast(
        model=best.model,
        scores={s.model: s.wape for s in scores},
        total_error=best.total_ape,
        dates=[d.strftime("%Y-%m-%d") for d in dates],
        daily=[round(float(v), 2) for v in daily],
        total=round(float(daily.sum()), 2),
        total_errors=best.total_errors,
    )


if __name__ == "__main__":
    # python -m app.forecast  -> backtest report for every drug
    from .data import load_daily_usage

    frame, drugs, hospital = load_daily_usage()
    rows = []
    for drug_id, info in sorted(drugs.items(), key=lambda kv: kv[1].code):
        fc = forecast_series(frame[("amount", drug_id)])
        baseline = min(fc.scores["moving_average"], fc.scores["seasonal_naive"])
        rows.append({
            "drug": info.code,
            **{k: f"{v:.1%}" for k, v in fc.scores.items()},
            "chosen": fc.model,
            "vsBestBaseline": f"{(1 - fc.scores[fc.model] / baseline):+.0%}" if baseline else "-",
            f"{HORIZON}dTotalError": f"{fc.total_error:.1%}",
            f"next{HORIZON}d": f"{fc.total:,.0f} {info.unit}",
        })
    print(f"\nDaily error per model (WAPE, lower is better) | {BACKTEST_FOLDS} backtest folds x {HORIZON} days")
    print(f"{HORIZON}dTotalError = how far off the chosen model was on the {HORIZON}-day total (what reordering uses)\n")
    print(pd.DataFrame(rows).to_string(index=False))
