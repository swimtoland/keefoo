"""
第一层：信息收集服务（Data Collection Service）

职责：
- 根据每个用户的持仓标的 + 影子仓标的，定向采集行情与新闻
- 异动检测（价格波动 >5%）自动生成 Event
- 新闻按标的名称/代码/行业关键词匹配，写入 Event + EventAssetLink
- 去重：同一条新闻不重复入库

原则："宁可错过不要放过" —— 宽口径采集，后续由第二层过滤
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import distinct, func
from sqlalchemy.orm import Session, joinedload

from app.core.database import SessionLocal
from app.models.models import (
    Asset,
    Event,
    EventAssetLink,
    EventType,
    ImpactLevel,
    ShadowPosition,
    SourceTier,
    Trade,
    TradeStatus,
    User,
)
from app.services.market_data_service import (
    get_financial_news,
    get_stock_realtime,
    get_fund_realtime,
)


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------

def _news_fingerprint(title: str, source: str) -> str:
    """用标题 + 来源生成指纹，用于去重。"""
    raw = f"{title.strip()}|{source.strip()}".lower()
    return hashlib.md5(raw.encode()).hexdigest()


def _title_matches_asset(title: str, asset: Asset) -> bool:
    """判断新闻标题是否与某个标的相关（名称 / 代码 / 行业关键词匹配）。"""
    if not title:
        return False
    t = title.lower()
    # 代码匹配
    if asset.code and asset.code in t:
        return True
    # 名称匹配（去掉常见后缀）
    if asset.name:
        name = asset.name.replace("股份", "").replace("有限公司", "").strip()
        if len(name) >= 2 and name.lower() in t:
            return True
    return False


def _sector_matches(title: str, sectors: set[str]) -> list[str]:
    """返回标题中命中的行业关键词列表。"""
    if not title or not sectors:
        return []
    t = title.lower()
    return [s for s in sectors if s and s.lower() in t]


# ---------------------------------------------------------------------------
# 核心：获取用户关注标的列表
# ---------------------------------------------------------------------------

def get_user_watchlist(db: Session, user_id: uuid.UUID) -> list[Asset]:
    """
    获取用户所有需要监控的标的：
    - 持仓标的（有 open 状态交易的）
    - 影子仓标的
    去重后返回。
    """
    # 持仓标的
    held_asset_ids = (
        db.query(distinct(Trade.asset_id))
        .filter(Trade.user_id == user_id, Trade.status == TradeStatus.open)
        .all()
    )
    held_ids = {row[0] for row in held_asset_ids}

    # 影子仓标的
    shadow_asset_ids = (
        db.query(distinct(ShadowPosition.asset_id))
        .filter(ShadowPosition.user_id == user_id)
        .all()
    )
    shadow_ids = {row[0] for row in shadow_asset_ids}

    all_ids = held_ids | shadow_ids
    if not all_ids:
        return []

    assets = db.query(Asset).filter(Asset.id.in_(all_ids)).all()
    return assets


def get_all_active_user_ids(db: Session) -> list[uuid.UUID]:
    """获取所有有持仓或影子仓的活跃用户 ID。"""
    trade_users = db.query(distinct(Trade.user_id)).filter(Trade.status == TradeStatus.open).all()
    shadow_users = db.query(distinct(ShadowPosition.user_id)).all()
    return list({row[0] for row in trade_users} | {row[0] for row in shadow_users})


# ---------------------------------------------------------------------------
# 核心：异动检测
# ---------------------------------------------------------------------------

PRICE_ALERT_THRESHOLD = 5.0  # 涨跌幅 >5% 触发异动事件


def detect_price_alerts(db: Session, assets: list[Asset]) -> list[Event]:
    """
    对标的列表逐一拉取实时行情，检测价格异动。
    异动标准：涨跌幅绝对值 > PRICE_ALERT_THRESHOLD
    返回新创建的 Event 列表。
    """
    created_events: list[Event] = []

    for asset in assets:
        code = asset.code
        if not code:
            continue

        # 根据标的类型选择行情接口
        if asset.asset_type and asset.asset_type.value == "fund":
            quote = get_fund_realtime(code)
            change_pct = quote.get("change_pct", 0.0)
            price = quote.get("nav", 0.0)
        else:
            quote = get_stock_realtime(code)
            change_pct = quote.get("change_pct", 0.0)
            price = quote.get("price", 0.0)

        if abs(change_pct) < PRICE_ALERT_THRESHOLD:
            continue

        # 去重：今天是否已经为该标的生成过异动事件
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = (
            db.query(Event)
            .join(EventAssetLink)
            .filter(
                Event.event_type == EventType.announcement,
                EventAssetLink.asset_id == asset.id,
                Event.occurred_at >= today_start,
                Event.title.contains("异动"),
            )
            .first()
        )
        if existing:
            continue

        direction = "涨" if change_pct > 0 else "跌"
        event = Event(
            id=uuid.uuid4(),
            event_type=EventType.announcement,
            title=f"{asset.name}({asset.code}) 今日{direction}幅 {abs(change_pct):.1f}%，触发异动预警",
            summary=f"当前价格 {price}，涨跌幅 {change_pct:+.2f}%",
            source_tier=SourceTier.L1_official,
            impact_level=ImpactLevel.high,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(event)

        link = EventAssetLink(
            id=uuid.uuid4(),
            event_id=event.id,
            asset_id=asset.id,
            relevance_score=1.0,  # 直接相关，最高分
        )
        db.add(link)
        created_events.append(event)

    return created_events


# ---------------------------------------------------------------------------
# 核心：新闻采集与标的匹配
# ---------------------------------------------------------------------------

def collect_and_match_news(db: Session, assets: list[Asset], count: int = 100) -> list[Event]:
    """
    1. 拉取通用财经新闻
    2. 按标的名称/代码/行业关键词匹配
    3. 有匹配的写入 Event + EventAssetLink
    4. 无匹配的丢弃（第一层只关心与用户持仓相关的）
    """
    raw_news = get_financial_news(count)
    if not raw_news:
        return []

    # 预处理：构建行业 → 标的映射
    sectors: set[str] = set()
    sector_to_assets: dict[str, list[Asset]] = {}
    for a in assets:
        if a.sector:
            sectors.add(a.sector)
            sector_to_assets.setdefault(a.sector, []).append(a)

    created_events: list[Event] = []

    for news_item in raw_news:
        title = news_item.get("title", "").strip()
        if not title:
            continue

        # 去重：用指纹检查是否已入库
        fp = _news_fingerprint(title, news_item.get("source", ""))
        existing = db.query(Event).filter(Event.title == title).first()
        if existing:
            # 已存在的事件，但可能需要补充标的关联
            _ensure_asset_links(db, existing, assets, sectors, sector_to_assets)
            continue

        # 匹配标的
        matched_assets: list[tuple[Asset, float]] = []

        # 直接匹配（标的名/代码出现在标题中）
        for a in assets:
            if _title_matches_asset(title, a):
                matched_assets.append((a, 0.8))

        # 行业匹配
        hit_sectors = _sector_matches(title, sectors)
        for s in hit_sectors:
            for a in sector_to_assets.get(s, []):
                if not any(ma.id == a.id for ma, _ in matched_assets):
                    matched_assets.append((a, 0.4))

        # 无匹配 → 跳过（宁可错过不要放过，但完全无关的不入库）
        if not matched_assets:
            continue

        # 判断 impact_level
        impact = ImpactLevel.low
        high_keywords = ["暴跌", "暴涨", "涨停", "跌停", "重大", "突发", "紧急", "停牌", "退市"]
        medium_keywords = ["财报", "业绩", "减持", "增持", "回购", "分红", "研报", "评级"]
        if any(kw in title for kw in high_keywords):
            impact = ImpactLevel.high
        elif any(kw in title for kw in medium_keywords):
            impact = ImpactLevel.medium

        # 判断 event_type
        event_type = _infer_event_type(title)

        # 解析发布时间
        publish_time = _parse_publish_time(news_item.get("publish_time", ""))

        event = Event(
            id=uuid.uuid4(),
            event_type=event_type,
            title=title,
            summary=news_item.get("summary", "")[:500] or None,
            source_url=news_item.get("url", "") or None,
            source_tier=SourceTier.L2_professional,
            impact_level=impact,
            occurred_at=publish_time,
        )
        db.add(event)

        for matched_asset, score in matched_assets:
            link = EventAssetLink(
                id=uuid.uuid4(),
                event_id=event.id,
                asset_id=matched_asset.id,
                relevance_score=score,
            )
            db.add(link)

        created_events.append(event)

    return created_events


def _ensure_asset_links(
    db: Session,
    event: Event,
    assets: list[Asset],
    sectors: set[str],
    sector_to_assets: dict[str, list[Asset]],
) -> None:
    """为已存在的事件补充缺失的标的关联。"""
    existing_asset_ids = {link.asset_id for link in event.asset_links}

    for a in assets:
        if a.id in existing_asset_ids:
            continue
        if _title_matches_asset(event.title, a):
            link = EventAssetLink(
                id=uuid.uuid4(),
                event_id=event.id,
                asset_id=a.id,
                relevance_score=0.8,
            )
            db.add(link)

    hit_sectors = _sector_matches(event.title, sectors)
    for s in hit_sectors:
        for a in sector_to_assets.get(s, []):
            if a.id not in existing_asset_ids:
                link = EventAssetLink(
                    id=uuid.uuid4(),
                    event_id=event.id,
                    asset_id=a.id,
                    relevance_score=0.4,
                )
                db.add(link)


def _infer_event_type(title: str) -> EventType:
    """根据标题关键词推断事件类型。"""
    if any(kw in title for kw in ["财报", "业绩", "营收", "净利", "年报", "季报", "中报"]):
        return EventType.earnings
    if any(kw in title for kw in ["政策", "监管", "央行", "国务院", "证监会", "降准", "降息", "利率"]):
        return EventType.policy
    if any(kw in title for kw in ["董事", "高管", "总经理", "董事长", "管理层"]):
        return EventType.executive
    if any(kw in title for kw in ["评级", "研报", "目标价", "券商"]):
        return EventType.rating
    if any(kw in title for kw in ["GDP", "CPI", "PMI", "宏观", "就业", "通胀"]):
        return EventType.macro
    return EventType.announcement


def _parse_publish_time(time_str: str) -> datetime:
    """尝试解析发布时间，失败则用当前时间。"""
    if not time_str:
        return datetime.now(timezone.utc)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(time_str.strip(), fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 入口：单用户采集
# ---------------------------------------------------------------------------

def collect_for_user(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """
    对单个用户执行一次完整的第一层数据采集。

    返回采集结果摘要：
    {
        "user_id": "...",
        "assets_monitored": 5,
        "price_alerts": 1,
        "news_matched": 8,
    }
    """
    assets = get_user_watchlist(db, user_id)
    if not assets:
        return {
            "user_id": str(user_id),
            "assets_monitored": 0,
            "price_alerts": 0,
            "news_matched": 0,
        }

    # 1. 异动检测
    price_events = detect_price_alerts(db, assets)

    # 2. 新闻匹配
    news_events = collect_and_match_news(db, assets)

    db.commit()

    return {
        "user_id": str(user_id),
        "assets_monitored": len(assets),
        "price_alerts": len(price_events),
        "news_matched": len(news_events),
    }


# ---------------------------------------------------------------------------
# 入口：全量采集（所有活跃用户）
# ---------------------------------------------------------------------------

def collect_for_all_users() -> list[dict[str, Any]]:
    """
    对所有活跃用户执行第一层数据采集。
    适合由定时任务调用（如每日收盘后、盘中每小时一次）。
    """
    db = SessionLocal()
    try:
        user_ids = get_all_active_user_ids(db)
        results = []

        # 优化：先收集所有用户关注的标的（去重），批量拉取行情和新闻
        # 再按用户分发。避免多个用户关注同一标的时重复拉取 API。
        all_assets_map: dict[uuid.UUID, Asset] = {}
        user_assets_map: dict[uuid.UUID, list[Asset]] = {}

        for uid in user_ids:
            assets = get_user_watchlist(db, uid)
            user_assets_map[uid] = assets
            for a in assets:
                all_assets_map[a.id] = a

        all_assets = list(all_assets_map.values())

        # 批量异动检测（所有标的只检测一次）
        price_events = detect_price_alerts(db, all_assets)

        # 批量新闻匹配（所有标的一次匹配）
        news_events = collect_and_match_news(db, all_assets)

        db.commit()

        # 汇总每个用户的结果
        for uid in user_ids:
            user_asset_ids = {a.id for a in user_assets_map.get(uid, [])}
            user_price = [
                e for e in price_events
                if any(link.asset_id in user_asset_ids for link in e.asset_links)
            ]
            user_news = [
                e for e in news_events
                if any(link.asset_id in user_asset_ids for link in e.asset_links)
            ]
            results.append({
                "user_id": str(uid),
                "assets_monitored": len(user_assets_map.get(uid, [])),
                "price_alerts": len(user_price),
                "news_matched": len(user_news),
            })

        return results
    finally:
        db.close()
