"""
Turns raw orders into clean daily time series, the input every forecasting model needs.

Definition of "usage": a dose consumes stock the moment compounding starts
(the Node server deducts stock on pending → preparing). So we count every order
that has a `preparingAt` date, whatever happened after (delivered OR wasted).
Orders cancelled before compounding used no stock and are excluded.

Output: one row per day (no gaps: days with no orders are 0), per drug:
    doses   number of compounded doses
    amount  total quantity in the drug's own unit (mg, mL, mcg...)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pandas as pd
from bson import ObjectId

from .db import get_db


@dataclass(frozen=True)
class DrugInfo:
    id: str
    code: str
    name: str
    category: str
    unit: str
    on_hand: float
    reorder_level: float


def usage_pipeline(hospital_id: ObjectId, start: datetime, end: datetime, tz: str) -> list[dict]:
    """MongoDB aggregation: (drug, local day) → doses, amount. Kept pure so it can be tested."""
    return [
        {"$match": {"hospital": hospital_id, "preparingAt": {"$gte": start, "$lt": end}}},
        {
            "$group": {
                "_id": {
                    "drug": "$drug",
                    # Group by the hospital's LOCAL calendar day, not UTC
                    "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$preparingAt", "timezone": tz}},
                },
                "doses": {"$sum": 1},
                "amount": {"$sum": "$dose.calculatedValue"},
            }
        },
        {"$project": {"_id": 0, "drug": {"$toString": "$_id.drug"}, "day": "$_id.day", "doses": 1, "amount": 1}},
    ]


def to_daily_frame(rows: list[dict], drug_ids: list[str], first_day: str, last_day: str) -> pd.DataFrame:
    """
    Pivot aggregation rows into a gap-free daily frame.
    Columns: MultiIndex (metric, drug_id) with metric in {"doses", "amount"}.
    """
    days = pd.date_range(first_day, last_day, freq="D", name="day")
    columns = pd.MultiIndex.from_product([["doses", "amount"], drug_ids], names=["metric", "drug"])
    if not rows:
        return pd.DataFrame(0.0, index=days, columns=columns)

    df = pd.DataFrame(rows)
    df["day"] = pd.to_datetime(df["day"])
    wide = df.pivot_table(index="day", columns="drug", values=["doses", "amount"], aggfunc="sum")
    return wide.reindex(index=days, columns=columns, fill_value=0.0).fillna(0.0)


def load_hospital(code: str = "DEMO") -> dict:
    hospital = get_db().hospitals.find_one({"code": code.upper()}, {"name": 1, "code": 1, "timezone": 1})
    if not hospital:
        raise LookupError(f'Hospital "{code}" not found')
    return hospital


def load_drugs(hospital_id: ObjectId) -> dict[str, DrugInfo]:
    cursor = get_db().drugs.find(
        {"hospital": hospital_id, "isActive": True},
        {"code": 1, "name": 1, "category": 1, "dosing.unit": 1, "stock": 1},
    )
    return {
        str(d["_id"]): DrugInfo(
            id=str(d["_id"]),
            code=d["code"],
            name=d["name"],
            category=d["category"],
            unit=d["dosing"]["unit"],
            on_hand=float(d.get("stock", {}).get("onHand", 0)),
            reorder_level=float(d.get("stock", {}).get("reorderLevel", 0)),
        )
        for d in cursor
    }


def load_daily_usage(hospital_code: str = "DEMO", days: int = 365) -> tuple[pd.DataFrame, dict[str, DrugInfo], dict]:
    """
    Returns (daily frame, drug info by id, hospital).
    The last day included is YESTERDAY: today is incomplete and would look like a demand drop.
    """
    hospital = load_hospital(hospital_code)
    tz = hospital.get("timezone", "Asia/Amman")
    drugs = load_drugs(hospital["_id"])

    local_today = pd.Timestamp.now(tz=tz).normalize()
    first_local = local_today - pd.Timedelta(days=days)
    # Query window in UTC covering those local days
    start = first_local.tz_convert("UTC").to_pydatetime()
    end = local_today.tz_convert("UTC").to_pydatetime()

    rows = list(get_db().orders.aggregate(usage_pipeline(hospital["_id"], start, end, tz)))
    rows = [r for r in rows if r["drug"] in drugs]  # ignore deactivated drugs

    frame = to_daily_frame(
        rows,
        list(drugs),
        first_local.strftime("%Y-%m-%d"),
        (local_today - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
    )
    return frame, drugs, hospital


def summarize(frame: pd.DataFrame, drugs: dict[str, DrugInfo]) -> list[dict]:
    """Quick per-drug profile: how much data we have and what patterns it shows."""
    weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out = []
    for drug_id, info in drugs.items():
        doses = frame[("doses", drug_id)]
        amount = frame[("amount", drug_id)]
        by_weekday = doses.groupby(doses.index.dayofweek).mean()
        last28, prev28 = amount.iloc[-28:].sum(), amount.iloc[-56:-28].sum()
        out.append({
            "code": info.code,
            "name": info.name,
            "unit": info.unit,
            "daysWithData": int((doses > 0).sum()),
            "avgDosesPerDay": round(float(doses.mean()), 2),
            "avgAmountPerDay": round(float(amount.mean()), 1),
            "busiestDay": weekday_names[int(by_weekday.idxmax())],
            "quietestDay": weekday_names[int(by_weekday.idxmin())],
            "trendLast28VsPrev28Pct": round(float((last28 / prev28 - 1) * 100), 1) if prev28 else None,
        })
    return sorted(out, key=lambda r: r["code"])


if __name__ == "__main__":
    # python -m app.data  → prints the data profile
    frame, drugs, hospital = load_daily_usage()
    print(f"\n{hospital['name']}: {len(frame)} days "
          f"({frame.index[0].date()} → {frame.index[-1].date()}), {len(drugs)} drugs\n")
    print(pd.DataFrame(summarize(frame, drugs)).to_string(index=False))