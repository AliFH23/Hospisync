"""
Hospisync AI service.
Only the Node server calls this service (never the browser), authenticated with a shared key.

Run: uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
import secrets
import time

from fastapi import Depends, FastAPI, Header, HTTPException, Query

from . import config
from .data import load_daily_usage, load_drugs, summarize
from .db import get_db
from .forecast import HORIZON, forecast_series
from .stock import STATUS_ORDER, plan_stock

app = FastAPI(title="Hospisync AI", version="0.2.0")


def require_internal_key(x_internal_key: str = Header(default="")) -> None:
    # Constant-time comparison: doesn't leak how many characters matched
    if not secrets.compare_digest(x_internal_key, config.INTERNAL_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid internal key")


HospitalQ = Query("DEMO", min_length=2, max_length=15)
HorizonQ = Query(HORIZON, ge=7, le=28)


@app.get("/health")
def health():
    try:
        get_db().command("ping")
        db = "connected"
    except Exception:  # noqa: BLE001 - health check must never crash
        db = "disconnected"
    return {"status": "ok", "db": db}


@app.get("/usage/summary", dependencies=[Depends(require_internal_key)])
def usage_summary(hospital: str = HospitalQ, days: int = Query(365, ge=28, le=730)):
    try:
        frame, drugs, h = load_daily_usage(hospital, days)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    return {
        "hospital": h["code"],
        "from": str(frame.index[0].date()),
        "to": str(frame.index[-1].date()),
        "days": len(frame),
        "drugs": summarize(frame, drugs),
    }


# ---------------------------------------------------------------- forecasting core
# Forecasts are expensive (several seconds) and change slowly -> cached 10 minutes.
# Stock levels change with every order -> NEVER cached, always read live.
_CACHE: dict[tuple[str, int], tuple[float, dict]] = {}
CACHE_SECONDS = 600
HISTORY_DAYS = 42  # 6 weeks of actuals returned with each forecast


def get_forecasts(hospital: str, horizon: int, refresh: bool = False) -> dict:
    key = (hospital.upper(), horizon)
    hit = _CACHE.get(key)
    if hit and not refresh and time.time() - hit[0] < CACHE_SECONDS:
        return {**hit[1], "cached": True}

    try:
        frame, drugs, h = load_daily_usage(hospital, 365)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err

    result = {
        "hospital": h,
        "drugs": drugs,
        "forecasts": {drug_id: forecast_series(frame[("amount", drug_id)], horizon) for drug_id in drugs},
        # Recent actual usage, so the UI can draw "history -> forecast" on one chart
        "history": {
            drug_id: [
                {"date": d.strftime("%Y-%m-%d"), "amount": round(float(v), 2)}
                for d, v in frame[("amount", drug_id)].tail(HISTORY_DAYS).items()
            ]
            for drug_id in drugs
        },
        "trainedOn": {"from": str(frame.index[0].date()), "to": str(frame.index[-1].date())},
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _CACHE[key] = (time.time(), result)
    return {**result, "cached": False}


@app.get("/forecast", dependencies=[Depends(require_internal_key)])
def forecast(hospital: str = HospitalQ, horizon: int = HorizonQ, refresh: bool = False):
    f = get_forecasts(hospital, horizon, refresh)
    drugs = []
    for drug_id, info in sorted(f["drugs"].items(), key=lambda kv: kv[1].code):
        fc = f["forecasts"][drug_id]
        drugs.append({
            "drugId": drug_id,
            "code": info.code,
            "name": info.name,
            "unit": info.unit,
            "model": fc.model,
            "backtestDailyError": fc.scores,
            "backtestTotalError": fc.total_error,
            "forecastTotal": fc.total,
            "forecast": [{"date": d, "amount": v} for d, v in zip(fc.dates, fc.daily)],
            "history": f["history"][drug_id],
        })
    return {
        "hospital": f["hospital"]["code"],
        "horizonDays": horizon,
        "trainedOn": f["trainedOn"],
        "generatedAt": f["generatedAt"],
        "cached": f["cached"],
        "drugs": drugs,
    }


@app.get("/stock/recommendations", dependencies=[Depends(require_internal_key)])
def stock_recommendations(
    hospital: str = HospitalQ,
    horizon: int = HorizonQ,
    lead_time_days: int = Query(3, ge=1, le=14, alias="leadTimeDays"),
):
    f = get_forecasts(hospital, horizon)
    live = load_drugs(f["hospital"]["_id"])  # fresh stock levels

    items = []
    for drug_id, fc in f["forecasts"].items():
        info = live.get(drug_id)
        if info is None:  # drug deactivated since the forecast was cached
            continue
        plan = plan_stock(fc, info.on_hand, lead_time_days)
        items.append({
            "drugId": drug_id,
            "code": info.code,
            "name": info.name,
            "unit": info.unit,
            "model": fc.model,
            "forecastTotal": fc.total,
            **plan,
        })

    items.sort(key=lambda x: (STATUS_ORDER[x["status"]], x["daysOfCover"] if x["daysOfCover"] is not None else 1e9))
    counts = {s: sum(1 for i in items if i["status"] == s) for s in STATUS_ORDER}
    return {
        "hospital": f["hospital"]["code"],
        "horizonDays": horizon,
        "leadTimeDays": lead_time_days,
        "serviceLevel": "~90%",
        "forecastGeneratedAt": f["generatedAt"],
        "counts": counts,
        "items": items,
    }