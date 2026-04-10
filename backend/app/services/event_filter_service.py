"""
第二层：信息过滤服务（Event Filter Service）

包含两个规则引擎：
- Sentinel：L1 关联度评分（规则引擎，零 Token）
- Weaver：L2 关系链验证（关系查询，零 Token）

原则："宁可放过不要错过" —— 严格筛选但不误杀重要信息

输入：第一层写入的 Event + EventAssetLink
输出：为用户生成 FeedCard（通过筛选的事件）或丢弃（未通过）
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import and_, distinct, func
from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    Asset,
    Event,
    EventAssetLink,
    EventType,
    FeedCard,
    ImpactLevel,
    RelevanceLevel,
    ShadowPosition,
    SourceTier,
    Trade,
    TradeStatus,
    User,
)


# ---------------------------------------------------------------------------
# 配置常量
# ---------------------------------------------------------------------------

# Sentinel 评分阈值：低于此分的事件直接丢弃
SENTINEL_SCORE_THRESHOLD = 15

# 每用户每日 FeedCard 生成上限（防止信息过载）
DAILY_CARD_LIMIT = 50


# ---------------------------------------------------------------------------
# Sentinel：L1 关联度评分（规则引擎）
# ---------------------------------------------------------------------------

class SentinelScorer:
    """
    基于 PRD 定义的评分规则：
    - 直接涉及持仓标的   +50
    - 涉及关联实体       +25
    - 同板块联动         +15
    - 纯宏观背景         +5
    - 用户历史行为权重   +10（用户曾交易过该标的）
    """

    def __init__(self, db: Session, user_id: uuid.UUID):
        self.db = db
        self.user_id = user_id

        # 预加载用户数据，避免逐事件重复查询
        self._held_asset_ids: set[uuid.UUID] = set()
        self._shadow_asset_ids: set[uuid.UUID] = set()
        self._held_sectors: set[str] = set()
        self._ever_traded_asset_ids: set[uuid.UUID] = set()
        self._asset_map: dict[uuid.UUID, Asset] = {}

        self._load_user_context()

    def _load_user_context(self) -> None:
        """一次性加载用户的持仓、影子仓、历史交易标的、行业信息。"""
        # 当前持仓标的
        held_rows = (
            self.db.query(Trade.asset_id)
            .filter(Trade.user_id == self.user_id, Trade.status == TradeStatus.open)
            .distinct()
            .all()
        )
        self._held_asset_ids = {r[0] for r in held_rows}

        # 影子仓标的
        shadow_rows = (
            self.db.query(ShadowPosition.asset_id)
            .filter(ShadowPosition.user_id == self.user_id)
            .distinct()
            .all()
        )
        self._shadow_asset_ids = {r[0] for r in shadow_rows}

        # 历史上所有交易过的标的（含已平仓）
        ever_rows = (
            self.db.query(Trade.asset_id)
            .filter(Trade.user_id == self.user_id)
            .distinct()
            .all()
        )
        self._ever_traded_asset_ids = {r[0] for r in ever_rows}

        # 加载标的详情（用于行业匹配）
        all_ids = self._held_asset_ids | self._shadow_asset_ids
        if all_ids:
            assets = self.db.query(Asset).filter(Asset.id.in_(all_ids)).all()
            for a in assets:
                self._asset_map[a.id] = a
                if a.sector:
                    self._held_sectors.add(a.sector)

    def score(self, event: Event) -> tuple[int, RelevanceLevel]:
        """
        对单条事件进行关联度评分。
        返回 (分数, 关联层级)。
        """
        total = 0
        level = RelevanceLevel.macro  # 默认最低层级

        # 获取该事件关联的标的 ID
        event_asset_ids = {link.asset_id for link in event.asset_links}

        # 规则 1：直接涉及持仓标的 +50
        direct_held = event_asset_ids & self._held_asset_ids
        if direct_held:
            total += 50
            level = RelevanceLevel.direct

        # 规则 2：涉及影子仓标的 +25（视为"关联实体"级别）
        direct_shadow = event_asset_ids & self._shadow_asset_ids
        if direct_shadow:
            total += 25
            if level != RelevanceLevel.direct:
                level = RelevanceLevel.entity

        # 规则 3：同板块联动 +15
        event_sectors = set()
        for aid in event_asset_ids:
            asset = self._asset_map.get(aid)
            if not asset:
                # 事件关联的标的不在用户关注列表中，查一下行业
                asset = self.db.query(Asset).filter(Asset.id == aid).first()
            if asset and asset.sector:
                event_sectors.add(asset.sector)

        sector_overlap = event_sectors & self._held_sectors
        if sector_overlap and not direct_held:
            total += 15
            if level == RelevanceLevel.macro:
                level = RelevanceLevel.sector

        # 规则 4：纯宏观背景 +5
        if event.event_type == EventType.macro:
            total += 5

        # 规则 5：用户历史行为权重 +10（曾经交易过该标的）
        historical = event_asset_ids & self._ever_traded_asset_ids
        if historical:
            total += 10

        # 额外加权：信息源等级
        if event.source_tier == SourceTier.L1_official:
            total += 5
        elif event.source_tier == SourceTier.L2_professional:
            total += 2

        # 额外加权：impact_level
        if event.impact_level == ImpactLevel.high:
            total += 10
        elif event.impact_level == ImpactLevel.medium:
            total += 3

        return total, level


# ---------------------------------------------------------------------------
# Weaver：L2 关系链验证
# ---------------------------------------------------------------------------

class WeaverValidator:
    """
    验证事件与用户持仓之间是否能形成逻辑闭环。

    当前实现基于关系型数据（无 Neo4j 阶段）：
    - 检查 Event → Asset → User Position 的路径是否存在
    - 检查同板块联动是否有足够支撑（至少有一个板块内标的近期有交易）
    - 宏观事件检查是否与用户持仓行业存在已知传导关系

    后续迁移到 Neo4j 后，这层替换为图查询，接口不变。
    """

    # 宏观指标 → 受影响行业的粗粒度映射（MVP 阶段硬编码，后续从图谱读取）
    MACRO_SECTOR_MAP: dict[str, list[str]] = {
        "降准": ["银行", "券商", "地产", "保险"],
        "降息": ["银行", "券商", "地产", "保险"],
        "加息": ["银行", "券商", "地产"],
        "CPI": ["消费", "食品饮料", "农业"],
        "PMI": ["制造", "机械", "化工"],
        "出口": ["纺织", "电子", "机械"],
        "新能源": ["新能源", "电力", "光伏", "锂电"],
        "半导体": ["半导体", "电子", "芯片"],
        "AI": ["AI", "计算机", "软件", "通信"],
        "医保": ["医药", "医疗", "生物"],
    }

    def __init__(self, db: Session, user_id: uuid.UUID, held_sectors: set[str]):
        self.db = db
        self.user_id = user_id
        self.held_sectors = held_sectors

    def validate(self, event: Event, sentinel_score: int, level: RelevanceLevel) -> bool:
        """
        验证事件是否能与用户持仓形成逻辑闭环。
        返回 True 表示通过验证，False 表示应被剪枝。
        """
        # 直接关联的事件无需验证，必然通过
        if level == RelevanceLevel.direct:
            return True

        # 实体关联（影子仓）也默认通过
        if level == RelevanceLevel.entity:
            return True

        # 板块联动：检查该板块内用户是否有近期活跃交易
        if level == RelevanceLevel.sector:
            return self._validate_sector_link(event)

        # 宏观事件：检查是否与用户持仓行业有传导关系
        if level == RelevanceLevel.macro:
            return self._validate_macro_link(event)

        # 未知层级，保守通过（宁可放过不要错过）
        return True

    def _validate_sector_link(self, event: Event) -> bool:
        """板块联动验证：用户在该板块内至少有一个标的近 30 天有过交易。"""
        event_asset_ids = {link.asset_id for link in event.asset_links}
        event_assets = self.db.query(Asset).filter(Asset.id.in_(event_asset_ids)).all()
        event_sectors = {a.sector for a in event_assets if a.sector}

        overlap = event_sectors & self.held_sectors
        if not overlap:
            return False

        # 检查该板块是否有近期交易活跃度
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        for sector in overlap:
            recent_trade = (
                self.db.query(Trade)
                .join(Asset)
                .filter(
                    Trade.user_id == self.user_id,
                    Asset.sector == sector,
                    Trade.traded_at >= thirty_days_ago,
                )
                .first()
            )
            if recent_trade:
                return True

        # 板块无近期交易，降级但不完全丢弃——如果 sentinel 分数足够高仍通过
        return False

    def _validate_macro_link(self, event: Event) -> bool:
        """宏观事件验证：标题关键词是否与用户持仓行业有传导关系。"""
        title = event.title or ""
        for keyword, affected_sectors in self.MACRO_SECTOR_MAP.items():
            if keyword in title:
                if self.held_sectors & set(affected_sectors):
                    return True
        # 无法建立传导链 → 剪枝
        return False


# ---------------------------------------------------------------------------
# 入口：为用户过滤事件并生成 FeedCard
# ---------------------------------------------------------------------------

def filter_events_for_user(
    db: Session,
    user_id: uuid.UUID,
    since: Optional[datetime] = None,
) -> dict[str, Any]:
    """
    对用户运行第二层完整过滤流程：
    1. 拉取待处理的 Event（自上次过滤以来的新事件）
    2. Sentinel 评分
    3. Weaver 验证
    4. 通过的 → 生成 FeedCard
    5. 未通过的 → 丢弃

    返回过滤结果摘要。
    """
    if since is None:
        since = datetime.now(timezone.utc) - timedelta(hours=24)

    # 获取待处理事件（已有 EventAssetLink 的事件，且事件发生在 since 之后）
    events = (
        db.query(Event)
        .options(joinedload(Event.asset_links))
        .filter(Event.occurred_at >= since)
        .all()
    )

    if not events:
        return {
            "user_id": str(user_id),
            "events_evaluated": 0,
            "passed": 0,
            "filtered_out": 0,
        }

    # 已经为该用户生成过 FeedCard 的事件 → 跳过
    existing_event_ids = set(
        row[0]
        for row in db.query(FeedCard.event_id)
        .filter(FeedCard.user_id == user_id)
        .all()
    )

    # 今日已生成的 FeedCard 数量（频控）
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_card_count = (
        db.query(func.count(FeedCard.id))
        .filter(FeedCard.user_id == user_id)
        .scalar()
    ) or 0

    # 初始化 Sentinel 和 Weaver
    sentinel = SentinelScorer(db, user_id)
    weaver = WeaverValidator(db, user_id, sentinel._held_sectors)

    passed = 0
    filtered_out = 0

    for event in events:
        # 跳过已处理
        if event.id in existing_event_ids:
            continue

        # 频控检查
        if today_card_count + passed >= DAILY_CARD_LIMIT:
            break

        # Sentinel 评分
        score, level = sentinel.score(event)

        # 低于阈值 → 直接丢弃
        if score < SENTINEL_SCORE_THRESHOLD:
            filtered_out += 1
            continue

        # Weaver 验证
        if not weaver.validate(event, score, level):
            filtered_out += 1
            continue

        # 通过 → 生成 FeedCard
        related_ids = [str(link.asset_id) for link in event.asset_links]
        card = FeedCard(
            id=uuid.uuid4(),
            user_id=user_id,
            event_id=event.id,
            relevance_level=level,
            relevance_score=float(score),
            relevance_note=_build_relevance_note(level, score, event),
            related_asset_ids=related_ids,
            is_read=False,
            is_pushed=False,
        )
        db.add(card)
        passed += 1

    db.commit()

    return {
        "user_id": str(user_id),
        "events_evaluated": len(events),
        "passed": passed,
        "filtered_out": filtered_out,
    }


def _build_relevance_note(level: RelevanceLevel, score: int, event: Event) -> str:
    """生成简短的关联说明，用于卡片展示。"""
    prefix = {
        RelevanceLevel.direct: "直接相关",
        RelevanceLevel.entity: "关注标的",
        RelevanceLevel.sector: "板块联动",
        RelevanceLevel.macro: "宏观传导",
    }.get(level, "相关")

    return f"{prefix}（关联度 {score}）"


# ---------------------------------------------------------------------------
# 入口：全量过滤
# ---------------------------------------------------------------------------

def filter_events_for_all_users(
    since: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    """
    对所有活跃用户运行第二层过滤。
    适合在第一层采集完成后紧接着调用。
    """
    from app.core.database import SessionLocal
    from app.services.data_collection_service import get_all_active_user_ids

    db = SessionLocal()
    try:
        user_ids = get_all_active_user_ids(db)
        results = []
        for uid in user_ids:
            result = filter_events_for_user(db, uid, since)
            results.append(result)
        return results
    finally:
        db.close()
