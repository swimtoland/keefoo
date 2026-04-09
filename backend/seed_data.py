"""
Demo data for KeeFoo (SQLite dev DB).

Run from backend directory:
    venv\\Scripts\\python seed_data.py
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from app.core.auth import hash_password
from app.core.database import Base, SessionLocal, engine
from app.models import models as m

UTC = timezone.utc


def uid(label: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, label)


# Deterministic UUID aligned with logical id "demo-user-001"
DEMO_USER_ID = uuid.uuid5(uuid.NAMESPACE_URL, "demo-user-001")

ASSET_600519 = uid("asset:600519")
ASSET_005827 = uid("asset:005827")
ASSET_161725 = uid("asset:161725")
ASSET_518880 = uid("asset:518880")
ASSET_300750 = uid("asset:300750")
ASSET_601318 = uid("asset:601318")

TRADE_1 = uid("trade:1")
TRADE_2 = uid("trade:2")
TRADE_3 = uid("trade:3")
TRADE_4 = uid("trade:4")
TRADE_5 = uid("trade:5")
TRADE_6 = uid("trade:6")
TRADE_7 = uid("trade:7")
TRADE_8 = uid("trade:8")
TRADE_9 = uid("trade:9")
TRADE_10 = uid("trade:10")
TRADE_11 = uid("trade:11")
TRADE_12 = uid("trade:12")
TRADE_13 = uid("trade:13")
TRADE_14 = uid("trade:14")

EVENT_PBOC = uid("event:pboc-rrr")
EVENT_MT_REPORT = uid("event:mt-annual")
EVENT_CATL_EXEC = uid("event:catl-exec")
EVENT_FED = uid("event:fed-rate")
EVENT_CICC = uid("event:cicc-rating")
EVENT_NOISE = uid("event:social-noise")

SHADOW_1 = uid("shadow:161725")
SHADOW_2 = uid("shadow:518880")

FEED_1 = uid("feed:1")
FEED_2 = uid("feed:2")
FEED_3 = uid("feed:3")
FEED_4 = uid("feed:4")
FEED_5 = uid("feed:5")

# --- Notes / Notebooks demo ids (deterministic) ---

NOTEBOOK_TRADE_NOTES = uid("notebook:trade-notes")
NOTEBOOK_QUARTERLY_GOALS = uid("notebook:quarterly-goals")
NOTEBOOK_PLAN_OF_ACTION = uid("notebook:plan-of-action")

TAG_IMPORTANT = uid("tag:重要")
TAG_WAIT_VERIFY = uid("tag:待验证")
TAG_STRATEGY = uid("tag:策略")
TAG_REVIEW = uid("tag:复盘")

NOTE_1 = uid("note:1")
NOTE_2 = uid("note:2")
NOTE_3 = uid("note:3")
NOTE_4 = uid("note:4")
NOTE_5 = uid("note:5")
NOTE_6 = uid("note:6")

# --- Reminders demo ids (deterministic) ---
REM_1 = uid("reminder:1")
REM_2 = uid("reminder:2")
REM_3 = uid("reminder:3")
REM_4 = uid("reminder:4")
REM_5 = uid("reminder:5")
REM_6 = uid("reminder:6")


def _align_cicc_for_fomo(now: datetime) -> datetime:
    """与 TRADE_6 同一标的、1 小时内，便于 FOMO 演示。"""
    return now - timedelta(days=5, hours=2)


def _build_core_trades(now: datetime) -> list[m.Trade]:
    """含基础 5 笔 + 扩展 9 笔已关闭交易；时间相对 now，便于周报/月报有数据。"""
    t_open_a = now - timedelta(days=10, hours=3)
    t_open_b = now - timedelta(days=14, hours=5)
    t_open_c = now - timedelta(days=21, hours=2)
    # keep within recent 30 days for calendar demo
    t_closed_a = now - timedelta(days=24, hours=4)
    t_closed_b = now - timedelta(days=28, hours=1)
    cicc_time = _align_cicc_for_fomo(now)
    t_fomo = cicc_time + timedelta(minutes=18)

    extra_times = [
        # Spread within last 30 days for month view coverage
        now - timedelta(days=1, hours=3),
        now - timedelta(days=3, hours=6),
        now - timedelta(days=5, hours=9),
        now - timedelta(days=7, hours=11),
        now - timedelta(days=9, hours=8),
        now - timedelta(days=12, hours=14),
        now - timedelta(days=15, hours=10),
        now - timedelta(days=18, hours=16),
        now - timedelta(days=27, hours=12),
    ]

    base = [
        m.Trade(
            id=TRADE_1,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_600519,
            direction=m.TradeDirection.buy,
            price=1680.0,
            quantity=100.0,
            traded_at=t_open_a,
            market_context={"index": "震荡", "northbound": "净流入"},
            decision_note="长期持有核心资产，回调加仓。",
            emotion_score=6,
            confidence_score=8,
            note_source=m.NoteSource.user_input,
            status=m.TradeStatus.open,
            agent_question_sent=True,
            agent_question_text="你在1680元建仓了贵州茅台，当天白酒板块有政策利好，你是基于中线消费逻辑，还是短线技术突破？",
            agent_question_sent_at=t_open_a,
        ),
        m.Trade(
            id=TRADE_2,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_300750,
            direction=m.TradeDirection.buy,
            price=198.5,
            quantity=200.0,
            traded_at=t_open_b,
            market_context={"sector": "新能源回调"},
            decision_note="产业链龙头，估值回落后试探仓位。",
            emotion_score=5,
            confidence_score=6,
            note_source=m.NoteSource.user_input,
            status=m.TradeStatus.open,
            agent_question_sent=True,
            agent_question_text="你在198.5元买入宁德时代，提到了赌财报，这是你一贯的事件驱动风格吗？",
            agent_question_sent_at=t_open_b,
        ),
        m.Trade(
            id=TRADE_3,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_601318,
            direction=m.TradeDirection.buy,
            price=46.2,
            quantity=500.0,
            traded_at=t_open_c,
            market_context={"theme": "高股息"},
            decision_note="分散配置，低估值修复。",
            emotion_score=4,
            confidence_score=7,
            note_source=m.NoteSource.agent_parsed,
            status=m.TradeStatus.open,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_4,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_005827,
            direction=m.TradeDirection.buy,
            price=2.45,
            quantity=10000.0,
            traded_at=t_closed_a,
            market_context={},
            decision_note="定投加仓。",
            emotion_score=5,
            confidence_score=6,
            note_source=m.NoteSource.user_input,
            pnl=420.0,
            holding_days=88,
            exit_reason=m.ExitReason.rebalance,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_5,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_161725,
            direction=m.TradeDirection.sell,
            price=1.12,
            quantity=8000.0,
            traded_at=t_closed_b,
            market_context={"liquidity": "正常"},
            decision_note="止盈减仓，保留现金等待更好赔率。",
            emotion_score=7,
            confidence_score=7,
            note_source=m.NoteSource.user_input,
            pnl=960.0,
            holding_days=120,
            exit_reason=m.ExitReason.take_profit,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
    ]

    extras: list[m.Trade] = [
        m.Trade(
            id=TRADE_6,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_600519,
            direction=m.TradeDirection.sell,
            price=1720.0,
            quantity=30.0,
            traded_at=extra_times[0],
            market_context={"note": "与研报时间接近"},
            decision_note="类型:event_driven 冲高减仓。",
            emotion_score=9,
            confidence_score=4,
            note_source=m.NoteSource.user_input,
            pnl=-2100.0,
            holding_days=55,
            exit_reason=m.ExitReason.stop_loss,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_7,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_300750,
            direction=m.TradeDirection.sell,
            price=205.0,
            quantity=100.0,
            traded_at=extra_times[1],
            market_context={},
            decision_note="类型:technical 破位止盈。",
            emotion_score=5,
            confidence_score=8,
            note_source=m.NoteSource.agent_parsed,
            pnl=520.0,
            holding_days=14,
            exit_reason=m.ExitReason.take_profit,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_8,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_601318,
            direction=m.TradeDirection.sell,
            price=48.0,
            quantity=300.0,
            traded_at=extra_times[2],
            market_context={},
            decision_note="类型:fundamental 估值修复兑现。",
            emotion_score=4,
            confidence_score=7,
            note_source=m.NoteSource.silence_inferred,
            pnl=380.0,
            holding_days=22,
            exit_reason=m.ExitReason.take_profit,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_9,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_518880,
            direction=m.TradeDirection.buy,
            price=5.55,
            quantity=2000.0,
            traded_at=extra_times[3],
            market_context={"macro": "避险"},
            decision_note="类型:sentiment 对冲权益波动。",
            emotion_score=8,
            confidence_score=5,
            note_source=m.NoteSource.user_input,
            pnl=-180.0,
            holding_days=6,
            exit_reason=m.ExitReason.stop_loss,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_10,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_005827,
            direction=m.TradeDirection.sell,
            price=2.52,
            quantity=5000.0,
            traded_at=extra_times[4],
            market_context={},
            decision_note="再平衡，降低主动基金暴露。",
            emotion_score=6,
            confidence_score=6,
            note_source=m.NoteSource.agent_parsed,
            pnl=310.0,
            holding_days=40,
            exit_reason=m.ExitReason.rebalance,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_11,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_161725,
            direction=m.TradeDirection.buy,
            price=1.08,
            quantity=6000.0,
            traded_at=extra_times[5],
            market_context={},
            decision_note="白酒指数回调加仓。",
            emotion_score=8,
            confidence_score=5,
            note_source=m.NoteSource.silence_inferred,
            pnl=-420.0,
            holding_days=18,
            exit_reason=m.ExitReason.stop_loss,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_12,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_600519,
            direction=m.TradeDirection.buy,
            price=1650.0,
            quantity=20.0,
            traded_at=extra_times[6],
            market_context={},
            decision_note="类型:fundamental 分红预期。",
            emotion_score=3,
            confidence_score=9,
            note_source=m.NoteSource.user_input,
            pnl=2400.0,
            holding_days=35,
            exit_reason=m.ExitReason.take_profit,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_13,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_300750,
            direction=m.TradeDirection.buy,
            price=192.0,
            quantity=150.0,
            traded_at=extra_times[7],
            market_context={},
            decision_note="类型:event_driven 供应链传闻博弈。",
            emotion_score=9,
            confidence_score=4,
            note_source=m.NoteSource.user_input,
            pnl=-950.0,
            holding_days=9,
            exit_reason=m.ExitReason.stop_loss,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
        m.Trade(
            id=TRADE_14,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_601318,
            direction=m.TradeDirection.buy,
            price=45.0,
            quantity=400.0,
            traded_at=extra_times[8],
            market_context={},
            decision_note="类型:technical 均线支撑。",
            emotion_score=7,
            confidence_score=6,
            note_source=m.NoteSource.agent_parsed,
            pnl=120.0,
            holding_days=5,
            exit_reason=m.ExitReason.take_profit,
            status=m.TradeStatus.closed,
            agent_question_sent=False,
        ),
    ]

    return base + extras


def _seed_full(db, now: datetime) -> None:
    user = m.User(
        id=DEMO_USER_ID,
        nickname="KeeFoo体验官",
        email="demo@keefoo.cn",
        password_hash=hash_password("demo123456"),
        subscription_tier=m.SubscriptionTier.free,
        risk_preference=m.RiskPreference.moderate,
        settings_json={"theme": "dark", "locale": "zh-CN"},
    )
    db.add(user)

    assets = [
        m.Asset(
            id=ASSET_600519,
            code="600519",
            name="贵州茅台",
            asset_type=m.AssetType.stock,
            sector="食品饮料",
            market=m.Market.sh,
            meta_json={"list_status": "listed"},
        ),
        m.Asset(
            id=ASSET_005827,
            code="005827",
            name="易方达蓝筹精选混合",
            asset_type=m.AssetType.fund,
            sector="混合基金",
            market=None,
            meta_json={"manager": "张坤"},
        ),
        m.Asset(
            id=ASSET_161725,
            code="161725",
            name="招商中证白酒指数",
            asset_type=m.AssetType.fund,
            sector="消费",
            market=None,
            meta_json={"index": "中证白酒"},
        ),
        m.Asset(
            id=ASSET_518880,
            code="518880",
            name="华安黄金ETF",
            asset_type=m.AssetType.gold,
            sector="贵金属",
            market=m.Market.sh,
            meta_json={"underlying": "Au9999"},
        ),
        m.Asset(
            id=ASSET_300750,
            code="300750",
            name="宁德时代",
            asset_type=m.AssetType.stock,
            sector="电力设备",
            market=m.Market.sz,
            meta_json={},
        ),
        m.Asset(
            id=ASSET_601318,
            code="601318",
            name="中国平安",
            asset_type=m.AssetType.stock,
            sector="非银金融",
            market=m.Market.sh,
            meta_json={},
        ),
    ]
    db.add_all(assets)

    trades = _build_core_trades(now)
    db.add_all(trades)

    shadows = [
        m.ShadowPosition(
            id=SHADOW_1,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_161725,
            shadow_type=m.ShadowType.watchlist,
            hypothetical_entry_price=1.05,
            scenario_push_enabled=True,
            push_strength_cap="direction_only",
        ),
        m.ShadowPosition(
            id=SHADOW_2,
            user_id=DEMO_USER_ID,
            asset_id=ASSET_518880,
            shadow_type=m.ShadowType.missed,
            hypothetical_entry_price=5.42,
            scenario_push_enabled=True,
            push_strength_cap="direction_only",
        ),
    ]
    db.add_all(shadows)

    cicc_at = _align_cicc_for_fomo(now)
    e_time_1 = now - timedelta(days=30, hours=1)
    e_time_2 = now - timedelta(days=20, hours=8)
    e_time_3 = now - timedelta(days=18, hours=3)
    e_time_4 = now - timedelta(days=12, hours=5)
    e_time_5 = cicc_at
    e_time_6 = now - timedelta(days=2, hours=4)

    events = [
        m.Event(
            id=EVENT_PBOC,
            event_type=m.EventType.policy,
            title="央行宣布降准0.5个百分点",
            summary="释放长期流动性，提振市场风险偏好。",
            source_url="https://example.com/news/pboc-rrr",
            raw_content="中国人民银行决定下调金融机构存款准备金率……",
            source_tier=m.SourceTier.L1_official,
            impact_level=m.ImpactLevel.high,
            occurred_at=e_time_1,
        ),
        m.Event(
            id=EVENT_MT_REPORT,
            event_type=m.EventType.earnings,
            title="贵州茅台发布年度报告",
            summary="营收净利稳健增长，分红方案公布。",
            source_url="https://example.com/ir/mt-annual",
            raw_content="公司全年实现营业收入……",
            source_tier=m.SourceTier.L1_official,
            impact_level=m.ImpactLevel.high,
            occurred_at=e_time_2,
        ),
        m.Event(
            id=EVENT_CATL_EXEC,
            event_type=m.EventType.executive,
            title="宁德时代公告高管变动",
            summary="核心管理人员辞职，市场关注治理与战略连续性。",
            source_url="https://example.com/announce/catl",
            raw_content="公司董事会收到书面辞职报告……",
            source_tier=m.SourceTier.L1_official,
            impact_level=m.ImpactLevel.medium,
            occurred_at=e_time_3,
        ),
        m.Event(
            id=EVENT_FED,
            event_type=m.EventType.macro,
            title="美联储维持利率区间不变",
            summary="点阵图偏鹰，全球风险资产波动加剧。",
            source_url="https://example.com/macro/fed",
            raw_content="FOMC声明及新闻发布会要点……",
            source_tier=m.SourceTier.L1_official,
            impact_level=m.ImpactLevel.high,
            occurred_at=e_time_4,
        ),
        m.Event(
            id=EVENT_CICC,
            event_type=m.EventType.rating,
            title="中金公司上调贵州茅台目标价",
            summary="盈利预测上修，给予跑赢行业评级。",
            source_url="https://example.com/research/cicc-mt",
            raw_content="我们上调2025-2026年EPS预测……",
            source_tier=m.SourceTier.L2_professional,
            impact_level=m.ImpactLevel.medium,
            occurred_at=e_time_5,
        ),
        m.Event(
            id=EVENT_NOISE,
            event_type=m.EventType.announcement,
            title="社交平台热议：某概念股“下周必涨”",
            summary="来源可靠性低，情绪驱动为主，注意噪声交易风险。",
            source_url="https://example.com/social/noise",
            raw_content="评论区大量跟风喊单内容……",
            source_tier=m.SourceTier.L3_social,
            impact_level=m.ImpactLevel.low,
            occurred_at=e_time_6,
        ),
    ]
    db.add_all(events)

    links = [
        m.EventAssetLink(
            id=uid("link:pboc-mt"),
            event_id=EVENT_PBOC,
            asset_id=ASSET_600519,
            relevance_score=0.35,
        ),
        m.EventAssetLink(
            id=uid("link:pboc-catl"),
            event_id=EVENT_PBOC,
            asset_id=ASSET_300750,
            relevance_score=0.28,
        ),
        m.EventAssetLink(
            id=uid("link:mt-report"),
            event_id=EVENT_MT_REPORT,
            asset_id=ASSET_600519,
            relevance_score=0.98,
        ),
        m.EventAssetLink(
            id=uid("link:catl-exec"),
            event_id=EVENT_CATL_EXEC,
            asset_id=ASSET_300750,
            relevance_score=0.95,
        ),
        m.EventAssetLink(
            id=uid("link:fed-catl"),
            event_id=EVENT_FED,
            asset_id=ASSET_300750,
            relevance_score=0.42,
        ),
        m.EventAssetLink(
            id=uid("link:cicc-mt"),
            event_id=EVENT_CICC,
            asset_id=ASSET_600519,
            relevance_score=0.88,
        ),
    ]
    db.add_all(links)

    feed_cards = [
        m.FeedCard(
            id=FEED_1,
            user_id=DEMO_USER_ID,
            event_id=EVENT_MT_REPORT,
            relevance_level=m.RelevanceLevel.direct,
            relevance_score=0.96,
            relevance_note="你持有贵州茅台，年报直接决定估值锚与分红预期。",
            related_asset_ids=[str(ASSET_600519)],
            is_read=False,
            is_pushed=True,
        ),
        m.FeedCard(
            id=FEED_2,
            user_id=DEMO_USER_ID,
            event_id=EVENT_CATL_EXEC,
            relevance_level=m.RelevanceLevel.direct,
            relevance_score=0.94,
            relevance_note="宁德时代出现高管变动，与你当前仓位高度相关。",
            related_asset_ids=[str(ASSET_300750)],
            is_read=False,
            is_pushed=True,
        ),
        m.FeedCard(
            id=FEED_3,
            user_id=DEMO_USER_ID,
            event_id=EVENT_CICC,
            relevance_level=m.RelevanceLevel.entity,
            relevance_score=0.81,
            relevance_note="卖方上调目标价，影响你对茅台的风险收益评估框架。",
            related_asset_ids=[str(ASSET_600519)],
            is_read=True,
            is_pushed=False,
        ),
        m.FeedCard(
            id=FEED_4,
            user_id=DEMO_USER_ID,
            event_id=EVENT_PBOC,
            relevance_level=m.RelevanceLevel.macro,
            relevance_score=0.62,
            relevance_note="货币政策边际变化，或影响你组合中核心资产的风险溢价。",
            related_asset_ids=[str(ASSET_600519), str(ASSET_300750)],
            is_read=False,
            is_pushed=True,
        ),
        m.FeedCard(
            id=FEED_5,
            user_id=DEMO_USER_ID,
            event_id=EVENT_NOISE,
            relevance_level=m.RelevanceLevel.sector,
            relevance_score=0.12,
            relevance_note="低可信来源的情绪热点，与你持仓关联弱，可作为噪声对照。",
            related_asset_ids=[],
            is_read=False,
            is_pushed=False,
        ),
    ]
    db.add_all(feed_cards)


def _seed_extended_trades_only(db, now: datetime) -> int:
    """旧库仅有前 5 笔时补全 6–14；已存在则跳过。"""
    if db.query(m.Trade).filter(m.Trade.id == TRADE_6).first():
        return 0
    user = db.query(m.User).filter(m.User.id == DEMO_USER_ID).first()
    if not user:
        return 0
    trades = _build_core_trades(now)
    # 仅插入 6–14（前 5 笔已在库）
    extra = [t for t in trades if t.id in {TRADE_6, TRADE_7, TRADE_8, TRADE_9, TRADE_10, TRADE_11, TRADE_12, TRADE_13, TRADE_14}]
    db.add_all(extra)

    ev_cicc = db.query(m.Event).filter(m.Event.id == EVENT_CICC).first()
    if ev_cicc:
        ev_cicc.occurred_at = _align_cicc_for_fomo(now)
    return len(extra)


def _sync_demo_credentials(db) -> None:
    """Ensure demo user can log in with demo@keefoo.cn / demo123456 (bcrypt)."""
    demo = db.query(m.User).filter(m.User.id == DEMO_USER_ID).first()
    if demo:
        demo.email = "demo@keefoo.cn"
        demo.password_hash = hash_password("demo123456")


def _next_weekday(d: date, weekday: int) -> date:
    """weekday: Monday=0 ... Sunday=6; returns next (or same) date."""
    delta = (weekday - d.weekday()) % 7
    return d + timedelta(days=delta)


def _seed_reminders(db, now: datetime) -> None:
    demo_user = db.query(m.User).filter(m.User.id == DEMO_USER_ID).first()
    if not demo_user:
        return

    today = now.date()
    tomorrow = today + timedelta(days=1)
    in3 = today + timedelta(days=3)
    in5 = today + timedelta(days=5)
    in7 = today + timedelta(days=7)
    friday = _next_weekday(today, 4)  # Friday

    payload = [
        (
            REM_1,
            "关注茅台财报发布",
            None,
            in3,
            None,
            False,
            m.ReminderPriority.high,
            ASSET_600519,
            None,
        ),
        (
            REM_2,
            "检查宁德时代止损位",
            None,
            tomorrow,
            None,
            False,
            m.ReminderPriority.high,
            ASSET_300750,
            None,
        ),
        (
            REM_3,
            "阅读中金研报",
            "重点关注估值假设与风险提示。",
            today,
            None,
            True,
            m.ReminderPriority.medium,
            None,
            None,
        ),
        (
            REM_4,
            "复盘本周交易",
            None,
            friday,
            None,
            False,
            m.ReminderPriority.medium,
            None,
            None,
        ),
        (
            REM_5,
            "调整影子仓位观察名单",
            None,
            in5,
            None,
            False,
            m.ReminderPriority.low,
            None,
            None,
        ),
        (
            REM_6,
            "关注美联储议息会议",
            None,
            in7,
            None,
            False,
            m.ReminderPriority.high,
            None,
            None,
        ),
    ]

    for rid, title, desc, rdate, rtime, completed, pri, asset_id, trade_id in payload:
        existing = db.query(m.Reminder).filter(m.Reminder.id == rid, m.Reminder.user_id == DEMO_USER_ID).first()
        if existing:
            existing.title = title
            existing.description = desc
            existing.remind_date = rdate
            existing.remind_time = rtime
            existing.is_completed = completed
            existing.priority = pri
            existing.linked_asset_id = asset_id
            existing.linked_trade_id = trade_id
        else:
            db.add(
                m.Reminder(
                    id=rid,
                    user_id=DEMO_USER_ID,
                    title=title,
                    description=desc,
                    remind_date=rdate,
                    remind_time=rtime,
                    is_completed=completed,
                    priority=pri,
                    linked_asset_id=asset_id,
                    linked_trade_id=trade_id,
                )
            )



def _seed_notebooks_and_notes(db) -> None:
    """Seed deterministic notebooks/tags/notes for demo user."""
    demo_user = db.query(m.User).filter(m.User.id == DEMO_USER_ID).first()
    if not demo_user:
        return

    # --- tags ---
    desired_tags = [
        (TAG_IMPORTANT, "重要", "#EF4444"),
        (TAG_WAIT_VERIFY, "待验证", "#F59E0B"),
        (TAG_STRATEGY, "策略", "#6366F1"),
        (TAG_REVIEW, "复盘", "#22C55E"),
    ]
    for tid, name, color in desired_tags:
        existing = db.query(m.NoteTag).filter(m.NoteTag.id == tid, m.NoteTag.user_id == DEMO_USER_ID).first()
        if existing:
            existing.name = name
            existing.color = color
        else:
            db.add(m.NoteTag(id=tid, user_id=DEMO_USER_ID, name=name, color=color))
    db.flush()

    # --- notebooks ---
    desired_nbs = [
        (NOTEBOOK_TRADE_NOTES, "Trade Notes", None),
        (NOTEBOOK_QUARTERLY_GOALS, "Quarterly Goals", None),
        (NOTEBOOK_PLAN_OF_ACTION, "Plan of Action", None),
    ]
    for nb_id, name, parent_id in desired_nbs:
        existing = db.query(m.Notebook).filter(m.Notebook.id == nb_id, m.Notebook.user_id == DEMO_USER_ID).first()
        if existing:
            existing.name = name
            existing.parent_id = parent_id
            existing.sort_order = 0
        else:
            db.add(
                m.Notebook(
                    id=nb_id,
                    user_id=DEMO_USER_ID,
                    name=name,
                    parent_id=parent_id,
                    sort_order=0,
                )
            )
    db.flush()

    # --- notes ---
    notes_payload = [
        (
            NOTE_1,
            "茅台建仓逻辑梳理",
            "Trade Notes",
            [TAG_STRATEGY],
            True,
            ASSET_600519,
            None,
        ),
        (
            NOTE_2,
            "2025 Q4 投资复盘",
            "Quarterly Goals",
            [TAG_REVIEW, TAG_IMPORTANT],
            False,
            None,
            None,
        ),
        (
            NOTE_3,
            "新能源板块观察",
            "Trade Notes",
            [TAG_WAIT_VERIFY],
            False,
            ASSET_300750,
            None,
        ),
        (
            NOTE_4,
            "降准对持仓的影响分析",
            "Plan of Action",
            [TAG_STRATEGY, TAG_IMPORTANT],
            True,
            None,
            None,
        ),
        (
            NOTE_5,
            "止损纪律反思",
            "Trade Notes",
            [TAG_REVIEW],
            False,
            None,
            None,
        ),
        (
            NOTE_6,
            "黄金ETF观望理由",
            None,
            [TAG_WAIT_VERIFY],
            False,
            ASSET_518880,
            None,
        ),
    ]

    content_map = {
        NOTE_1: """茅台的建仓，我优先从“价格—估值锚—现金流”三条线验证长期逻辑。\n\n第一，消费属性决定需求的韧性：当市场情绪波动时，茅台的需求弹性相对更低，回撤更像是“等待定价纠偏”。\n\n第二，估值锚的核心不是短期故事，而是可持续的分红与盈利兑现路径；我会用年报/季报的数据更新“风险溢价”假设，而不是凭感觉追高。\n\n第三，交易执行上我更倾向分段建仓：用回调完成成本优化，用事件窗口（业绩/政策）校准预期差。""",
        NOTE_2: """本次 2025 Q4 复盘的目标，是把“正确的方向”与“错误的执行”拆开。\n\n一方面，组合在大方向上更贴近价值—现金流的框架；另一方面，部分交易的节奏过于依赖短周期波动，导致止盈/加仓的时机不够稳健。\n\n我需要在下一季度强化两点：\n1）把交易触发条件写清楚（事件触发 vs 技术触发）。\n2）把纪律指标设为硬约束（比如最大回撤容忍、止损触发条件）。\n\n最终，我会把“复盘”作为下一次决策的输入变量，而不是一次性的总结。""",
        NOTE_3: """新能源板块的观察，我把它拆成三层：\n- 行业景气与需求（中期趋势）\n- 产业链成本与供给（利润弹性）\n- 个股估值与资金行为（短期交易机会）\n\n在当前阶段，我更愿意等待“事件—业绩验证—估值收敛”之后再做加码，而不是在噪声中被动跟随。\n\n如果你在记录里发现自己经常在情绪上行时追买、在回撤时恐慌割肉，那说明需要把交易触发条件重新校准。""",
        NOTE_4: """降准对持仓的影响，本质上是流动性预期变化带来的“折现率”与“风险偏好”再定价。\n\n我会从两条线判断：\n1）利率与资金面的直接传导（短期）；\n2）企业盈利兑现对估值的支撑（中期）。\n\n执行上我倾向于“先确认后加仓”：等市场对降准的反应完成一轮定价，再评估是否存在趋势延续机会。\n\n另外要避免两种常见错误：一是把政策利好当作持续信号；二是忽视自身仓位集中度。""",
        NOTE_5: """止损纪律的反思，我更想回答一个问题：为什么明知止损原则，却在关键节点犹豫。\n\n回看这次交易，我发现我当时的心态更像是在“找理由解释亏损”，而不是验证交易假设是否仍成立。\n\n下一次我会做：\n- 在下单前写下止损触发条件（价格/逻辑/时间）\n- 用复盘把触发条件的有效性做成记录\n\n纪律不是为了不亏，而是为了让亏损可控、让决策可复用。""",
        NOTE_6: """黄金 ETF 的观望理由：当前阶段我更偏向把它当作“风险对冲工具”，而不是进攻性仓位。\n\n我会关注三类信号：\n- 实际利率与美元走势（决定黄金的主要定价因素）\n- 地缘风险溢价的变化\n- 股市波动加速度（决定对冲需求）\n\n当我观察到对冲需求上升且估值具备安全边际时，再考虑分段建仓。""",
    }

    nb_id_map = {
        "Trade Notes": NOTEBOOK_TRADE_NOTES,
        "Quarterly Goals": NOTEBOOK_QUARTERLY_GOALS,
        "Plan of Action": NOTEBOOK_PLAN_OF_ACTION,
    }

    # Spread note created/updated dates within last 30 days
    note_times = {
        NOTE_1: (datetime.now(UTC) - timedelta(days=2, hours=4), datetime.now(UTC) - timedelta(days=1, hours=2)),
        NOTE_2: (datetime.now(UTC) - timedelta(days=8, hours=3), datetime.now(UTC) - timedelta(days=7, hours=1)),
        NOTE_3: (datetime.now(UTC) - timedelta(days=12, hours=6), datetime.now(UTC) - timedelta(days=11, hours=2)),
        NOTE_4: (datetime.now(UTC) - timedelta(days=18, hours=5), datetime.now(UTC) - timedelta(days=16, hours=4)),
        NOTE_5: (datetime.now(UTC) - timedelta(days=22, hours=7), datetime.now(UTC) - timedelta(days=20, hours=6)),
        NOTE_6: (datetime.now(UTC) - timedelta(days=28, hours=2), datetime.now(UTC) - timedelta(days=26, hours=3)),
    }

    for nid, title, nb_name, tag_ids, pinned, asset_id, trade_id in notes_payload:
        nb_id = nb_id_map.get(nb_name) if nb_name else None
        created_at, updated_at = note_times.get(nid, (datetime.now(UTC), datetime.now(UTC)))
        existing = db.query(m.Note).filter(m.Note.id == nid, m.Note.user_id == DEMO_USER_ID).first()
        if existing:
            existing.title = title
            existing.content = content_map.get(nid, existing.content)
            existing.content_type = m.NoteContentType.markdown
            existing.notebook_id = nb_id
            existing.linked_asset_id = asset_id
            existing.linked_trade_id = trade_id
            existing.is_pinned = pinned
            existing.is_archived = False
            existing.created_at = created_at
            existing.updated_at = updated_at
        else:
            db.add(
                m.Note(
                    id=nid,
                    user_id=DEMO_USER_ID,
                    notebook_id=nb_id,
                    title=title,
                    content=content_map.get(nid, ""),
                    content_type=m.NoteContentType.markdown,
                    linked_asset_id=asset_id,
                    linked_trade_id=trade_id,
                    is_pinned=pinned,
                    is_archived=False,
                    created_at=created_at,
                    updated_at=updated_at,
                )
            )
    db.flush()

    # --- note_tag_links ---
    note_to_tags = {
        NOTE_1: [TAG_STRATEGY],
        NOTE_2: [TAG_REVIEW, TAG_IMPORTANT],
        NOTE_3: [TAG_WAIT_VERIFY],
        NOTE_4: [TAG_STRATEGY, TAG_IMPORTANT],
        NOTE_5: [TAG_REVIEW],
        NOTE_6: [TAG_WAIT_VERIFY],
    }
    for nid, tag_list in note_to_tags.items():
        db.query(m.NoteTagLink).filter(m.NoteTagLink.note_id == nid).delete(synchronize_session=False)
        for tid in tag_list:
            db.add(m.NoteTagLink(note_id=nid, tag_id=tid))


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        demo_user = db.query(m.User).filter(m.User.id == DEMO_USER_ID).first()
        if not demo_user:
            _seed_full(db, now)
            print("Seed completed: demo user, assets, 14 trades, shadows, events, links, feed cards.")
        else:
            n = _seed_extended_trades_only(db, now)
            if n:
                print(f"Seed extended: added {n} closed demo trades (and aligned CICC time for FOMO demo).")
            else:
                print("Demo data already seeded (extended trades present). Skipping.")
        _seed_notebooks_and_notes(db)
        _seed_reminders(db, now)
        _sync_demo_credentials(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
