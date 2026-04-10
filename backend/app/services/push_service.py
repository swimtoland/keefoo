"""
第四层：信息推送与追问服务（Push & Socrates Service）

两个组件：
- Dispatcher：推送频控（规则引擎，零 Token）
- Socrates 调度：延迟追问编排（LLM Agent）

Dispatcher 频控规则（来自 PRD）：
- 实时预警：每日上限 3 条，仅 impact_level=high
- 日报：每日收盘后 1 条，固定 17:30
- 板块联动 → 日报聚合；宏观背景 → 周报聚合

Socrates 调度规则：
- 交易录入后 2~4 小时发起追问
- 每笔交易最多追问一次
- 超过 24 小时未回复 → 沉默推断兜底
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.agents.socrates import generate_socratic_question, infer_from_silence, parse_decision_intent
from app.models.models import (
    Asset,
    Event,
    FeedCard,
    ImpactLevel,
    NoteSource,
    RelevanceLevel,
    Trade,
    TradeStatus,
)


# ---------------------------------------------------------------------------
# Dispatcher：推送频控
# ---------------------------------------------------------------------------

# 每日实时预警推送上限
DAILY_PUSH_LIMIT = 3


def dispatch_cards_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    对用户的已充实 FeedCard 执行推送决策。

    规则：
    1. impact=high + relevance=direct → 实时推送（受每日上限约束）
    2. impact=high + relevance=entity → 实时推送（受上限约束）
    3. 其他 → 标记为日报聚合（不实时推送）
    """
    # 统计今日已推送数
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    pushed_today = (
        db.query(func.count(FeedCard.id))
        .filter(
            FeedCard.user_id == user_id,
            FeedCard.is_pushed == True,
        )
        .scalar()
    ) or 0

    remaining_quota = max(0, DAILY_PUSH_LIMIT - pushed_today)

    # 获取未推送、已充实的卡片，按关联度排序
    cards = (
        db.query(FeedCard)
        .options(joinedload(FeedCard.event))
        .filter(
            FeedCard.user_id == user_id,
            FeedCard.is_enriched == True,
            FeedCard.is_pushed == False,
        )
        .order_by(FeedCard.relevance_score.desc())
        .all()
    )

    pushed = 0
    aggregated = 0

    for card in cards:
        if not card.event:
            continue

        should_push = (
            remaining_quota > 0
            and card.event.impact_level == ImpactLevel.high
            and card.relevance_level in (RelevanceLevel.direct, RelevanceLevel.entity)
        )

        if should_push:
            card.is_pushed = True
            pushed += 1
            remaining_quota -= 1
        else:
            # 不实时推送，留给日报聚合
            aggregated += 1

    db.commit()

    return {
        "user_id": str(user_id),
        "pushed": pushed,
        "aggregated": aggregated,
        "remaining_quota": remaining_quota,
    }


# ---------------------------------------------------------------------------
# Socrates 调度：延迟追问
# ---------------------------------------------------------------------------

# 追问延迟窗口
QUESTION_DELAY_MIN_HOURS = 2
QUESTION_DELAY_MAX_HOURS = 4
# 沉默推断阈值
SILENCE_THRESHOLD_HOURS = 24


def find_trades_ready_for_question(db: Session, user_id: uuid.UUID) -> list[Trade]:
    """
    找出满足追问条件的交易：
    - 交易时间距今 2~24 小时
    - 尚未发送过追问（agent_question_sent=False）
    - 没有 decision_note（用户未主动填写）
    """
    now = datetime.now(timezone.utc)
    min_time = now - timedelta(hours=SILENCE_THRESHOLD_HOURS)
    max_time = now - timedelta(hours=QUESTION_DELAY_MIN_HOURS)

    trades = (
        db.query(Trade)
        .options(joinedload(Trade.asset))
        .filter(
            Trade.user_id == user_id,
            Trade.traded_at >= min_time,
            Trade.traded_at <= max_time,
            Trade.agent_question_sent == False,
            Trade.decision_note.is_(None),
        )
        .all()
    )
    return trades


def send_socratic_questions(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    对满足条件的交易生成苏格拉底追问。
    """
    trades = find_trades_ready_for_question(db, user_id)
    questions_sent = 0

    for trade in trades:
        if not trade.asset:
            continue

        trade_info = {
            "asset_name": trade.asset.name,
            "asset_code": trade.asset.code,
            "direction": trade.direction.value if trade.direction else "buy",
            "price": float(trade.price),
            "quantity": float(trade.quantity),
            "traded_at": trade.traded_at.isoformat() if trade.traded_at else "",
        }

        # 获取交易时刻附近的 FeedCard 作为市场快照
        recent_cards = _get_cards_near_trade(db, user_id, trade.asset_id, trade.traded_at)

        # 构建市场快照（简化版）
        market_snapshot = trade.market_context or {}

        # 生成追问
        question = generate_socratic_question(trade_info, market_snapshot, recent_cards)

        # 写入 Trade
        trade.agent_question_text = question.get("question", "")
        trade.agent_question_sent = True
        trade.agent_question_sent_at = datetime.now(timezone.utc)

        # 将选项和类型存入 market_context（复用现有字段）
        if trade.market_context is None:
            trade.market_context = {}
        trade.market_context["socrates_options"] = question.get("options", [])
        trade.market_context["socrates_type"] = question.get("question_type", "trigger")

        questions_sent += 1

    db.commit()

    return {
        "user_id": str(user_id),
        "questions_sent": questions_sent,
    }


def process_silence_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    对超过 24 小时未回复追问的交易执行沉默推断。
    """
    now = datetime.now(timezone.utc)
    silence_cutoff = now - timedelta(hours=SILENCE_THRESHOLD_HOURS)

    silent_trades = (
        db.query(Trade)
        .options(joinedload(Trade.asset))
        .filter(
            Trade.user_id == user_id,
            Trade.agent_question_sent == True,
            Trade.decision_note.is_(None),
            Trade.agent_question_sent_at <= silence_cutoff,
        )
        .all()
    )

    inferred = 0

    for trade in silent_trades:
        hours_since = (now - trade.agent_question_sent_at).total_seconds() / 3600 if trade.agent_question_sent_at else 48

        trade_info = {
            "direction": trade.direction.value if trade.direction else "buy",
            "price": float(trade.price),
            "quantity": float(trade.quantity),
        }

        result = infer_from_silence(trade_info, hours_since)

        trade.decision_note = result["structured_note"]
        trade.emotion_score = result["emotion_score"]
        trade.confidence_score = 3  # low → 3
        trade.note_source = NoteSource.silence_inferred
        inferred += 1

    db.commit()

    return {
        "user_id": str(user_id),
        "silence_inferred": inferred,
    }


def _get_cards_near_trade(
    db: Session,
    user_id: uuid.UUID,
    asset_id: uuid.UUID,
    traded_at: datetime,
) -> list[dict[str, Any]]:
    """获取交易时刻前后的 FeedCard 内容，作为追问的上下文。"""
    window_start = traded_at - timedelta(hours=12)
    window_end = traded_at + timedelta(hours=4)

    cards = (
        db.query(FeedCard)
        .options(joinedload(FeedCard.event))
        .filter(
            FeedCard.user_id == user_id,
            FeedCard.event.has(Event.occurred_at >= window_start),
            FeedCard.event.has(Event.occurred_at <= window_end),
        )
        .order_by(FeedCard.relevance_score.desc())
        .limit(5)
        .all()
    )

    result = []
    for c in cards:
        item: dict[str, Any] = {
            "event_title": c.event.title if c.event else "",
        }
        if c.card_content_json:
            item["card"] = c.card_content_json.get("card", {})
        result.append(item)

    return result


# ---------------------------------------------------------------------------
# 入口：全流程
# ---------------------------------------------------------------------------

def run_push_layer_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    运行第四层完整流程：
    1. Dispatcher 推送决策
    2. Socrates 延迟追问
    3. 沉默推断
    """
    dispatch_result = dispatch_cards_for_user(db, user_id)
    socrates_result = send_socratic_questions(db, user_id)
    silence_result = process_silence_for_user(db, user_id)

    return {
        "user_id": str(user_id),
        "dispatch": dispatch_result,
        "socrates": socrates_result,
        "silence": silence_result,
    }
