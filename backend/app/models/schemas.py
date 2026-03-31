"""Pydantic v2 request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import models as m


# --- User ---


class UserCreate(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=128)
    email: Optional[str] = Field(default=None, max_length=255)
    password: Optional[str] = Field(default=None, min_length=1, max_length=256)
    risk_preference: Optional[m.RiskPreference] = None
    settings_json: Optional[dict[str, Any]] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nickname: str
    email: Optional[str]
    subscription_tier: m.SubscriptionTier
    risk_preference: Optional[m.RiskPreference]
    settings_json: Optional[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class UserResponse(UserOut):
    """User payload returned with auth tokens (same shape as UserOut)."""


class RegisterRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=256)
    nickname: str = Field(default="KeeFoo用户", max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=1, max_length=256)


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# --- Asset ---


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    asset_type: m.AssetType
    sector: Optional[str]
    market: Optional[m.Market]
    meta_json: Optional[dict[str, Any]]


# --- Trade ---


class TradeCreate(BaseModel):
    asset_code: str = Field(..., min_length=1, max_length=64)
    asset_name: Optional[str] = Field(default=None, max_length=255)
    asset_type: m.AssetType = m.AssetType.stock
    sector: Optional[str] = None
    market: Optional[m.Market] = None
    meta_json: Optional[dict[str, Any]] = None
    direction: m.TradeDirection
    price: float = Field(..., gt=0)
    quantity: float = Field(..., gt=0)
    traded_at: datetime
    market_context: Optional[dict[str, Any]] = None
    decision_note: Optional[str] = None
    emotion_score: Optional[int] = Field(default=None, ge=1, le=10)
    confidence_score: Optional[int] = Field(default=None, ge=1, le=10)
    note_source: Optional[m.NoteSource] = None
    pnl: Optional[float] = None
    holding_days: Optional[int] = None
    exit_reason: Optional[m.ExitReason] = None
    status: m.TradeStatus = m.TradeStatus.open


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    asset_id: uuid.UUID
    direction: m.TradeDirection
    price: float
    quantity: float
    traded_at: datetime
    market_context: Optional[dict[str, Any]]
    decision_note: Optional[str]
    emotion_score: Optional[int]
    confidence_score: Optional[int]
    note_source: Optional[m.NoteSource]
    pnl: Optional[float]
    holding_days: Optional[int]
    exit_reason: Optional[m.ExitReason]
    status: m.TradeStatus
    agent_question_sent: bool
    agent_question_text: Optional[str]
    agent_question_sent_at: Optional[datetime]
    asset: Optional[AssetOut] = None


# --- Shadow position ---


class ShadowPositionCreate(BaseModel):
    asset_code: str = Field(..., min_length=1, max_length=64)
    asset_name: Optional[str] = Field(default=None, max_length=255)
    asset_type: m.AssetType = m.AssetType.stock
    sector: Optional[str] = None
    market: Optional[m.Market] = None
    shadow_type: m.ShadowType
    hypothetical_entry_price: Optional[float] = None
    scenario_push_enabled: bool = True
    push_strength_cap: str = Field(default="direction_only", max_length=64)


class ShadowPositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    asset_id: uuid.UUID
    shadow_type: m.ShadowType
    hypothetical_entry_price: Optional[float]
    scenario_push_enabled: bool
    push_strength_cap: str
    asset: Optional[AssetOut] = None


# --- Positions overview ---


class RealPositionRow(BaseModel):
    asset: AssetOut
    net_quantity: float
    weighted_avg_buy_price: Optional[float]
    open_trade_count: int


class PositionsOverview(BaseModel):
    real_positions: list[RealPositionRow]
    shadow_positions: list[ShadowPositionOut]


# --- Feed ---


class FeedCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    event_id: uuid.UUID
    relevance_level: m.RelevanceLevel
    relevance_score: float
    relevance_note: Optional[str]
    related_asset_ids: Optional[list[str]]
    is_read: bool
    is_pushed: bool
    event_title: Optional[str] = None
    event_summary: Optional[str] = None
    event_occurred_at: Optional[datetime] = None


class AgentReplyBody(BaseModel):
    user_id: uuid.UUID
    trade_id: uuid.UUID
    reply: str = Field(..., min_length=1)


class PendingQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trade_id: uuid.UUID
    asset_code: Optional[str] = None
    asset_name: Optional[str] = None
    question_text: str
    sent_at: Optional[datetime]


class AgentParseResult(BaseModel):
    decision_type: str
    time_horizon: str
    confidence: str
    emotion_score: int = Field(ge=1, le=10)
    structured_note: str


class ScenarioPushResponse(BaseModel):
    shadow_id: uuid.UUID
    asset_name: str
    asset_code: str
    event_title: str
    scenario_text: str
    direction: str
    created_at: datetime


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: m.EventType
    title: str
    summary: Optional[str]
    source_url: Optional[str]
    source_tier: m.SourceTier
    impact_level: m.ImpactLevel
    occurred_at: datetime


class AssetDetailResponse(BaseModel):
    asset: AssetOut
    trades: list[TradeOut]
    events: list[EventOut]
    shadow_position: Optional[ShadowPositionOut] = None


# --- Analysis: reports / profile / graph ---


class ReportResponse(BaseModel):
    """复盘报告；无数据时仅 has_data/message/period/generated_at 有值。"""

    has_data: bool
    period: Optional[str] = None
    generated_at: Optional[str] = None
    message: Optional[str] = None
    summary: Optional[dict[str, Any]] = None
    behavior: Optional[dict[str, Any]] = None
    biases: Optional[dict[str, Any]] = None
    ai_commentary: Optional[list[str]] = None


class StrategyProfileResponse(BaseModel):
    """策略画像；交易不足 5 笔时 has_data=false。"""

    has_data: bool
    message: Optional[str] = None
    time_analysis: Optional[dict[str, Any]] = None
    asset_analysis: Optional[dict[str, Any]] = None
    behavior_analysis: Optional[dict[str, Any]] = None
    bias_analysis: Optional[dict[str, Any]] = None


class BiasAnalysisResponse(BaseModel):
    """认知偏差分数 + 各指标说明。"""

    has_data: bool
    message: Optional[str] = None
    disposition_score: Optional[int] = None
    overtrading_score: Optional[int] = None
    emotional_score: Optional[int] = None
    fomo_score: Optional[int] = None
    descriptions: Optional[dict[str, str]] = None


class KnowledgeGraphResponse(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


# --- Notes / Notebooks ---


class NotebookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    parent_id: Optional[uuid.UUID] = None


class NotebookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    parent_id: Optional[uuid.UUID] = None
    sort_order: int
    note_count: int = 0
    created_at: datetime


class NotebookTree(BaseModel):
    id: uuid.UUID
    name: str
    children: list["NotebookTree"] = []
    note_count: int = 0


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    color: str = Field(default="#999999", min_length=1, max_length=7)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str
    note_count: int = 0


class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    content: str
    content_type: m.NoteContentType = m.NoteContentType.markdown
    notebook_id: Optional[uuid.UUID] = None
    linked_asset_id: Optional[uuid.UUID] = None
    linked_trade_id: Optional[uuid.UUID] = None
    tag_ids: Optional[list[uuid.UUID]] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    content: Optional[str] = None
    content_type: Optional[m.NoteContentType] = None
    notebook_id: Optional[uuid.UUID] = None
    linked_asset_id: Optional[uuid.UUID] = None
    linked_trade_id: Optional[uuid.UUID] = None
    is_pinned: Optional[bool] = None
    tag_ids: Optional[list[uuid.UUID]] = None


class AssetResponse(AssetOut):
    """Alias to match 'AssetResponse' naming in request spec."""


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    content_type: m.NoteContentType
    notebook_id: Optional[uuid.UUID] = None
    notebook_name: Optional[str] = None
    linked_asset: Optional[AssetResponse] = None
    linked_trade_id: Optional[uuid.UUID] = None
    is_pinned: bool
    is_archived: bool
    tags: list[TagResponse] = []
    created_at: datetime
    updated_at: datetime


class NoteListItem(BaseModel):
    id: uuid.UUID
    title: str
    content_preview: str
    notebook_name: Optional[str] = None
    linked_asset_name: Optional[str] = None
    is_pinned: bool
    tags: list[TagResponse] = []
    updated_at: datetime


class NoteMoveRequest(BaseModel):
    notebook_id: Optional[uuid.UUID] = None


# --- Calendar / Reminders ---


class ReminderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None
    remind_date: date
    remind_time: Optional[time] = None
    priority: m.ReminderPriority = m.ReminderPriority.medium
    linked_asset_id: Optional[uuid.UUID] = None
    linked_trade_id: Optional[uuid.UUID] = None


class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    description: Optional[str] = None
    remind_date: Optional[date] = None
    remind_time: Optional[time] = None
    is_completed: Optional[bool] = None
    priority: Optional[m.ReminderPriority] = None
    linked_asset_id: Optional[uuid.UUID] = None
    linked_trade_id: Optional[uuid.UUID] = None


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str] = None
    remind_date: date
    remind_time: Optional[time] = None
    is_completed: bool
    priority: m.ReminderPriority
    linked_asset: Optional[AssetResponse] = None
    linked_trade_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class CalendarDayData(BaseModel):
    date: str
    trades: list[TradeOut] = []
    notes: list[NoteListItem] = []
    reminders: list[ReminderResponse] = []
    trade_count: int = 0
    note_count: int = 0
    reminder_count: int = 0


class CalendarMonthOverviewItem(BaseModel):
    date: str
    has_trades: bool
    has_notes: bool
    has_reminders: bool
    trade_count: int
    buy_count: int
    sell_count: int
    note_count: int
    reminder_count: int


CalendarMonthOverview = list[CalendarMonthOverviewItem]

