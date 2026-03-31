"""Agent 苏格拉底追问与回复解析（MVP：规则引擎）。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import models as m

_IMPACT_RANK = {
    m.ImpactLevel.high: 3,
    m.ImpactLevel.medium: 2,
    m.ImpactLevel.low: 1,
}


def load_events_near_trade(
    db: Session,
    asset_id: uuid.UUID,
    traded_at: datetime,
    *,
    days: int = 3,
) -> list[m.Event]:
    """查询标的在交易日前后 ``days`` 天内、通过 event_asset_links 关联的事件。"""
    if traded_at.tzinfo is None:
        traded_at = traded_at.replace(tzinfo=timezone.utc)
    start = traded_at - timedelta(days=days)
    end = traded_at + timedelta(days=days)
    rows = (
        db.query(m.Event)
        .join(m.EventAssetLink, m.EventAssetLink.event_id == m.Event.id)
        .filter(
            m.EventAssetLink.asset_id == asset_id,
            m.Event.occurred_at >= start,
            m.Event.occurred_at <= end,
        )
        .order_by(m.Event.occurred_at.desc())
        .all()
    )
    return rows


def _fmt_price(price: float) -> str:
    if abs(price - round(price)) < 1e-6:
        return str(int(round(price)))
    s = f"{price:.2f}"
    return s.rstrip("0").rstrip(".")


def _pick_strongest_event(events: list[m.Event]) -> m.Event | None:
    if not events:
        return None
    return max(
        events,
        key=lambda e: (_IMPACT_RANK.get(e.impact_level, 0), e.occurred_at),
    )


def _truncate(s: str, max_len: int = 40) -> str:
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def generate_question(trade: m.Trade, asset: m.Asset, events: list[m.Event]) -> str:
    """
    根据交易当天的市场环境生成苏格拉底式追问。
    自动生成长度不超过 40 字（演示种子数据可更长，由调用方直接写入）。
    """
    sector = (asset.sector or "相关").strip()
    name = asset.name.strip()
    price_s = _fmt_price(float(trade.price))

    ev = _pick_strongest_event(events)
    if ev is None:
        return _truncate(f"这笔{name}的交易，你当时最核心的买入逻辑是什么？")

    title = (ev.title or "") + (ev.summary or "")
    et = ev.event_type

    if et in (m.EventType.policy, m.EventType.macro) or any(
        k in title for k in ("降准", "降息", "政策", "国务院")
    ):
        q = (
            f"你在{price_s}建仓了{name}，当天{sector}板块有政策利好，"
            f"你是基于中线政策逻辑，还是短线技术突破？"
        )
        return _truncate(q)

    if et == m.EventType.earnings or any(k in title for k in ("财报", "年报", "业绩", "营收")):
        q = f"你在{name}财报发布当天交易，是提前布局还是跟随市场反应？"
        return _truncate(q)

    if et == m.EventType.executive or any(k in title for k in ("高管", "辞职", "变动")):
        q = f"你在{name}高管变动期间交易，是认为影响可控，还是另有逻辑？"
        return _truncate(q)

    return _truncate(f"这笔{name}的交易，你当时最核心的买入逻辑是什么？")


def _confidence_to_score(confidence: str) -> int:
    return {"high": 8, "medium": 5, "low": 3}.get(confidence, 5)


def parse_user_reply(reply_text: str) -> dict[str, Any]:
    """
    解析用户回复，提取结构化意图（关键词规则，后续可接 Claude）。
    """
    text = reply_text.strip()

    decision_type = "fundamental"
    if any(k in text for k in ("政策", "利好", "消息", "降准", "降息")):
        decision_type = "event_driven"
    elif any(k in text for k in ("突破", "均线", "技术", "K线", "形态")):
        decision_type = "technical"
    elif any(k in text for k in ("感觉", "直觉", "氛围", "情绪")):
        decision_type = "sentiment"
    elif any(k in text for k in ("财报", "年报", "业绩", "盈利")):
        decision_type = "fundamental"

    time_horizon = "medium"
    if any(k in text for k in ("长期", "长线", "价值", "持有几年")):
        time_horizon = "long"
    if any(k in text for k in ("短线", "做T", "明天", "日内", "几天")):
        time_horizon = "short"
    if any(k in text for k in ("日内", "分时", "当天")):
        time_horizon = "intraday"

    confidence = "medium"
    if any(k in text for k in ("赌", "博一", "试试", "碰碰运气", "赌一把")):
        confidence = "low"
    if any(k in text for k in ("确定", "一定", "肯定", "非常有把握")):
        confidence = "high"

    emotion_score = 5
    if any(k in text for k in ("赌", "博", "慌", "怕", "焦虑")):
        emotion_score = min(10, emotion_score + 3)
    if any(k in text for k in ("兴奋", "激动", "开心")):
        emotion_score = min(10, emotion_score + 2)
    if any(k in text for k in ("冷静", "淡定", "理性")):
        emotion_score = max(1, emotion_score - 1)
    emotion_score = max(1, min(10, emotion_score))

    parts = [
        f"类型:{decision_type}",
        f"周期:{time_horizon}",
        f"信心:{confidence}",
    ]
    structured_note = "｜".join(parts) + f"。摘要：{text[:200]}"

    return {
        "decision_type": decision_type,
        "time_horizon": time_horizon,
        "confidence": confidence,
        "emotion_score": emotion_score,
        "structured_note": structured_note,
        "confidence_score": _confidence_to_score(confidence),
    }
