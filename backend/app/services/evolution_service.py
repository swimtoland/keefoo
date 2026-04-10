"""
第五层：复盘与策略进化服务（Evolution Service）

编排三个组件：
- Chronicler：日报 / 复盘叙事
- Profiler：策略画像 / 偏差诊断叙事
- Shadow：影子仓匹配系数计算（规则引擎，零 Token）

触发时机：
- 日报：每日收盘后 17:30
- 周报：每周五收盘后
- 策略画像：数据积累 D30+ 后按需生成
- 影子仓匹配：每周一次
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.agents.chronicler import generate_daily_report, narrate_period_report
from app.agents.profiler import generate_strategy_narrative, narrate_bias_diagnosis
from app.models.models import (
    Asset,
    Event,
    FeedCard,
    ShadowPosition,
    Trade,
    TradeStatus,
)
from app.services.profile_service import generate_strategy_profile
from app.services.report_service import generate_report


# ---------------------------------------------------------------------------
# Chronicler 编排
# ---------------------------------------------------------------------------

def run_daily_report(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """生成今日收盘日报。"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # 获取今日 FeedCard
    cards = (
        db.query(FeedCard)
        .options(joinedload(FeedCard.event))
        .filter(FeedCard.user_id == user_id, FeedCard.is_enriched == True)
        .order_by(FeedCard.relevance_score.desc())
        .all()
    )

    today_cards = []
    for c in cards:
        item: dict[str, Any] = {
            "event_title": c.event.title if c.event else "",
            "relevance_score": c.relevance_score,
        }
        if c.card_content_json:
            item["card"] = c.card_content_json.get("card", {})
            item["has_debate"] = c.card_content_json.get("has_debate", False)
        today_cards.append(item)

    # 持仓概览
    open_trades = (
        db.query(Trade)
        .options(joinedload(Trade.asset))
        .filter(Trade.user_id == user_id, Trade.status == TradeStatus.open)
        .all()
    )
    position_summary = {}
    for t in open_trades:
        name = t.asset.name if t.asset else "未知"
        position_summary[name] = {
            "cost": float(t.price),
            "quantity": float(t.quantity),
            "direction": t.direction.value if t.direction else "buy",
        }

    user_context = {"user_id": str(user_id)}

    report = generate_daily_report(user_context, today_cards, position_summary)

    return {
        "user_id": str(user_id),
        "type": "daily",
        "report": report,
        "cards_referenced": len(today_cards),
    }


def run_period_report(db: Session, user_id: uuid.UUID, period: str = "weekly") -> dict[str, Any]:
    """生成周报/月报/季报（统计 + 叙事）。"""
    # 获取统计数据
    stats = generate_report(user_id, period, db)

    if not stats.get("has_data"):
        return {
            "user_id": str(user_id),
            "type": period,
            "stats": stats,
            "narrative": None,
        }

    # Chronicler 叙事增强
    narrative = narrate_period_report(stats)

    return {
        "user_id": str(user_id),
        "type": period,
        "stats": stats,
        "narrative": narrative,
    }


# ---------------------------------------------------------------------------
# Profiler 编排
# ---------------------------------------------------------------------------

def run_strategy_profile(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """生成策略画像（统计 + 叙事）。"""
    stats = generate_strategy_profile(user_id, db)

    if not stats.get("has_data"):
        return {
            "user_id": str(user_id),
            "profile_stats": stats,
            "narrative": None,
        }

    # 统计交易数
    trade_count = (
        db.query(func.count(Trade.id))
        .filter(Trade.user_id == user_id)
        .scalar()
    ) or 0

    # Profiler 叙事
    narrative = generate_strategy_narrative(stats, trade_count)

    # 偏差诊断叙事
    bias_narrative = None
    if stats.get("bias_analysis"):
        bias_narrative = narrate_bias_diagnosis(stats["bias_analysis"])

    return {
        "user_id": str(user_id),
        "profile_stats": stats,
        "narrative": narrative,
        "bias_narrative": bias_narrative,
    }


# ---------------------------------------------------------------------------
# Shadow：影子仓匹配系数
# ---------------------------------------------------------------------------

def calculate_shadow_match(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    计算影子仓与真实操作的匹配系数。

    逻辑：
    1. 获取用户的影子仓标的
    2. 检查用户是否在影子仓建仓后真实交易了这些标的
    3. 计算：匹配率 = 真实交易过的影子仓标的 / 总影子仓标的
    4. 对每个影子仓标的，比较假设入场价 vs 真实入场价

    输出不含建议，只呈现事实差异。
    """
    shadows = (
        db.query(ShadowPosition)
        .options(joinedload(ShadowPosition.asset))
        .filter(ShadowPosition.user_id == user_id)
        .all()
    )

    if not shadows:
        return {
            "user_id": str(user_id),
            "shadow_count": 0,
            "matches": [],
            "match_rate": 0.0,
        }

    matches = []
    matched_count = 0

    for sp in shadows:
        if not sp.asset:
            continue

        # 检查用户是否真实交易过该标的
        real_trade = (
            db.query(Trade)
            .filter(
                Trade.user_id == user_id,
                Trade.asset_id == sp.asset_id,
                Trade.direction.in_(["buy"]),
            )
            .order_by(Trade.traded_at.desc())
            .first()
        )

        match_item: dict[str, Any] = {
            "asset_name": sp.asset.name,
            "asset_code": sp.asset.code,
            "shadow_type": sp.shadow_type.value if sp.shadow_type else "",
            "hypothetical_price": float(sp.hypothetical_entry_price) if sp.hypothetical_entry_price else None,
            "actually_traded": real_trade is not None,
        }

        if real_trade:
            matched_count += 1
            match_item["real_entry_price"] = float(real_trade.price)
            match_item["real_traded_at"] = real_trade.traded_at.isoformat() if real_trade.traded_at else None

            # 计算价格偏差
            if sp.hypothetical_entry_price and sp.hypothetical_entry_price > 0:
                deviation = (real_trade.price - sp.hypothetical_entry_price) / sp.hypothetical_entry_price * 100
                match_item["price_deviation_pct"] = round(deviation, 2)
                match_item["deviation_note"] = (
                    f"实际入场价{'高于' if deviation > 0 else '低于'}观望时假设价 {abs(deviation):.1f}%"
                )
        else:
            match_item["deviation_note"] = "观望中，尚未实际交易"

        matches.append(match_item)

    match_rate = matched_count / len(shadows) * 100 if shadows else 0.0

    return {
        "user_id": str(user_id),
        "shadow_count": len(shadows),
        "matched_count": matched_count,
        "match_rate": round(match_rate, 1),
        "matches": matches,
    }


# ---------------------------------------------------------------------------
# 入口：第五层全流程
# ---------------------------------------------------------------------------

def run_evolution_layer(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    运行第五层完整流程：
    1. 日报生成
    2. 策略画像（如果数据足够）
    3. 影子仓匹配
    """
    daily = run_daily_report(db, user_id)

    # 策略画像仅在有足够数据时生成
    trade_count = (
        db.query(func.count(Trade.id))
        .filter(Trade.user_id == user_id)
        .scalar()
    ) or 0

    profile = None
    if trade_count >= 5:
        profile = run_strategy_profile(db, user_id)

    shadow = calculate_shadow_match(db, user_id)

    return {
        "user_id": str(user_id),
        "daily_report": daily,
        "strategy_profile": profile,
        "shadow_match": shadow,
    }
