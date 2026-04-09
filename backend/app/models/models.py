"""SQLAlchemy ORM models for KeeFoo."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _enum_values(cls: type[enum.Enum]) -> list[str]:
    return [e.value for e in cls]


class SubscriptionTier(str, enum.Enum):
    free = "free"
    basic = "basic"
    pro = "pro"


class RiskPreference(str, enum.Enum):
    conservative = "conservative"
    moderate = "moderate"
    aggressive = "aggressive"


class AssetType(str, enum.Enum):
    stock = "stock"
    fund = "fund"
    bond = "bond"
    futures = "futures"
    gold = "gold"


class Market(str, enum.Enum):
    sh = "sh"
    sz = "sz"
    hk = "hk"
    us = "us"


class TradeDirection(str, enum.Enum):
    buy = "buy"
    sell = "sell"


class NoteSource(str, enum.Enum):
    user_input = "user_input"
    agent_parsed = "agent_parsed"
    silence_inferred = "silence_inferred"


class ExitReason(str, enum.Enum):
    take_profit = "take_profit"
    stop_loss = "stop_loss"
    rebalance = "rebalance"
    other = "other"


class TradeStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class ShadowType(str, enum.Enum):
    watchlist = "watchlist"
    missed = "missed"


class EventType(str, enum.Enum):
    earnings = "earnings"
    policy = "policy"
    executive = "executive"
    rating = "rating"
    macro = "macro"
    announcement = "announcement"


class SourceTier(str, enum.Enum):
    L1_official = "L1_official"
    L2_professional = "L2_professional"
    L3_social = "L3_social"


class ImpactLevel(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class RelevanceLevel(str, enum.Enum):
    direct = "direct"
    entity = "entity"
    sector = "sector"
    macro = "macro"


class NoteContentType(str, enum.Enum):
    markdown = "markdown"
    html = "html"


class ReminderPriority(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nickname: Mapped[str] = mapped_column(String(128), nullable=False, default="KeeFoo用户")
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        SQLEnum(SubscriptionTier, values_callable=_enum_values, native_enum=False),
        nullable=False,
        default=SubscriptionTier.free,
    )
    risk_preference: Mapped[Optional[RiskPreference]] = mapped_column(
        SQLEnum(RiskPreference, values_callable=_enum_values, native_enum=False),
        nullable=True,
    )
    settings_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    trades: Mapped[list["Trade"]] = relationship(back_populates="user")
    shadow_positions: Mapped[list["ShadowPosition"]] = relationship(back_populates="user")
    feed_cards: Mapped[list["FeedCard"]] = relationship(back_populates="user")
    strategies: Mapped[list["Strategy"]] = relationship(back_populates="user")

    notebooks: Mapped[list["Notebook"]] = relationship(back_populates="user")
    notes: Mapped[list["Note"]] = relationship(back_populates="user")
    note_tags: Mapped[list["NoteTag"]] = relationship(back_populates="user")
    reminders: Mapped[list["Reminder"]] = relationship(back_populates="user")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type: Mapped[AssetType] = mapped_column(
        SQLEnum(AssetType, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    sector: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    market: Mapped[Optional[Market]] = mapped_column(
        SQLEnum(Market, values_callable=_enum_values, native_enum=False),
        nullable=True,
    )
    meta_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    trades: Mapped[list["Trade"]] = relationship(back_populates="asset")
    shadow_positions: Mapped[list["ShadowPosition"]] = relationship(back_populates="asset")
    event_links: Mapped[list["EventAssetLink"]] = relationship(back_populates="asset")

    notes: Mapped[list["Note"]] = relationship(back_populates="linked_asset")
    reminders: Mapped[list["Reminder"]] = relationship(back_populates="linked_asset")


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    direction: Mapped[TradeDirection] = mapped_column(
        SQLEnum(TradeDirection, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    traded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    market_context: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emotion_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confidence_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    note_source: Mapped[Optional[NoteSource]] = mapped_column(
        SQLEnum(NoteSource, values_callable=_enum_values, native_enum=False),
        nullable=True,
    )
    pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    holding_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    exit_reason: Mapped[Optional[ExitReason]] = mapped_column(
        SQLEnum(ExitReason, values_callable=_enum_values, native_enum=False),
        nullable=True,
    )
    status: Mapped[TradeStatus] = mapped_column(
        SQLEnum(TradeStatus, values_callable=_enum_values, native_enum=False),
        nullable=False,
        default=TradeStatus.open,
    )
    agent_question_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    agent_question_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    agent_question_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="trades")
    asset: Mapped["Asset"] = relationship(back_populates="trades")

    notes: Mapped[list["Note"]] = relationship(back_populates="linked_trade")
    reminders: Mapped[list["Reminder"]] = relationship(back_populates="linked_trade")


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    remind_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    remind_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    priority: Mapped[ReminderPriority] = mapped_column(
        SQLEnum(ReminderPriority, values_callable=_enum_values, native_enum=False),
        nullable=False,
        default=ReminderPriority.medium,
    )

    linked_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    linked_trade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("trades.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="reminders")
    linked_asset: Mapped[Optional["Asset"]] = relationship(back_populates="reminders", foreign_keys=[linked_asset_id])
    linked_trade: Mapped[Optional["Trade"]] = relationship(back_populates="reminders", foreign_keys=[linked_trade_id])


class ShadowPosition(Base):
    __tablename__ = "shadow_positions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    shadow_type: Mapped[ShadowType] = mapped_column(
        SQLEnum(ShadowType, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    hypothetical_entry_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    scenario_push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    push_strength_cap: Mapped[str] = mapped_column(String(64), nullable=False, default="direction_only")

    user: Mapped["User"] = relationship(back_populates="shadow_positions")
    asset: Mapped["Asset"] = relationship(back_populates="shadow_positions")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[EventType] = mapped_column(
        SQLEnum(EventType, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_tier: Mapped[SourceTier] = mapped_column(
        SQLEnum(SourceTier, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    impact_level: Mapped[ImpactLevel] = mapped_column(
        SQLEnum(ImpactLevel, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    asset_links: Mapped[list["EventAssetLink"]] = relationship(back_populates="event")
    feed_cards: Mapped[list["FeedCard"]] = relationship(back_populates="event")


class EventAssetLink(Base):
    __tablename__ = "event_asset_links"
    __table_args__ = (UniqueConstraint("event_id", "asset_id", name="uq_event_asset"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    event: Mapped["Event"] = relationship(back_populates="asset_links")
    asset: Mapped["Asset"] = relationship(back_populates="event_links")


class FeedCard(Base):
    __tablename__ = "feed_cards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True)
    relevance_level: Mapped[RelevanceLevel] = mapped_column(
        SQLEnum(RelevanceLevel, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    relevance_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    related_asset_ids: Mapped[Optional[list[Any]]] = mapped_column(JSON, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_pushed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship(back_populates="feed_cards")
    event: Mapped["Event"] = relationship(back_populates="feed_cards")


# --- Notes / Notebooks ---


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notebooks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="notebooks")
    parent: Mapped[Optional["Notebook"]] = relationship(
        back_populates="children",
        remote_side=[id],
    )
    children: Mapped[list["Notebook"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    notes: Mapped[list["Note"]] = relationship(back_populates="notebook")


class NoteTag(Base):
    __tablename__ = "note_tags"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#999999")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="note_tags")
    note_tag_links: Mapped[list["NoteTagLink"]] = relationship(back_populates="tag", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(
        "Note",
        secondary="note_tag_links",
        back_populates="tags",
        overlaps="note_tag_links",
    )


class NoteTagLink(Base):
    __tablename__ = "note_tag_links"

    note_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("note_tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    note: Mapped["Note"] = relationship(back_populates="note_tag_links", overlaps="notes")
    tag: Mapped["NoteTag"] = relationship(back_populates="note_tag_links", overlaps="notes")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    notebook_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notebooks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[NoteContentType] = mapped_column(
        SQLEnum(NoteContentType, values_callable=_enum_values, native_enum=False),
        nullable=False,
        default=NoteContentType.markdown,
    )
    linked_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    linked_trade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("trades.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="notes")
    notebook: Mapped[Optional["Notebook"]] = relationship(back_populates="notes")

    linked_asset: Mapped[Optional["Asset"]] = relationship(back_populates="notes", foreign_keys=[linked_asset_id])
    linked_trade: Mapped[Optional["Trade"]] = relationship(back_populates="notes", foreign_keys=[linked_trade_id])

    note_tag_links: Mapped[list["NoteTagLink"]] = relationship(back_populates="note", cascade="all, delete-orphan")
    tags: Mapped[list["NoteTag"]] = relationship(
        "NoteTag",
        secondary="note_tag_links",
        back_populates="notes",
        overlaps="note_tag_links,tag,note",
    )


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    strategy_type: Mapped[str] = mapped_column(String(64), nullable=False, default="custom")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="strategies")
