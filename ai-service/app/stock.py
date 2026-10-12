"""
Turns a demand forecast into a stock decision for one drug.

Inputs:  the forecast, current stock on hand, supplier lead time.
Outputs: days of cover, stockout date, reorder point, how much to order, and a status.

Safety stock comes from the model's OWN measured errors (backtest), so a drug
whose demand is harder to predict automatically gets a bigger buffer:
    safety = z x standard deviation of past 14-day forecast errors
    z = 1.28  -> covers roughly 90% of the error we observed
A floor of 10% of forecast demand applies when there are too few errors to measure.
"""
from __future__ import annotations

import math

import numpy as np

from .forecast import DrugForecast

Z_90 = 1.28            # ~90% service level
MIN_SAFETY_RATIO = 0.10


def plan_stock(fc: DrugForecast, on_hand: float, lead_time_days: int) -> dict:
    daily = np.asarray(fc.daily, dtype=float)
    horizon = len(daily)
    mean_daily = float(daily.mean())

    # How long current stock lasts
    days_of_cover = on_hand / mean_daily if mean_daily > 0 else math.inf
    cumulative = np.cumsum(daily)
    out_idx = int(np.argmax(cumulative > on_hand)) if (cumulative > on_hand).any() else None
    stockout_date = fc.dates[out_idx] if out_idx is not None else None

    # Safety stock from the model's measured uncertainty
    errors = np.asarray(fc.total_errors, dtype=float)
    sd = float(errors.std(ddof=1)) if len(errors) >= 2 else 0.0
    safety = max(Z_90 * sd, MIN_SAFETY_RATIO * fc.total)

    # Reorder when stock can no longer cover the resupply wait + buffer
    lead_demand = float(daily[: min(lead_time_days, horizon)].sum())
    reorder_point = lead_demand + safety

    # Order-up-to: enough for the whole horizon + buffer, minus what we have
    order_qty = max(0.0, fc.total + safety - on_hand)

    if days_of_cover < lead_time_days:
        status = "critical"   # will run out before a new delivery can arrive
    elif on_hand <= reorder_point:
        status = "reorder"    # order now to avoid running out
    else:
        status = "ok"

    return {
        "status": status,
        "onHand": round(on_hand, 1),
        "avgDailyDemand": round(mean_daily, 1),
        "daysOfCover": None if math.isinf(days_of_cover) else round(days_of_cover, 1),
        "stockoutDate": stockout_date,
        "safetyStock": round(safety, 1),
        "reorderPoint": round(reorder_point, 1),
        "recommendedOrder": math.ceil(order_qty) if status != "ok" else 0,
    }


STATUS_ORDER = {"critical": 0, "reorder": 1, "ok": 2}


if __name__ == "__main__":
    # python -m app.stock  -> stock plan for every drug
    import pandas as pd

    from .data import load_daily_usage
    from .forecast import HORIZON, forecast_series

    LEAD_TIME = 3
    frame, drugs, hospital = load_daily_usage()
    rows = []
    for drug_id, info in drugs.items():
        fc = forecast_series(frame[("amount", drug_id)])
        plan = plan_stock(fc, info.on_hand, LEAD_TIME)
        rows.append({
            "drug": info.code,
            "status": plan["status"].upper(),
            "onHand": f"{plan['onHand']:,.0f}",
            "perDay": f"{plan['avgDailyDemand']:,.0f}",
            "daysOfCover": plan["daysOfCover"],
            "stockout": plan["stockoutDate"] or f">{HORIZON}d",
            "safety": f"{plan['safetyStock']:,.0f}",
            "ORDER": f"{plan['recommendedOrder']:,} {info.unit}" if plan["recommendedOrder"] else "-",
            "_rank": STATUS_ORDER[plan["status"]],
        })
    df = pd.DataFrame(rows).sort_values(["_rank", "daysOfCover"]).drop(columns="_rank")
    print(f"\nStock plan | horizon {HORIZON} days | supplier lead time {LEAD_TIME} days | ~90% service level\n")
    print(df.to_string(index=False))
