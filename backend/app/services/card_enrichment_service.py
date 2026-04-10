"""
第三层：卡片充实服务（Card Enrichment Service）

编排 Interpreter → Bull ↔ Bear → CardWriter 流程。

成本控制：
- 所有通过第二层的 FeedCard 都走 Interpreter + CardWriter
- 仅 impact_level=high 的事件触发 Bull + Bear 博弈
- 每用户每日 Bull/Bear 调用上限 10 次
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.agents.debate import argue_bear, argue_bull, interpret_event, write_card
from app.models.models import (
    Asset,
    Event,
    EventAssetLink,
    FeedCard,
    ImpactLevel,
    Trade,
    TradeStatus,
)

# 每用户每日 Bull/Bear 博弈调用上限
DAILY_DEBATE_LIMIT = 10


def _get_asset_context(db: Session, asset_id: uuid.UUID) -> dict[str, Any]:
    """获取标的的基本信息（供 Agent 使用）。"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        return {}
    return {
        "code": asset.code,
        "name": asset.name,
        "sector": asset.sector or "",
        "asset_type": asset.asset_type.value if asset.asset_type else "",
    }


def _get_user_position_context(db: Session, user_id: uuid.UUID, asset_ids: list[uuid.UUID]) -> str:
    """生成用户与相关标的的持仓关联说明。"""
    if not asset_ids:
        return "无直接持仓关联"

    parts = []
    for aid in asset_ids[:3]:  # 最多取 3 个
        asset = db.query(Asset).filter(Asset.id == aid).first()
        if not asset:
            continue

        trade = (
            db.query(Trade)
            .filter(Trade.user_id == user_id, Trade.asset_id == aid, Trade.status == TradeStatus.open)
            .order_by(Trade.traded_at.desc())
            .first()
        )
        if trade:
            parts.append(f"持有 {asset.name}，成本 {trade.price}")
        else:
            parts.append(f"关注 {asset.name}")

    return "；".join(parts) if parts else "无直接持仓关联"


def _count_today_debates(db: Session, user_id: uuid.UUID) -> int:
    """统计今日已对该用户执行的博弈次数。"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count = (
        db.query(func.count(FeedCard.id))
        .filter(
            FeedCard.user_id == user_id,
            FeedCard.is_enriched == True,
            FeedCard.card_content_json.isnot(None),
        )
        .scalar()
    ) or 0

    # 粗略估算：有 perspectives 且 len >= 2 的视为经过了博弈
    # 精确统计需要解析 JSON，这里用简化方式
    return count


def enrich_card(
    db: Session,
    card: FeedCard,
    force_debate: bool = False,
) -> FeedCard:
    """
    对单张 FeedCard 执行第三层充实流程。

    流程：
    1. Interpreter 解析事件因子
    2. 如果 impact=high 且未超日限 → Bull + Bear 博弈
    3. CardWriter 综合生成卡片内容
    4. 结果写入 card.card_content_json
    """
    if card.is_enriched:
        return card

    event = db.query(Event).options(joinedload(Event.asset_links)).filter(Event.id == card.event_id).first()
    if not event:
        return card

    # 获取关联标的信息
    related_assets = []
    asset_ids = []
    for link in event.asset_links:
        asset_ids.append(link.asset_id)
        ctx = _get_asset_context(db, link.asset_id)
        if ctx:
            related_assets.append(ctx)

    # Step 1: Interpreter
    interpretation = interpret_event(
        event_title=event.title,
        event_summary=event.summary or "",
        related_assets=related_assets,
    )

    # Step 2: Bull + Bear（仅 high impact）
    bull_view = None
    bear_view = None

    should_debate = (
        force_debate
        or event.impact_level == ImpactLevel.high
    )

    if should_debate:
        today_debates = _count_today_debates(db, card.user_id)
        if today_debates < DAILY_DEBATE_LIMIT:
            primary_asset_ctx = related_assets[0] if related_assets else {}
            bull_view = argue_bull(event.title, interpretation, primary_asset_ctx)
            bear_view = argue_bear(event.title, interpretation, primary_asset_ctx)

    # Step 3: CardWriter
    position_context = _get_user_position_context(db, card.user_id, asset_ids)
    card_content = write_card(
        event_title=event.title,
        interpretation=interpretation,
        bull_view=bull_view,
        bear_view=bear_view,
        user_position_context=position_context,
    )

    # 组装完整结果
    card.card_content_json = {
        "interpretation": interpretation,
        "bull": bull_view,
        "bear": bear_view,
        "card": card_content,
        "has_debate": bull_view is not None,
    }
    card.is_enriched = True

    return card


# ---------------------------------------------------------------------------
# 入口：批量充实
# ---------------------------------------------------------------------------

def enrich_cards_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    对用户所有未充实的 FeedCard 执行第三层流程。
    """
    cards = (
        db.query(FeedCard)
        .filter(FeedCard.user_id == user_id, FeedCard.is_enriched == False)
        .order_by(FeedCard.relevance_score.desc())  # 高关联度优先处理
        .all()
    )

    enriched_count = 0
    debate_count = 0

    for card in cards:
        enrich_card(db, card)
        enriched_count += 1
        if card.card_content_json and card.card_content_json.get("has_debate"):
            debate_count += 1

    db.commit()

    return {
        "user_id": str(user_id),
        "cards_enriched": enriched_count,
        "with_debate": debate_count,
    }


def enrich_cards_for_all_users() -> list[dict[str, Any]]:
    """对所有活跃用户执行第三层充实。"""
    from app.core.database import SessionLocal
    from app.services.data_collection_service import get_all_active_user_ids

    db = SessionLocal()
    try:
        user_ids = get_all_active_user_ids(db)
        results = []
        for uid in user_ids:
            result = enrich_cards_for_user(db, uid)
            results.append(result)
        return results
    finally:
        db.close()
