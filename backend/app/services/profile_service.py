"""用户策略画像与偏差指标（全量 trades 聚合）。"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import models as m


def _parse_uid(user_id: str | uuid.UUID) -> uuid.UUID:
    return user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _pnl(t: m.Trade) -> float:
    return float(t.pnl) if t.pnl is not None else 0.0


def _infer_decision_type(note: Optional[str]) -> str:
    if not note:
        return "unknown"
    text = note
    for dt in ("event_driven", "technical", "fundamental", "sentiment"):
        if f"类型:{dt}" in text or f"类型：{dt}" in text:
            return dt
    if any(k in text for k in ("政策", "降准", "事件")):
        return "event_driven"
    if any(k in text for k in ("技术", "均线", "突破")):
        return "technical"
    if any(k in text for k in ("财报", "业绩", "价值")):
        return "fundamental"
    if any(k in text for k in ("感觉", "情绪", "氛围")):
        return "sentiment"
    return "unknown"


def _weekday_cn(dt: datetime) -> str:
    w = dt.weekday()
    names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    return names[w]


def generate_strategy_profile(user_id: str | uuid.UUID, db: Session) -> dict[str, Any]:
    uid = _parse_uid(user_id)
    all_trades = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.user_id == uid)
        .all()
    )

    if len(all_trades) < 5:
        return {
            "message": "需要至少5笔交易记录才能生成策略画像",
            "has_data": False,
        }

    closed = [t for t in all_trades if t.status == m.TradeStatus.closed]

    # --- time_analysis ---
    holding_buckets = {"1-3天": 0, "4-7天": 0, "8-30天": 0, "30天以上": 0}
    for t in closed:
        d = t.holding_days
        if d is None:
            continue
        if d <= 3:
            holding_buckets["1-3天"] += 1
        elif d <= 7:
            holding_buckets["4-7天"] += 1
        elif d <= 30:
            holding_buckets["8-30天"] += 1
        else:
            holding_buckets["30天以上"] += 1

    holding_period_distribution = [
        {"range": k, "count": v} for k, v in holding_buckets.items()
    ]

    now = datetime.now(timezone.utc)

    def _ym(dt: datetime) -> tuple[int, int]:
        d = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        d = d.astimezone(timezone.utc)
        return d.year, d.month

    def _last_n_month_labels(n: int = 6) -> list[str]:
        y, mo = now.year, now.month
        labels: list[str] = []
        for _ in range(n):
            labels.append(f"{y}-{mo:02d}")
            mo -= 1
            if mo == 0:
                mo = 12
                y -= 1
        return list(reversed(labels))

    trade_frequency_by_month = []
    for month_key in _last_n_month_labels(6):
        y, mo = int(month_key[:4]), int(month_key[5:7])
        cnt = sum(1 for t in all_trades if _ym(t.traded_at) == (y, mo))
        trade_frequency_by_month.append({"month": month_key, "count": cnt})

    wd_counts: dict[str, int] = defaultdict(int)
    for t in all_trades:
        ta = t.traded_at
        if ta.tzinfo is None:
            ta = ta.replace(tzinfo=timezone.utc)
        wd_counts[_weekday_cn(ta)] += 1
    weekday_order = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    weekday_distribution = [{"day": d, "count": wd_counts.get(d, 0)} for d in weekday_order]

    # --- asset_analysis ---
    sector_pnl: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0.0, "pnl": 0.0})
    type_counts: dict[str, int] = defaultdict(int)
    asset_trade_count: dict[uuid.UUID, int] = defaultdict(int)

    for t in all_trades:
        asset_trade_count[t.asset_id] += 1
        if t.asset:
            sec = t.asset.sector or "未分类"
            sector_pnl[sec]["count"] += 1
            sector_pnl[sec]["pnl"] += _pnl(t)
            type_counts[t.asset.asset_type.value] += 1

    sector_distribution = [
        {"sector": k, "count": int(v["count"]), "pnl": round(v["pnl"], 2)}
        for k, v in sector_pnl.items()
    ]
    asset_type_distribution = [
        {"type": k, "count": v} for k, v in sorted(type_counts.items(), key=lambda x: -x[1])
    ]

    top_assets = sorted(asset_trade_count.items(), key=lambda x: -x[1])[:5]
    top_traded_assets = []
    for aid, cnt in top_assets:
        a = db.query(m.Asset).filter(m.Asset.id == aid).first()
        top_traded_assets.append(
            {
                "asset_id": str(aid),
                "name": a.name if a else "—",
                "code": a.code if a else "—",
                "trade_count": cnt,
            }
        )

    # --- behavior_analysis ---
    dt_dist: dict[str, int] = defaultdict(int)
    for t in all_trades:
        dt_dist[_infer_decision_type(t.decision_note)] += 1
    decision_type_distribution = dict(dt_dist)

    winning = [t for t in closed if _pnl(t) > 0]
    losing = [t for t in closed if _pnl(t) < 0]
    wc = [t.confidence_score for t in winning if t.confidence_score is not None]
    lc = [t.confidence_score for t in losing if t.confidence_score is not None]
    avg_confidence_by_result = {
        "winning": round(sum(wc) / len(wc), 2) if wc else None,
        "losing": round(sum(lc) / len(lc), 2) if lc else None,
    }

    n_closed = len(closed)
    sl = sum(1 for t in closed if t.exit_reason == m.ExitReason.stop_loss)
    tp = sum(1 for t in closed if t.exit_reason == m.ExitReason.take_profit)
    stop_loss_rate = round(sl / n_closed * 100.0, 2) if n_closed else 0.0
    take_profit_rate = round(tp / n_closed * 100.0, 2) if n_closed else 0.0

    # --- bias_analysis scores ---
    avg_loss_hd = (
        sum(t.holding_days or 0 for t in losing) / len(losing) if losing else 0.0
    )
    avg_win_hd = (
        sum(t.holding_days or 0 for t in winning) / len(winning) if winning else 0.0
    )
    ratio = avg_loss_hd / max(avg_win_hd, 0.01)
    disposition_score = min(100, int(min(ratio / 2.0, 2.0) * 50))

    earliest = min(_utc(t.traded_at) for t in all_trades)
    days_span = max((now - earliest).days, 1)
    months_span = max(days_span / 30.0, 1 / 30.0)
    monthly_rate = len(all_trades) / months_span
    overtrading_score = min(100, int(min(monthly_rate / 20.0, 2.0) * 50))

    high_emo = [t for t in closed if t.emotion_score is not None and t.emotion_score >= 8]
    emotional_score = 0
    if high_emo:
        losses = sum(1 for t in high_emo if _pnl(t) < 0)
        emotional_score = min(100, int(losses / len(high_emo) * 100))

    # FOMO: trade within 1h of some linked event for same asset
    fomo_hits = 0
    for t in all_trades:
        ta = t.traded_at
        if ta.tzinfo is None:
            ta = ta.replace(tzinfo=timezone.utc)
        evs = (
            db.query(m.Event)
            .join(m.EventAssetLink, m.EventAssetLink.event_id == m.Event.id)
            .filter(m.EventAssetLink.asset_id == t.asset_id)
            .all()
        )
        for ev in evs:
            ea = ev.occurred_at
            if ea.tzinfo is None:
                ea = ea.replace(tzinfo=timezone.utc)
            if abs((ta - ea).total_seconds()) <= 3600:
                fomo_hits += 1
                break
    fomo_score = min(100, int(fomo_hits / max(len(all_trades), 1) * 100))

    bias_analysis = {
        "disposition_score": disposition_score,
        "overtrading_score": overtrading_score,
        "emotional_score": emotional_score,
        "fomo_score": fomo_score,
    }

    time_analysis = {
        "holding_period_distribution": holding_period_distribution,
        "trade_frequency_by_month": trade_frequency_by_month,
        "weekday_distribution": weekday_distribution,
    }
    asset_analysis = {
        "sector_distribution": sector_distribution,
        "asset_type_distribution": asset_type_distribution,
        "top_traded_assets": top_traded_assets,
    }
    behavior_analysis = {
        "decision_type_distribution": decision_type_distribution,
        "avg_confidence_by_result": avg_confidence_by_result,
        "stop_loss_rate": stop_loss_rate,
        "take_profit_rate": take_profit_rate,
    }

    return {
        "has_data": True,
        "time_analysis": time_analysis,
        "asset_analysis": asset_analysis,
        "behavior_analysis": behavior_analysis,
        "bias_analysis": bias_analysis,
        "message": None,
    }


BIAS_DESCRIPTIONS = {
    "disposition_score": "处置效应倾向：亏损持仓时间相对盈利过长时，分数越高。",
    "overtrading_score": "过度交易倾向：单位时间内交易频率越高，分数越高。",
    "emotional_score": "情绪化交易：高情绪分交易中亏损占比越高，分数越高。",
    "fomo_score": "FOMO 倾向：交易时间与重大事件发布时间过于接近（1小时内）比例越高，分数越高。",
}


def get_bias_analysis_with_descriptions(user_id: str | uuid.UUID, db: Session) -> dict[str, Any]:
    prof = generate_strategy_profile(user_id, db)
    if not prof.get("has_data"):
        return prof
    out = dict(prof["bias_analysis"])
    out["descriptions"] = BIAS_DESCRIPTIONS
    out["has_data"] = True
    return out
