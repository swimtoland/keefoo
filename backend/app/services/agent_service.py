"""
Agent 协调器 (Orchestrator)：管理 L1-L3 团队。
"""

from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session
from app.models import models as m
from app.agents.core import L1RuleAgent, L2GraphAgent, L3LogicAgent
from app.core.config import get_settings

class AgentOrchestrator:
    def __init__(self):
        self.l1 = L1RuleAgent("Sentinel", "Checker")
        self.l2 = L2GraphAgent("Weaver", "Linker")
        self.l3 = L3LogicAgent("Judge", "Final Judge")

    def run_full_audit(self, trade: m.Trade, asset: m.Asset, events: list[m.Event], market_context: dict, db: Session | None = None) -> str:
        """
        运行完整的 Agent 团队审计流程。
        """
        # 1. 整理基础数据
        trade_info = {
            "asset_name": asset.name,
            "asset_code": asset.code,
            "price": float(trade.price),
            "direction": trade.direction.value if trade.direction else "buy",
            "quantity": float(trade.quantity) if trade.quantity else 0,
            "traded_at": trade.traded_at.isoformat() if trade.traded_at else None
        }
        
        # 2. L1 Sentinel 生成事实报告
        l1_report = self.l1.process(trade_info, market_context)
        
        # 3. L2 Weaver 生成情报报告
        event_list = [{"title": e.title, "type": e.event_type.value if e.event_type else "unknown", "impact": e.impact_level.value if e.impact_level else "medium"} for e in events]
        l2_report = self.l2.process(trade_info, event_list)
        
        # 4. 加载用户策略手册 (Strategy Manual)
        strategy_manual = "（未定义个人策略）"
        if db and trade.user_id:
            strategies = db.query(m.Strategy).filter(m.Strategy.user_id == trade.user_id, m.Strategy.is_active == True).all()
            if strategies:
                strategy_manual = "\n".join([f"- {s.title}: {s.content}" for s in strategies])

        # 5. L3 Judge 逻辑审判 (核心追问)
        user_note = trade.decision_note or "（无自述逻辑）"
        
        # 增强 L3 上下文：注入策略手册
        l3_context = f"{l1_report}\n\n【用户个人策略手册】：\n{strategy_manual}"
        
        final_question = self.l3.process(user_note, l3_context, l2_report, trade_info)
        
        return final_question

# 单例协调器
orchestrator = AgentOrchestrator()

def load_events_near_trade(db: Session, asset_id: uuid.UUID, traded_at: datetime, days_before: int = 7, days_after: int = 1) -> list[m.Event]:
    """
    加载交易前后指定天数内与该资产相关的事件。
    """
    start_date = traded_at - timedelta(days=days_before)
    end_date = traded_at + timedelta(days=days_after)
    
    events = (
        db.query(m.Event)
        .join(m.EventAssetLink, m.EventAssetLink.event_id == m.Event.id)
        .filter(
            m.EventAssetLink.asset_id == asset_id,
            m.Event.occurred_at >= start_date,
            m.Event.occurred_at <= end_date
        )
        .order_by(m.Event.occurred_at.desc())
        .all()
    )
    return events

def parse_user_reply(reply_text: str) -> dict:
    """
    解析用户回复的简单启发式 Fallback。
    """
    text = reply_text.lower()
    
    # 简单的关键词匹配逻辑
    decision_type = "sentiment"
    if any(k in text for k in ["均线", "突破", "支撑", "压力", "技术", "macd", "kdj"]):
        decision_type = "technical"
    elif any(k in text for k in ["财报", "业绩", "估值", "利润", "基本面", "研报"]):
        decision_type = "fundamental"
    elif any(k in text for k in ["消息", "政策", "新闻", "利好", "利空", "公告"]):
        decision_type = "event_driven"
        
    confidence_score = 5
    if any(k in text for k in ["确信", "肯定", "看好", "必须", "强烈"]):
        confidence_score = 8
    elif any(k in text for k in ["试试", "可能", "大概", "直觉", "感觉"]):
        confidence_score = 3
        
    emotion_score = 5
    if any(k in text for k in ["兴奋", "激动", "冲动", "赶不上", "抢"]):
        emotion_score = 8
    elif any(k in text for k in ["冷静", "观望", "平和"]):
        emotion_score = 2
        
    return {
        "decision_type": decision_type,
        "emotion_score": emotion_score,
        "confidence_score": confidence_score,
        "structured_note": reply_text[:200]
    }

def generate_question(trade: m.Trade, asset: m.Asset, events: list[m.Event], extra_context: dict | None = None, db: Session | None = None) -> str:
    """
    KeeFoo Agent 团队流水线入口。
    """
    settings = get_settings()
    has_ai = bool(getattr(settings, "DEEPSEEK_API_KEY", ""))
    
    if not has_ai:
        # Fallback to simple rule if no API key
        return f"这笔 {asset.name} 的交易，你当时最核心的买入逻辑是什么？"

    try:
        market_context = extra_context or {}
        return orchestrator.run_full_audit(trade, asset, events, market_context, db=db)
    except Exception as e:
        print(f"Agent Orchestrator failed: {e}")
        return f"针对 {asset.name} 的这笔交易，你当时认为最重要的信息变量是什么？"
