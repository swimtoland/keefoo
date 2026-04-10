"""API routes (prefix /api/v1 applied in main)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.auth import (
    create_access_token,
    get_current_user,
    get_effective_user_id,
    hash_password,
    verify_password_or_legacy,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.models import models as m
from app.models.schemas import (
    AgentReplyBody,
    FundRealtime,
    KlineData,
    MarketIndex,
    NewsItem,
    AssetDetailResponse,
    AssetOut,
    AuthResponse,
    BiasAnalysisResponse,
    EventOut,
    FeedCardOut,
    KnowledgeGraphResponse,
    LoginRequest,
    PendingQuestionOut,
    PositionsOverview,
    RealPositionRow,
    RegisterRequest,
    ReportResponse,
    ScenarioPushResponse,
    TagCreate,
    TagResponse,
    NotebookCreate,
    NotebookResponse,
    NotebookTree,
    NoteCreate,
    NoteUpdate,
    NoteResponse,
    NoteListItem,
    NoteMoveRequest,
    ReminderCreate,
    ReminderUpdate,
    ReminderResponse,
    CalendarDayData,
    CalendarMonthOverview,
    CalendarMonthOverviewItem,
    ShadowPositionCreate,
    ShadowPositionOut,
    StrategyProfileResponse,
    StockInfo,
    StockRealtime,
    TradeCreate,
    TradeOut,
    UserCreate,
    UserOut,
    UserResponse,
)
from app.services.agent_service import generate_question, load_events_near_trade, parse_user_reply
from app.services.ai_service import (
    generate_report_commentary,
    generate_scenario,
    generate_smart_question,
    parse_reply_with_ai,
)
from app.services.graph_service import get_knowledge_graph
from app.services.market_data_service import (
    get_financial_news,
    get_fund_realtime,
    get_market_indices,
    get_stock_info,
    get_stock_kline,
    get_stock_realtime,
)
from app.services.profile_service import generate_strategy_profile, get_bias_analysis_with_descriptions
from app.services.report_service import generate_report
from app.services.scenario_service import generate_scenario_push

router = APIRouter()

FREE_TIER_SHADOW_CAP = 5


def _hash_password(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


# --- Market data (AKShare) ---


@router.get("/market/indices", response_model=list[MarketIndex])
def market_indices() -> list[MarketIndex]:
    rows = get_market_indices()
    return [MarketIndex.model_validate(r) for r in (rows or [])]


@router.get("/market/stock/{code}", response_model=StockRealtime)
def market_stock_realtime(code: str) -> StockRealtime:
    data = get_stock_realtime(code)
    if not data:
        raise HTTPException(status_code=404, detail="Stock not found")
    return StockRealtime.model_validate(data)


@router.get("/market/fund/{code}", response_model=FundRealtime)
def market_fund_realtime(code: str) -> FundRealtime:
    data = get_fund_realtime(code)
    if not data:
        raise HTTPException(status_code=404, detail="Fund not found")
    return FundRealtime.model_validate(data)


@router.get("/market/kline/{code}", response_model=list[KlineData])
def market_kline(
    code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=120, ge=1, le=2000),
) -> list[KlineData]:
    data = get_stock_kline(code, period=period, count=count)
    return [KlineData.model_validate(r) for r in (data or [])]


@router.get("/market/news", response_model=list[NewsItem])
def market_news(count: int = Query(default=20, ge=1, le=100)) -> list[NewsItem]:
    data = get_financial_news(count=count)
    return [NewsItem.model_validate(r) for r in (data or [])]


@router.get("/market/stock-info/{code}", response_model=StockInfo)
def market_stock_info(code: str) -> StockInfo:
    data = get_stock_info(code)
    if not data:
        raise HTTPException(status_code=404, detail="Stock not found")
    return StockInfo.model_validate(data)


def get_or_create_asset(
    db: Session,
    *,
    code: str,
    name: Optional[str],
    asset_type: m.AssetType,
    sector: Optional[str],
    market: Optional[m.Market],
    meta_json: Optional[dict],
) -> m.Asset:
    existing = db.query(m.Asset).filter(m.Asset.code == code).first()
    if existing:
        return existing
    display_name = name.strip() if name and name.strip() else code
    asset = m.Asset(
        code=code,
        name=display_name,
        asset_type=asset_type,
        sector=sector,
        market=market,
        meta_json=meta_json,
    )
    db.add(asset)
    db.flush()
    return asset


# --- Users ---


@router.post("/users", response_model=UserOut)
def register_user(body: UserCreate, db: Session = Depends(get_db)) -> m.User:
    user = m.User(
        nickname=body.nickname or "KeeFoo用户",
        email=body.email,
        password_hash=_hash_password(body.password) if body.password else None,
        risk_preference=body.risk_preference,
        settings_json=body.settings_json,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from None
    db.refresh(user)
    return user


@router.post("/auth/register", response_model=AuthResponse)
def auth_register(body: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = m.User(
        nickname=body.nickname,
        email=body.email.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from None
    db.refresh(user)
    token = create_access_token(str(user.id))
    return AuthResponse(token=token, user=UserResponse.model_validate(user))


@router.post("/auth/login", response_model=AuthResponse)
def auth_login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip()
    user = db.query(m.User).filter(func.lower(m.User.email) == email.lower()).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password_or_legacy(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user.id))
    return AuthResponse(token=token, user=UserResponse.model_validate(user))


@router.get("/auth/me", response_model=UserResponse)
def auth_me(current_user: m.User = Depends(get_current_user)) -> m.User:
    return current_user


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db)) -> m.User:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# --- Assets ---


@router.get("/assets/search", response_model=list[AssetOut])
def search_assets(
    keyword: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> list[m.Asset]:
    like = f"%{keyword}%"
    return (
        db.query(m.Asset)
        .filter(or_(m.Asset.code.ilike(like), m.Asset.name.ilike(like)))
        .order_by(m.Asset.code.asc())
        .limit(50)
        .all()
    )


@router.get("/assets/{asset_id}/detail", response_model=AssetDetailResponse)
def get_asset_detail(
    asset_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> AssetDetailResponse:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    asset = db.query(m.Asset).filter(m.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    trades_db = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.user_id == user_id, m.Trade.asset_id == asset_id)
        .order_by(m.Trade.traded_at.asc())
        .all()
    )
    trades_out: list[TradeOut] = []
    for t in trades_db:
        row = TradeOut.model_validate(t)
        row.asset = AssetOut.model_validate(t.asset) if t.asset else None
        trades_out.append(row)

    events_db = (
        db.query(m.Event)
        .join(m.EventAssetLink, m.EventAssetLink.event_id == m.Event.id)
        .filter(m.EventAssetLink.asset_id == asset_id)
        .order_by(m.Event.occurred_at.asc())
        .all()
    )
    events_out = [EventOut.model_validate(e) for e in events_db]

    sp = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.user_id == user_id, m.ShadowPosition.asset_id == asset_id)
        .first()
    )
    sp_out: Optional[ShadowPositionOut] = None
    if sp:
        sp_out = ShadowPositionOut.model_validate(sp)
        sp_out.asset = AssetOut.model_validate(sp.asset) if sp.asset else None

    return AssetDetailResponse(
        asset=AssetOut.model_validate(asset),
        trades=trades_out,
        events=events_out,
        shadow_position=sp_out,
    )


# --- Trades ---


@router.post("/trades", response_model=TradeOut)
def create_trade(
    body: TradeCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> TradeOut:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    asset = get_or_create_asset(
        db,
        code=body.asset_code.strip(),
        name=body.asset_name,
        asset_type=body.asset_type,
        sector=body.sector,
        market=body.market,
        meta_json=body.meta_json,
    )

    trade = m.Trade(
        user_id=user_id,
        asset_id=asset.id,
        direction=body.direction,
        price=body.price,
        quantity=body.quantity,
        traded_at=body.traded_at,
        market_context=body.market_context,
        decision_note=body.decision_note,
        emotion_score=body.emotion_score,
        confidence_score=body.confidence_score,
        note_source=body.note_source,
        pnl=body.pnl,
        holding_days=body.holding_days,
        exit_reason=body.exit_reason,
        status=body.status,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    trade = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.id == trade.id)
        .first()
    )
    assert trade is not None
    assert trade.asset is not None
    near_events = load_events_near_trade(db, trade.asset_id, trade.traded_at)
    market_context = {
        "indices": get_market_indices(),
        "realtime": get_stock_realtime(trade.asset.code),
        "news": get_financial_news(count=5),
        "near_events": [{"title": e.title, "type": e.event_type.value} for e in (near_events or [])[:3]],
    }
    trade.agent_question_text = generate_question(trade, trade.asset, near_events, extra_context=market_context, db=db)
    trade.agent_question_sent = True
    trade.agent_question_sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(trade)
    trade = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.id == trade.id)
        .first()
    )
    assert trade is not None
    out = TradeOut.model_validate(trade)
    out.asset = AssetOut.model_validate(trade.asset) if trade.asset else None
    return out


@router.get("/trades", response_model=list[TradeOut])
def list_trades(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    status: Optional[m.TradeStatus] = None,
    db: Session = Depends(get_db),
) -> list[TradeOut]:
    q = db.query(m.Trade).options(joinedload(m.Trade.asset)).filter(m.Trade.user_id == user_id)
    if status is not None:
        q = q.filter(m.Trade.status == status)
    trades = q.order_by(m.Trade.traded_at.desc()).all()
    result: list[TradeOut] = []
    for t in trades:
        row = TradeOut.model_validate(t)
        row.asset = AssetOut.model_validate(t.asset) if t.asset else None
        result.append(row)
    return result


@router.get("/trades/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: uuid.UUID, db: Session = Depends(get_db)) -> TradeOut:
    trade = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.id == trade_id)
        .first()
    )
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    out = TradeOut.model_validate(trade)
    out.asset = AssetOut.model_validate(trade.asset) if trade.asset else None
    return out


# --- Shadow positions ---


@router.post("/shadow-positions", response_model=ShadowPositionOut)
def add_shadow_position(
    body: ShadowPositionCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> ShadowPositionOut:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.subscription_tier == m.SubscriptionTier.free:
        count = db.query(m.ShadowPosition).filter(m.ShadowPosition.user_id == user_id).count()
        if count >= FREE_TIER_SHADOW_CAP:
            raise HTTPException(
                status_code=403,
                detail=f"Free tier allows at most {FREE_TIER_SHADOW_CAP} shadow positions",
            )

    asset = get_or_create_asset(
        db,
        code=body.asset_code.strip(),
        name=body.asset_name,
        asset_type=body.asset_type,
        sector=body.sector,
        market=body.market,
        meta_json=None,
    )

    sp = m.ShadowPosition(
        user_id=user_id,
        asset_id=asset.id,
        shadow_type=body.shadow_type,
        hypothetical_entry_price=body.hypothetical_entry_price,
        scenario_push_enabled=body.scenario_push_enabled,
        push_strength_cap=body.push_strength_cap,
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    sp = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.id == sp.id)
        .first()
    )
    assert sp is not None
    out = ShadowPositionOut.model_validate(sp)
    out.asset = AssetOut.model_validate(sp.asset) if sp.asset else None
    return out


@router.get("/shadow-positions", response_model=list[ShadowPositionOut])
def list_shadow_positions(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[ShadowPositionOut]:
    rows = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.user_id == user_id)
        .order_by(m.ShadowPosition.id.asc())
        .all()
    )
    out: list[ShadowPositionOut] = []
    for sp in rows:
        item = ShadowPositionOut.model_validate(sp)
        item.asset = AssetOut.model_validate(sp.asset) if sp.asset else None
        out.append(item)
    return out


@router.delete("/shadow-positions/{shadow_id}", status_code=204)
def delete_shadow_position(
    shadow_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> None:
    sp = db.query(m.ShadowPosition).filter(m.ShadowPosition.id == shadow_id).first()
    if not sp or sp.user_id != user_id:
        raise HTTPException(status_code=404, detail="Shadow position not found")
    db.delete(sp)
    db.commit()


# --- Positions overview ---


@router.get("/positions", response_model=PositionsOverview)
def positions_overview(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> PositionsOverview:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    trades = (
        db.query(m.Trade)
        .options(selectinload(m.Trade.asset))
        .filter(m.Trade.user_id == user_id, m.Trade.status == m.TradeStatus.open)
        .all()
    )

    agg: dict[uuid.UUID, dict] = {}
    for t in trades:
        bucket = agg.setdefault(
            t.asset_id,
            {"net": 0.0, "buy_cost": 0.0, "buy_qty": 0.0, "count": 0, "asset": t.asset},
        )
        bucket["count"] += 1
        if t.direction == m.TradeDirection.buy:
            bucket["net"] += t.quantity
            bucket["buy_cost"] += t.price * t.quantity
            bucket["buy_qty"] += t.quantity
        else:
            bucket["net"] -= t.quantity

    real: list[RealPositionRow] = []
    for _, data in agg.items():
        if data["net"] <= 0:
            continue
        asset = data["asset"]
        if asset is None:
            continue
        wap = (data["buy_cost"] / data["buy_qty"]) if data["buy_qty"] > 0 else None
        real.append(
            RealPositionRow(
                asset=AssetOut.model_validate(asset),
                net_quantity=data["net"],
                weighted_avg_buy_price=wap,
                open_trade_count=data["count"],
            )
        )

    shadows_db = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.user_id == user_id)
        .all()
    )
    shadows: list[ShadowPositionOut] = []
    for sp in shadows_db:
        item = ShadowPositionOut.model_validate(sp)
        item.asset = AssetOut.model_validate(sp.asset) if sp.asset else None
        shadows.append(item)

    return PositionsOverview(real_positions=real, shadow_positions=shadows)


# --- Feed ---


@router.get("/feed", response_model=list[FeedCardOut])
def get_feed(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[FeedCardOut]:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cards = (
        db.query(m.FeedCard)
        .options(joinedload(m.FeedCard.event))
        .filter(m.FeedCard.user_id == user_id)
        .order_by(m.FeedCard.relevance_score.desc())
        .all()
    )

    out: list[FeedCardOut] = []
    for c in cards:
        raw_ids = c.related_asset_ids or []
        str_ids = [str(x) for x in raw_ids]
        item = FeedCardOut(
            id=c.id,
            user_id=c.user_id,
            event_id=c.event_id,
            relevance_level=c.relevance_level,
            relevance_score=c.relevance_score,
            relevance_note=c.relevance_note,
            related_asset_ids=str_ids,
            is_read=c.is_read,
            is_pushed=c.is_pushed,
            event_title=c.event.title if c.event else None,
            event_summary=c.event.summary if c.event else None,
            event_occurred_at=c.event.occurred_at if c.event else None,
        )
        out.append(item)
    return out


@router.post("/feed/{card_id}/read", response_model=FeedCardOut)
def mark_feed_read(
    card_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> FeedCardOut:
    card = (
        db.query(m.FeedCard)
        .options(joinedload(m.FeedCard.event))
        .filter(m.FeedCard.id == card_id, m.FeedCard.user_id == user_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Feed card not found")
    card.is_read = True
    db.commit()
    db.refresh(card)
    raw_ids = card.related_asset_ids or []
    str_ids = [str(x) for x in raw_ids]
    return FeedCardOut(
        id=card.id,
        user_id=card.user_id,
        event_id=card.event_id,
        relevance_level=card.relevance_level,
        relevance_score=card.relevance_score,
        relevance_note=card.relevance_note,
        related_asset_ids=str_ids,
        is_read=card.is_read,
        is_pushed=card.is_pushed,
        event_title=card.event.title if card.event else None,
        event_summary=card.event.summary if card.event else None,
        event_occurred_at=card.event.occurred_at if card.event else None,
    )


# --- Agent ---


@router.get("/agent/pending-questions", response_model=list[PendingQuestionOut])
def pending_questions(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[PendingQuestionOut]:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    trades = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(
            m.Trade.user_id == user_id,
            m.Trade.agent_question_sent.is_(True),
            m.Trade.agent_question_text.isnot(None),
        )
        .order_by(m.Trade.agent_question_sent_at.desc())
        .all()
    )

    out: list[PendingQuestionOut] = []
    for t in trades:
        if not t.agent_question_text:
            continue
        out.append(
            PendingQuestionOut(
                trade_id=t.id,
                asset_code=t.asset.code if t.asset else None,
                asset_name=t.asset.name if t.asset else None,
                question_text=t.agent_question_text,
                sent_at=t.agent_question_sent_at,
            )
        )
    return out


@router.post("/agent/reply", response_model=TradeOut)
def agent_reply(body: AgentReplyBody, db: Session = Depends(get_db)) -> TradeOut:
    trade = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.id == body.trade_id, m.Trade.user_id == body.user_id)
        .first()
    )
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    settings = get_settings()
    if getattr(settings, "DEEPSEEK_API_KEY", ""):
        try:
            trade_ctx = {
                "trade_id": str(trade.id),
                "asset_code": trade.asset.code if trade.asset else "",
                "asset_name": trade.asset.name if trade.asset else "",
                "direction": trade.direction.value if trade.direction else "",
                "price": float(trade.price),
                "quantity": float(trade.quantity),
                "traded_at": trade.traded_at.isoformat() if trade.traded_at else "",
            }
            parsed = parse_reply_with_ai(body.reply.strip(), trade_ctx)
        except Exception:
            parsed = parse_user_reply(body.reply.strip())
    else:
        parsed = parse_user_reply(body.reply.strip())
    trade.decision_note = parsed["structured_note"]
    trade.emotion_score = parsed["emotion_score"]
    trade.confidence_score = parsed["confidence_score"]
    trade.note_source = m.NoteSource.agent_parsed
    trade.agent_question_sent = False
    db.commit()
    db.refresh(trade)
    trade = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.id == trade.id)
        .first()
    )
    assert trade is not None
    out = TradeOut.model_validate(trade)
    out.asset = AssetOut.model_validate(trade.asset) if trade.asset else None
    return out


# --- Analysis: reports / strategy profile / knowledge graph ---


@router.get("/reports/{period}", response_model=ReportResponse)
def get_period_report(
    period: str,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> ReportResponse:
    if period not in ("weekly", "monthly", "quarterly"):
        raise HTTPException(
            status_code=400,
            detail="period must be one of: weekly, monthly, quarterly",
        )
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    raw = generate_report(user_id, period, db)
    settings = get_settings()
    if getattr(settings, "DEEPSEEK_API_KEY", "") and raw.get("has_data"):
        try:
            txt = generate_report_commentary(raw)
            raw["ai_commentary"] = [txt]
        except Exception:
            pass
    return ReportResponse.model_validate(raw)


@router.get("/profile/strategy", response_model=StrategyProfileResponse)
def get_strategy_profile(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> StrategyProfileResponse:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    raw = generate_strategy_profile(user_id, db)
    return StrategyProfileResponse.model_validate(raw)


@router.get("/profile/biases", response_model=BiasAnalysisResponse)
def get_profile_biases(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> BiasAnalysisResponse:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    raw = get_bias_analysis_with_descriptions(user_id, db)
    return BiasAnalysisResponse.model_validate(raw)


@router.get("/graph/knowledge", response_model=KnowledgeGraphResponse)
def get_knowledge_graph_endpoint(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> KnowledgeGraphResponse:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    raw = get_knowledge_graph(user_id, db)
    return KnowledgeGraphResponse.model_validate(raw)


@router.get("/scenario-pushes", response_model=list[ScenarioPushResponse])
def list_scenario_pushes(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[ScenarioPushResponse]:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    shadows = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.user_id == user_id)
        .all()
    )
    out: list[ScenarioPushResponse] = []
    settings = get_settings()
    for sp in shadows:
        if not sp.scenario_push_enabled:
            continue
        if not sp.asset:
            continue
        latest_event = (
            db.query(m.Event)
            .join(m.EventAssetLink, m.EventAssetLink.event_id == m.Event.id)
            .filter(m.EventAssetLink.asset_id == sp.asset_id)
            .order_by(m.Event.occurred_at.desc())
            .first()
        )
        raw = generate_scenario_push(sp, latest_event)
        if getattr(settings, "DEEPSEEK_API_KEY", ""):
            try:
                asset_info = {
                    "code": sp.asset.code,
                    "name": sp.asset.name,
                    "asset_type": sp.asset.asset_type.value if sp.asset.asset_type else "",
                    "sector": sp.asset.sector,
                    "market": sp.asset.market.value if sp.asset.market else "",
                }
                event_info = None
                if latest_event is not None:
                    event_info = {
                        "title": latest_event.title,
                        "summary": latest_event.summary,
                        "event_type": latest_event.event_type.value if latest_event.event_type else "",
                        "impact_level": latest_event.impact_level.value if latest_event.impact_level else "",
                        "occurred_at": latest_event.occurred_at.isoformat() if latest_event.occurred_at else "",
                    }
                if event_info is not None:
                    ai = generate_scenario(asset_info, event_info)
                    raw["scenario_text"] = ai["scenario_text"]
                    raw["direction"] = ai["direction"]
            except Exception:
                pass
        created = datetime.fromisoformat(raw["created_at"].replace("Z", "+00:00"))
        out.append(
            ScenarioPushResponse(
                shadow_id=uuid.UUID(raw["shadow_id"]),
                asset_name=sp.asset.name,
                asset_code=sp.asset.code,
                event_title=raw["event_title"],
                scenario_text=raw["scenario_text"],
                direction=raw["direction"],
                created_at=created,
            )
        )
    return out


# --- Data Collection (第一层：信息采集) ---


class CollectionResult(BaseModel):
    user_id: str
    assets_monitored: int
    price_alerts: int
    news_matched: int


@router.post("/collect/user", response_model=CollectionResult)
def trigger_collect_for_user(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> CollectionResult:
    """手动触发当前用户的第一层数据采集。"""
    from app.services.data_collection_service import collect_for_user

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = collect_for_user(db, user_id)
    return CollectionResult(**result)


class FilterResult(BaseModel):
    user_id: str
    events_evaluated: int
    passed: int
    filtered_out: int


@router.post("/filter/user", response_model=FilterResult)
def trigger_filter_for_user(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> FilterResult:
    """手动触发当前用户的第二层事件过滤。"""
    from app.services.event_filter_service import filter_events_for_user

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = filter_events_for_user(db, user_id)
    return FilterResult(**result)


@router.post("/filter/all", response_model=list[FilterResult])
def trigger_filter_for_all(
    db: Session = Depends(get_db),
) -> list[FilterResult]:
    """触发所有活跃用户的第二层事件过滤。"""
    from app.services.event_filter_service import filter_events_for_all_users

    results = filter_events_for_all_users()
    return [FilterResult(**r) for r in results]


@router.post("/collect/all", response_model=list[CollectionResult])
def trigger_collect_for_all(
    db: Session = Depends(get_db),
) -> list[CollectionResult]:
    """
    触发所有活跃用户的第一层数据采集。
    适合由定时任务或管理后台调用。
    """
    from app.services.data_collection_service import collect_for_all_users

    results = collect_for_all_users()
    return [CollectionResult(**r) for r in results]


class EnrichResult(BaseModel):
    user_id: str
    cards_enriched: int
    with_debate: int


@router.post("/enrich/user", response_model=EnrichResult)
def trigger_enrich_for_user(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> EnrichResult:
    """手动触发当前用户的第三层卡片充实（博弈分析）。"""
    from app.services.card_enrichment_service import enrich_cards_for_user

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = enrich_cards_for_user(db, user_id)
    return EnrichResult(**result)


class DispatchResult(BaseModel):
    user_id: str
    pushed: int
    aggregated: int
    remaining_quota: int


class SocratesResult(BaseModel):
    user_id: str
    questions_sent: int


class SilenceResult(BaseModel):
    user_id: str
    silence_inferred: int


class PushLayerResult(BaseModel):
    user_id: str
    dispatch: DispatchResult
    socrates: SocratesResult
    silence: SilenceResult


@router.post("/push/user", response_model=PushLayerResult)
def trigger_push_for_user(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> PushLayerResult:
    """手动触发当前用户的第四层：推送频控 + 苏格拉底追问 + 沉默推断。"""
    from app.services.push_service import run_push_layer_for_user

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = run_push_layer_for_user(db, user_id)
    return PushLayerResult(
        user_id=result["user_id"],
        dispatch=DispatchResult(**result["dispatch"]),
        socrates=SocratesResult(**result["socrates"]),
        silence=SilenceResult(**result["silence"]),
    )


class EvolutionResult(BaseModel):
    user_id: str
    daily_report: Optional[dict] = None
    strategy_profile: Optional[dict] = None
    shadow_match: Optional[dict] = None


@router.post("/evolution/daily", response_model=dict)
def trigger_daily_report(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict:
    """生成今日收盘日报。"""
    from app.services.evolution_service import run_daily_report

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return run_daily_report(db, user_id)


@router.post("/evolution/report/{period}", response_model=dict)
def trigger_period_report(
    period: str,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict:
    """生成周报/月报/季报（统计 + AI 叙事）。"""
    from app.services.evolution_service import run_period_report

    if period not in ("weekly", "monthly", "quarterly"):
        raise HTTPException(status_code=400, detail="period must be weekly/monthly/quarterly")
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return run_period_report(db, user_id, period)


@router.post("/evolution/profile", response_model=dict)
def trigger_strategy_profile(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict:
    """生成策略画像（统计 + AI 叙事 + 偏差诊断）。"""
    from app.services.evolution_service import run_strategy_profile

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return run_strategy_profile(db, user_id)


@router.post("/evolution/shadow-match", response_model=dict)
def trigger_shadow_match(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict:
    """计算影子仓与真实操作的匹配系数。"""
    from app.services.evolution_service import calculate_shadow_match

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return calculate_shadow_match(db, user_id)


class PipelineResult(BaseModel):
    collection: CollectionResult
    filter: FilterResult
    enrichment: EnrichResult
    push: PushLayerResult
    evolution: Optional[EvolutionResult] = None


@router.post("/pipeline/user", response_model=PipelineResult)
def trigger_pipeline_for_user(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> PipelineResult:
    """一次性运行五层流水线：采集 → 过滤 → 博弈 → 推送追问 → 复盘进化（单用户）。"""
    from app.services.data_collection_service import collect_for_user
    from app.services.event_filter_service import filter_events_for_user
    from app.services.card_enrichment_service import enrich_cards_for_user
    from app.services.push_service import run_push_layer_for_user
    from app.services.evolution_service import run_evolution_layer

    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    collect_result = collect_for_user(db, user_id)
    filter_result = filter_events_for_user(db, user_id)
    enrich_result = enrich_cards_for_user(db, user_id)
    push_result = run_push_layer_for_user(db, user_id)
    evolution_result = run_evolution_layer(db, user_id)

    return PipelineResult(
        collection=CollectionResult(**collect_result),
        filter=FilterResult(**filter_result),
        enrichment=EnrichResult(**enrich_result),
        push=PushLayerResult(
            user_id=push_result["user_id"],
            dispatch=DispatchResult(**push_result["dispatch"]),
            socrates=SocratesResult(**push_result["socrates"]),
            silence=SilenceResult(**push_result["silence"]),
        ),
        evolution=EvolutionResult(
            user_id=evolution_result["user_id"],
            daily_report=evolution_result.get("daily_report"),
            strategy_profile=evolution_result.get("strategy_profile"),
            shadow_match=evolution_result.get("shadow_match"),
        ),
    )


# --- Notes / Notebooks / Tags ---


def _collect_notebook_descendant_ids(db: Session, *, user_id: uuid.UUID, root_id: uuid.UUID) -> set[uuid.UUID]:
    """Collect root + descendants (nested notebooks)."""
    ids: set[uuid.UUID] = set()
    stack: list[uuid.UUID] = [root_id]
    while stack:
        nid = stack.pop()
        if nid in ids:
            continue
        ids.add(nid)
        children = db.query(m.Notebook).filter(m.Notebook.user_id == user_id, m.Notebook.parent_id == nid).all()
        for c in children:
            stack.append(c.id)
    return ids


def _build_notebook_children_map(notebooks: list[m.Notebook]) -> dict[Optional[uuid.UUID], list[m.Notebook]]:
    out: dict[Optional[uuid.UUID], list[m.Notebook]] = {}
    for nb in notebooks:
        out.setdefault(nb.parent_id, []).append(nb)
    for k in out:
        out[k].sort(key=lambda x: (x.sort_order, str(x.created_at)))
    return out


def _descendant_ids_memo(
    db: Session,
    *,
    user_id: uuid.UUID,
    children_map: dict[Optional[uuid.UUID], list[m.Notebook]],
    memo: dict[uuid.UUID, set[uuid.UUID]],
    notebook_id: uuid.UUID,
) -> set[uuid.UUID]:
    if notebook_id in memo:
        return memo[notebook_id]
    ids: set[uuid.UUID] = {notebook_id}
    for child in children_map.get(notebook_id, []):
        ids |= _descendant_ids_memo(db, user_id=user_id, children_map=children_map, memo=memo, notebook_id=child.id)
    memo[notebook_id] = ids
    return ids


def _build_notebook_tree(
    db: Session,
    *,
    user_id: uuid.UUID,
    notebooks: list[m.Notebook],
) -> list[NotebookTree]:
    children_map = _build_notebook_children_map(notebooks)
    memo_desc: dict[uuid.UUID, set[uuid.UUID]] = {}

    def build(node: m.Notebook) -> NotebookTree:
        desc_ids = _descendant_ids_memo(
            db,
            user_id=user_id,
            children_map=children_map,
            memo=memo_desc,
            notebook_id=node.id,
        )
        note_count = (
            db.query(m.Note)
            .filter(
                m.Note.user_id == user_id,
                m.Note.is_archived.is_(False),
                m.Note.notebook_id.in_(desc_ids),
            )
            .count()
        )
        return NotebookTree(
            id=node.id,
            name=node.name,
            note_count=note_count,
            children=[build(c) for c in children_map.get(node.id, [])],
        )

    roots = children_map.get(None, [])
    return [build(r) for r in roots]


def _tag_note_count_map(
    db: Session,
    *,
    user_id: uuid.UUID,
    tag_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    if not tag_ids:
        return {}
    rows = (
        db.query(m.NoteTagLink.tag_id, func.count(m.Note.id))
        .join(m.Note, m.Note.id == m.NoteTagLink.note_id)
        .filter(
            m.Note.user_id == user_id,
            m.Note.is_archived.is_(False),
            m.NoteTagLink.tag_id.in_(tag_ids),
        )
        .group_by(m.NoteTagLink.tag_id)
        .all()
    )
    return {tid: int(cnt) for tid, cnt in rows}


def _note_tags_for_notes(
    db: Session,
    *,
    user_id: uuid.UUID,
    note_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[TagResponse]]:
    if not note_ids:
        return {}
    rows = (
        db.query(m.NoteTagLink, m.NoteTag)
        .join(m.NoteTag, m.NoteTag.id == m.NoteTagLink.tag_id)
        .filter(m.NoteTagLink.note_id.in_(note_ids))
        .all()
    )
    tag_ids = [tag.id for _link, tag in rows]
    count_map = _tag_note_count_map(db, user_id=user_id, tag_ids=list(set(tag_ids)))

    out: dict[uuid.UUID, list[TagResponse]] = {}
    for link, tag in rows:
        out.setdefault(link.note_id, []).append(
            TagResponse(
                id=tag.id,
                name=tag.name,
                color=tag.color,
                note_count=count_map.get(tag.id, 0),
            )
        )
    return out


def _note_asset_and_notebook_names(
    db: Session,
    *,
    note_rows: list[m.Note],
) -> tuple[dict[uuid.UUID, str], dict[uuid.UUID, str]]:
    """Return notebook_id->name and asset_id->name maps for given notes."""
    notebook_ids = [n.notebook_id for n in note_rows if n.notebook_id is not None]
    asset_ids = [n.linked_asset_id for n in note_rows if n.linked_asset_id is not None]

    notebook_map: dict[uuid.UUID, str] = {}
    if notebook_ids:
        nbs = db.query(m.Notebook).filter(m.Notebook.id.in_(set(notebook_ids))).all()
        notebook_map = {nb.id: nb.name for nb in nbs}

    asset_map: dict[uuid.UUID, str] = {}
    if asset_ids:
        assets = db.query(m.Asset).filter(m.Asset.id.in_(set(asset_ids))).all()
        asset_map = {a.id: a.name for a in assets}

    return notebook_map, asset_map


def _note_list_items_from_rows(
    db: Session,
    *,
    user_id: uuid.UUID,
    notes: list[m.Note],
) -> list[NoteListItem]:
    """Build NoteListItem list for given note ORM rows."""
    note_ids = [n.id for n in notes]
    notebook_map, asset_map = _note_asset_and_notebook_names(db, note_rows=notes)
    tags_map = _note_tags_for_notes(db, user_id=user_id, note_ids=note_ids)
    out: list[NoteListItem] = []
    for n in notes:
        preview = (n.content or "")[:100]
        out.append(
            NoteListItem(
                id=n.id,
                title=n.title,
                content_preview=preview,
                notebook_name=notebook_map.get(n.notebook_id) if n.notebook_id else None,
                linked_asset_name=asset_map.get(n.linked_asset_id) if n.linked_asset_id else None,
                is_pinned=n.is_pinned,
                tags=tags_map.get(n.id, []),
                updated_at=n.updated_at,
            )
        )
    return out


# --- Reminders / Calendar ---


@router.post("/reminders", response_model=ReminderResponse)
def create_reminder(
    body: ReminderCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> ReminderResponse:
    user = db.query(m.User).filter(m.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    asset_obj = None
    if body.linked_asset_id is not None:
        asset_obj = db.query(m.Asset).filter(m.Asset.id == body.linked_asset_id).first()
        if not asset_obj:
            raise HTTPException(status_code=404, detail="Asset not found")

    trade_obj = None
    if body.linked_trade_id is not None:
        trade_obj = db.query(m.Trade).filter(m.Trade.id == body.linked_trade_id, m.Trade.user_id == user_id).first()
        if not trade_obj:
            raise HTTPException(status_code=404, detail="Trade not found")

    r = m.Reminder(
        user_id=user_id,
        title=body.title.strip(),
        description=body.description,
        remind_date=body.remind_date,
        remind_time=body.remind_time,
        priority=body.priority,
        linked_asset_id=body.linked_asset_id,
        linked_trade_id=body.linked_trade_id,
        is_completed=False,
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    out = ReminderResponse.model_validate(r)
    out.linked_asset = AssetOut.model_validate(asset_obj) if asset_obj else None
    return out


@router.get("/reminders", response_model=list[ReminderResponse])
def list_reminders(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
    date_: Optional[date] = Query(default=None, alias="date"),
    completed: Optional[bool] = Query(default=None),
) -> list[ReminderResponse]:
    q = db.query(m.Reminder).options(joinedload(m.Reminder.linked_asset)).filter(m.Reminder.user_id == user_id)
    if date_ is not None:
        q = q.filter(m.Reminder.remind_date == date_)
    if completed is not None:
        q = q.filter(m.Reminder.is_completed.is_(bool(completed)))
    rows = q.order_by(m.Reminder.remind_date.asc(), m.Reminder.remind_time.asc().nulls_last(), m.Reminder.created_at.asc()).all()
    out: list[ReminderResponse] = []
    for r in rows:
        item = ReminderResponse.model_validate(r)
        item.linked_asset = AssetOut.model_validate(r.linked_asset) if r.linked_asset else None
        out.append(item)
    return out


@router.put("/reminders/{reminder_id}", response_model=ReminderResponse)
def update_reminder(
    reminder_id: uuid.UUID,
    body: ReminderUpdate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> ReminderResponse:
    r = db.query(m.Reminder).options(joinedload(m.Reminder.linked_asset)).filter(m.Reminder.id == reminder_id).first()
    if not r or r.user_id != user_id:
        raise HTTPException(status_code=404, detail="Reminder not found")

    payload = body.model_dump(exclude_unset=True)
    if "title" in payload and payload["title"] is not None:
        r.title = str(payload["title"]).strip()
    if "description" in payload:
        r.description = payload["description"]
    if "remind_date" in payload and payload["remind_date"] is not None:
        r.remind_date = payload["remind_date"]
    if "remind_time" in payload:
        r.remind_time = payload["remind_time"]
    if "is_completed" in payload and payload["is_completed"] is not None:
        r.is_completed = bool(payload["is_completed"])
    if "priority" in payload and payload["priority"] is not None:
        r.priority = payload["priority"]

    if "linked_asset_id" in payload:
        aid = payload["linked_asset_id"]
        if aid is not None:
            asset_obj = db.query(m.Asset).filter(m.Asset.id == aid).first()
            if not asset_obj:
                raise HTTPException(status_code=404, detail="Asset not found")
        r.linked_asset_id = aid

    if "linked_trade_id" in payload:
        tid = payload["linked_trade_id"]
        if tid is not None:
            trade_obj = db.query(m.Trade).filter(m.Trade.id == tid, m.Trade.user_id == user_id).first()
            if not trade_obj:
                raise HTTPException(status_code=404, detail="Trade not found")
        r.linked_trade_id = tid

    db.commit()
    db.refresh(r)
    out = ReminderResponse.model_validate(r)
    out.linked_asset = AssetOut.model_validate(r.linked_asset) if r.linked_asset else None
    return out


@router.delete("/reminders/{reminder_id}", status_code=204)
def delete_reminder(
    reminder_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> None:
    r = db.query(m.Reminder).filter(m.Reminder.id == reminder_id).first()
    if not r or r.user_id != user_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(r)
    db.commit()


@router.get("/calendar/day", response_model=CalendarDayData)
def calendar_day(
    date_str: str = Query(..., alias="date", min_length=10, max_length=10),
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> CalendarDayData:
    # date format: YYYY-MM-DD
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD") from None

    trades_db = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.user_id == user_id, func.date(m.Trade.traded_at) == date_str)
        .order_by(m.Trade.traded_at.asc())
        .all()
    )
    trades_out: list[TradeOut] = []
    for t in trades_db:
        row = TradeOut.model_validate(t)
        row.asset = AssetOut.model_validate(t.asset) if t.asset else None
        trades_out.append(row)

    notes_db = (
        db.query(m.Note)
        .filter(
            m.Note.user_id == user_id,
            m.Note.is_archived.is_(False),
            or_(func.date(m.Note.created_at) == date_str, func.date(m.Note.updated_at) == date_str),
        )
        .order_by(m.Note.updated_at.desc())
        .all()
    )
    notes_out = _note_list_items_from_rows(db, user_id=user_id, notes=notes_db)

    reminders_db = (
        db.query(m.Reminder)
        .options(joinedload(m.Reminder.linked_asset))
        .filter(m.Reminder.user_id == user_id, m.Reminder.remind_date == d)
        .order_by(m.Reminder.remind_time.asc().nulls_last(), m.Reminder.created_at.asc())
        .all()
    )
    reminders_out: list[ReminderResponse] = []
    for r in reminders_db:
        item = ReminderResponse.model_validate(r)
        item.linked_asset = AssetOut.model_validate(r.linked_asset) if r.linked_asset else None
        reminders_out.append(item)

    return CalendarDayData(
        date=date_str,
        trades=trades_out,
        notes=notes_out,
        reminders=reminders_out,
        trade_count=len(trades_out),
        note_count=len(notes_out),
        reminder_count=len(reminders_out),
    )


@router.get("/calendar/week", response_model=list[CalendarDayData])
def calendar_week(
    start_date: str = Query(..., min_length=10, max_length=10),
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[CalendarDayData]:
    try:
        start = date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_date format, expected YYYY-MM-DD") from None

    out: list[CalendarDayData] = []
    for i in range(7):
        d = start + timedelta(days=i)
        out.append(calendar_day(date_str=d.isoformat(), user_id=user_id, db=db))
    return out


@router.get("/calendar/month", response_model=CalendarMonthOverview)
def calendar_month(
    year: int = Query(..., ge=1970, le=2100),
    month: int = Query(..., ge=1, le=12),
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> CalendarMonthOverview:
    # month range
    first = date(year, month, 1)
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    first_dt = datetime(first.year, first.month, first.day, tzinfo=timezone.utc)
    next_dt = datetime(next_month.year, next_month.month, next_month.day, tzinfo=timezone.utc)

    # trades grouped by day
    trade_rows = (
        db.query(
            func.date(m.Trade.traded_at).label("d"),
            func.count(m.Trade.id).label("cnt"),
            func.sum(case((m.Trade.direction == m.TradeDirection.buy, 1), else_=0)).label("buy_cnt"),
            func.sum(case((m.Trade.direction == m.TradeDirection.sell, 1), else_=0)).label("sell_cnt"),
        )
        .filter(m.Trade.user_id == user_id, m.Trade.traded_at >= first_dt, m.Trade.traded_at < next_dt)
        .group_by(func.date(m.Trade.traded_at))
        .all()
    )
    trade_map = {str(d): (int(cnt), int(buy_cnt or 0), int(sell_cnt or 0)) for d, cnt, buy_cnt, sell_cnt in trade_rows}

    # notes grouped by day (created_at)
    note_rows = (
        db.query(
            func.date(m.Note.created_at).label("d"),
            func.count(m.Note.id).label("cnt"),
        )
        .filter(m.Note.user_id == user_id, m.Note.is_archived.is_(False), m.Note.created_at >= first_dt, m.Note.created_at < next_dt)
        .group_by(func.date(m.Note.created_at))
        .all()
    )
    note_map = {str(d): int(cnt) for d, cnt in note_rows}

    # reminders grouped by day
    rem_rows = (
        db.query(
            m.Reminder.remind_date.label("d"),
            func.count(m.Reminder.id).label("cnt"),
        )
        .filter(m.Reminder.user_id == user_id, m.Reminder.remind_date >= first, m.Reminder.remind_date < next_month)
        .group_by(m.Reminder.remind_date)
        .all()
    )
    rem_map = {d.isoformat(): int(cnt) for d, cnt in rem_rows}

    # build every day of month
    days_in_month = (next_month - first).days
    out: CalendarMonthOverview = []
    for i in range(days_in_month):
        day = first + timedelta(days=i)
        key = day.isoformat()
        t_cnt, b_cnt, s_cnt = trade_map.get(key, (0, 0, 0))
        n_cnt = note_map.get(key, 0)
        r_cnt = rem_map.get(key, 0)
        out.append(
            CalendarMonthOverviewItem(
                date=key,
                has_trades=t_cnt > 0,
                has_notes=n_cnt > 0,
                has_reminders=r_cnt > 0,
                trade_count=t_cnt,
                buy_count=b_cnt,
                sell_count=s_cnt,
                note_count=n_cnt,
                reminder_count=r_cnt,
            )
        )
    return out


@router.post("/notebooks", response_model=NotebookResponse)
def create_notebook(
    body: NotebookCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NotebookResponse:
    parent_id = body.parent_id
    if parent_id is not None:
        parent = db.query(m.Notebook).filter(m.Notebook.id == parent_id, m.Notebook.user_id == user_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Notebook parent not found")

    nb = m.Notebook(user_id=user_id, name=body.name.strip(), parent_id=parent_id, sort_order=0)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    # Newly created note_count is 0 by definition.
    return NotebookResponse(
        id=nb.id,
        name=nb.name,
        parent_id=nb.parent_id,
        sort_order=nb.sort_order,
        note_count=0,
        created_at=nb.created_at,
    )


@router.get("/notebooks", response_model=list[NotebookTree])
def list_notebooks(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[NotebookTree]:
    notebooks = db.query(m.Notebook).filter(m.Notebook.user_id == user_id).all()
    return _build_notebook_tree(db, user_id=user_id, notebooks=notebooks)


class NotebookUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


@router.put("/notebooks/{notebook_id}", response_model=NotebookResponse)
def rename_notebook(
    notebook_id: uuid.UUID,
    body: NotebookUpdate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NotebookResponse:
    nb = db.query(m.Notebook).filter(m.Notebook.id == notebook_id, m.Notebook.user_id == user_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    nb.name = body.name.strip()
    db.commit()
    db.refresh(nb)

    # subtree note_count
    all_notebooks = db.query(m.Notebook).filter(m.Notebook.user_id == user_id).all()
    tree = _build_notebook_tree(db, user_id=user_id, notebooks=all_notebooks)

    # find node for notebook_id
    def find(tree_nodes: list[NotebookTree]) -> Optional[NotebookTree]:
        for node in tree_nodes:
            if node.id == notebook_id:
                return node
            found = find(node.children)
            if found:
                return found
        return None

    node = find(tree)
    note_count = node.note_count if node else 0
    return NotebookResponse(
        id=nb.id,
        name=nb.name,
        parent_id=nb.parent_id,
        sort_order=nb.sort_order,
        note_count=note_count,
        created_at=nb.created_at,
    )


@router.delete("/notebooks/{notebook_id}", response_model=dict[str, bool])
def delete_notebook(
    notebook_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    nb = db.query(m.Notebook).filter(m.Notebook.id == notebook_id, m.Notebook.user_id == user_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")

    desc_ids = _collect_notebook_descendant_ids(db, user_id=user_id, root_id=notebook_id)

    # Move notes to ungrouped (notebook_id = NULL).
    notes = db.query(m.Note).filter(m.Note.user_id == user_id, m.Note.notebook_id.in_(desc_ids)).all()
    for note in notes:
        note.notebook_id = None
    db.flush()

    # Delete notebooks in subtree.
    db.query(m.Notebook).filter(m.Notebook.id.in_(desc_ids), m.Notebook.user_id == user_id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"ok": True}


@router.post("/notes", response_model=NoteResponse)
def create_note(
    body: NoteCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NoteResponse:
    if body.notebook_id is not None:
        nb = db.query(m.Notebook).filter(m.Notebook.id == body.notebook_id, m.Notebook.user_id == user_id).first()
        if not nb:
            raise HTTPException(status_code=404, detail="Notebook not found")

    asset_obj = None
    if body.linked_asset_id is not None:
        asset_obj = db.query(m.Asset).filter(m.Asset.id == body.linked_asset_id).first()
        if not asset_obj:
            raise HTTPException(status_code=404, detail="Asset not found")

    trade_obj = None
    if body.linked_trade_id is not None:
        trade_obj = (
            db.query(m.Trade).filter(m.Trade.id == body.linked_trade_id, m.Trade.user_id == user_id).first()
        )
        if not trade_obj:
            raise HTTPException(status_code=404, detail="Trade not found")

    note = m.Note(
        user_id=user_id,
        notebook_id=body.notebook_id,
        title=body.title.strip(),
        content=body.content,
        content_type=body.content_type,
        linked_asset_id=body.linked_asset_id,
        linked_trade_id=body.linked_trade_id,
        is_pinned=False,
        is_archived=False,
    )
    db.add(note)
    db.flush()

    if body.tag_ids:
        tags = db.query(m.NoteTag).filter(
            m.NoteTag.user_id == user_id,
            m.NoteTag.id.in_(body.tag_ids),
        ).all()
        tag_ids_found = {t.id for t in tags}
        missing = [tid for tid in body.tag_ids if tid not in tag_ids_found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Tag not found: {missing[0]}")
        for tag_id in body.tag_ids:
            db.add(m.NoteTagLink(note_id=note.id, tag_id=tag_id))

    db.commit()
    db.refresh(note)

    # Load tags
    tag_rows = (
        db.query(m.NoteTag)
        .join(m.NoteTagLink, m.NoteTagLink.tag_id == m.NoteTag.id)
        .filter(m.NoteTagLink.note_id == note.id)
        .all()
    )
    tag_ids = [t.id for t in tag_rows]
    count_map = _tag_note_count_map(db, user_id=user_id, tag_ids=tag_ids)
    tags_out = [
        TagResponse(id=t.id, name=t.name, color=t.color, note_count=count_map.get(t.id, 0))
        for t in tag_rows
    ]

    nb_name = None
    if note.notebook_id is not None:
        nb_name = db.query(m.Notebook).filter(m.Notebook.id == note.notebook_id).first().name

    linked_asset = AssetOut.model_validate(asset_obj) if asset_obj else None

    return NoteResponse(
        id=note.id,
        title=note.title,
        content=note.content,
        content_type=note.content_type,
        notebook_id=note.notebook_id,
        notebook_name=nb_name,
        linked_asset=linked_asset,
        linked_trade_id=note.linked_trade_id,
        is_pinned=note.is_pinned,
        is_archived=note.is_archived,
        tags=tags_out,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("/notes", response_model=list[NoteListItem])
def list_notes(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
    notebook_id: Optional[uuid.UUID] = Query(default=None),
    tag_id: Optional[uuid.UUID] = Query(default=None),
    search: Optional[str] = Query(default=None, min_length=1),
    linked_asset_id: Optional[uuid.UUID] = Query(default=None),
) -> list[NoteListItem]:
    q = db.query(m.Note).filter(m.Note.user_id == user_id, m.Note.is_archived.is_(False))

    if notebook_id is not None:
        q = q.filter(m.Note.notebook_id == notebook_id)

    if linked_asset_id is not None:
        q = q.filter(m.Note.linked_asset_id == linked_asset_id)

    if search:
        like = f"%{search}%"
        q = q.filter(or_(m.Note.title.ilike(like), m.Note.content.ilike(like)))

    if tag_id is not None:
        q = q.join(m.NoteTagLink, m.NoteTagLink.note_id == m.Note.id).filter(m.NoteTagLink.tag_id == tag_id)

    q = q.order_by(m.Note.is_pinned.desc(), m.Note.updated_at.desc())
    notes = q.all()
    note_ids = [n.id for n in notes]

    notebook_map, asset_map = _note_asset_and_notebook_names(db, note_rows=notes)
    tags_map = _note_tags_for_notes(db, user_id=user_id, note_ids=note_ids)

    out: list[NoteListItem] = []
    for n in notes:
        preview = (n.content or '')[:100]
        out.append(
            NoteListItem(
                id=n.id,
                title=n.title,
                content_preview=preview,
                notebook_name=notebook_map.get(n.notebook_id) if n.notebook_id else None,
                linked_asset_name=asset_map.get(n.linked_asset_id) if n.linked_asset_id else None,
                is_pinned=n.is_pinned,
                tags=tags_map.get(n.id, []),
                updated_at=n.updated_at,
            )
        )
    return out


@router.get("/notes/{note_id}", response_model=NoteResponse)
def get_note(
    note_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NoteResponse:
    note = db.query(m.Note).filter(m.Note.id == note_id, m.Note.user_id == user_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    nb_name = None
    if note.notebook_id is not None:
        nb = db.query(m.Notebook).filter(m.Notebook.id == note.notebook_id).first()
        nb_name = nb.name if nb else None

    asset_obj = None
    if note.linked_asset_id is not None:
        asset_obj = db.query(m.Asset).filter(m.Asset.id == note.linked_asset_id).first()

    tag_rows = (
        db.query(m.NoteTag)
        .join(m.NoteTagLink, m.NoteTagLink.tag_id == m.NoteTag.id)
        .filter(m.NoteTagLink.note_id == note.id)
        .all()
    )
    tag_ids = [t.id for t in tag_rows]
    count_map = _tag_note_count_map(db, user_id=user_id, tag_ids=tag_ids)
    tags_out = [
        TagResponse(id=t.id, name=t.name, color=t.color, note_count=count_map.get(t.id, 0))
        for t in tag_rows
    ]

    return NoteResponse(
        id=note.id,
        title=note.title,
        content=note.content,
        content_type=note.content_type,
        notebook_id=note.notebook_id,
        notebook_name=nb_name,
        linked_asset=AssetOut.model_validate(asset_obj) if asset_obj else None,
        linked_trade_id=note.linked_trade_id,
        is_pinned=note.is_pinned,
        is_archived=note.is_archived,
        tags=tags_out,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.put("/notes/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NoteResponse:
    note = db.query(m.Note).filter(m.Note.id == note_id, m.Note.user_id == user_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    payload = body.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        note.title = str(payload["title"]).strip()
    if "content" in payload and payload["content"] is not None:
        note.content = payload["content"]
    if "content_type" in payload and payload["content_type"] is not None:
        note.content_type = payload["content_type"]
    if "notebook_id" in payload:
        nb_id = payload["notebook_id"]
        if nb_id is not None:
            nb = db.query(m.Notebook).filter(m.Notebook.id == nb_id, m.Notebook.user_id == user_id).first()
            if not nb:
                raise HTTPException(status_code=404, detail="Notebook not found")
        note.notebook_id = nb_id
    if "linked_asset_id" in payload:
        aid = payload["linked_asset_id"]
        if aid is not None:
            asset = db.query(m.Asset).filter(m.Asset.id == aid).first()
            if not asset:
                raise HTTPException(status_code=404, detail="Asset not found")
        note.linked_asset_id = aid
    if "linked_trade_id" in payload:
        tid = payload["linked_trade_id"]
        if tid is not None:
            trade = db.query(m.Trade).filter(m.Trade.id == tid, m.Trade.user_id == user_id).first()
            if not trade:
                raise HTTPException(status_code=404, detail="Trade not found")
        note.linked_trade_id = tid
    if "is_pinned" in payload:
        note.is_pinned = bool(payload["is_pinned"])

    # Update tags if provided.
    if "tag_ids" in payload:
        tag_ids = payload["tag_ids"] or []
        tags = db.query(m.NoteTag).filter(m.NoteTag.user_id == user_id, m.NoteTag.id.in_(tag_ids)).all() if tag_ids else []
        found = {t.id for t in tags}
        missing = [tid for tid in tag_ids if tid not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Tag not found: {missing[0]}")
        db.query(m.NoteTagLink).filter(m.NoteTagLink.note_id == note.id).delete(synchronize_session=False)
        for tid in tag_ids:
            db.add(m.NoteTagLink(note_id=note.id, tag_id=tid))

    db.commit()
    db.refresh(note)
    # Reuse get_note to build response.
    return get_note(note_id=note.id, user_id=user_id, db=db)


@router.delete("/notes/{note_id}", response_model=NoteResponse)
def archive_note(
    note_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NoteResponse:
    note = db.query(m.Note).filter(m.Note.id == note_id, m.Note.user_id == user_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.is_archived = True
    db.commit()
    db.refresh(note)
    return get_note(note_id=note.id, user_id=user_id, db=db)


@router.post("/notes/{note_id}/move", response_model=NoteResponse)
def move_note(
    note_id: uuid.UUID,
    body: NoteMoveRequest,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> NoteResponse:
    note = db.query(m.Note).filter(m.Note.id == note_id, m.Note.user_id == user_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if body.notebook_id is not None:
        nb = db.query(m.Notebook).filter(m.Notebook.id == body.notebook_id, m.Notebook.user_id == user_id).first()
        if not nb:
            raise HTTPException(status_code=404, detail="Notebook not found")
    note.notebook_id = body.notebook_id
    db.commit()
    db.refresh(note)
    return get_note(note_id=note.id, user_id=user_id, db=db)


@router.post("/tags", response_model=TagResponse)
def create_tag(
    body: TagCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> TagResponse:
    tag = m.NoteTag(
        user_id=user_id,
        name=body.name.strip(),
        color=body.color,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)

    # note_count for this tag
    count = (
        db.query(m.Note)
        .join(m.NoteTagLink, m.NoteTagLink.note_id == m.Note.id)
        .filter(m.Note.user_id == user_id, m.Note.is_archived.is_(False), m.NoteTagLink.tag_id == tag.id)
        .count()
    )
    return TagResponse(id=tag.id, name=tag.name, color=tag.color, note_count=count)


@router.get("/tags", response_model=list[TagResponse])
def list_tags(
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> list[TagResponse]:
    tags = db.query(m.NoteTag).filter(m.NoteTag.user_id == user_id).all()
    out: list[TagResponse] = []
    for t in tags:
        count = (
            db.query(m.Note)
            .join(m.NoteTagLink, m.NoteTagLink.note_id == m.Note.id)
            .filter(m.Note.user_id == user_id, m.Note.is_archived.is_(False), m.NoteTagLink.tag_id == t.id)
            .count()
        )
        out.append(TagResponse(id=t.id, name=t.name, color=t.color, note_count=count))
    return out


@router.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: uuid.UUID,
    body: TagCreate,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> TagResponse:
    tag = db.query(m.NoteTag).filter(m.NoteTag.id == tag_id, m.NoteTag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.name = body.name.strip()
    tag.color = body.color
    db.commit()
    db.refresh(tag)

    count = (
        db.query(m.Note)
        .join(m.NoteTagLink, m.NoteTagLink.note_id == m.Note.id)
        .filter(m.Note.user_id == user_id, m.Note.is_archived.is_(False), m.NoteTagLink.tag_id == tag.id)
        .count()
    )
    return TagResponse(id=tag.id, name=tag.name, color=tag.color, note_count=count)


@router.delete("/tags/{tag_id}", response_model=dict[str, bool])
def delete_tag(
    tag_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_effective_user_id),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    tag = db.query(m.NoteTag).filter(m.NoteTag.id == tag_id, m.NoteTag.user_id == user_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Unlink notes first (avoid relying solely on DB cascade behavior).
    db.query(m.NoteTagLink).filter(m.NoteTagLink.tag_id == tag_id).delete(synchronize_session=False)
    db.delete(tag)
    db.commit()
    return {"ok": True}
