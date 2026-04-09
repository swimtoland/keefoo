
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.getcwd())

from app.models import models as m
from app.services.agent_service import orchestrator
from app.core.config import get_settings

def test_multi_agent_audit():
    print("=== Testing KeeFoo Agent Team (Sentinel -> Weaver -> Judge) ===")
    
    # 模拟资产与交易
    asset = m.Asset(name="英伟达 (NVDA)", code="NVDA", sector="半导体")
    trade = m.Trade(
        price=140.0,
        direction=m.TradeDirection.buy,
        traded_at=datetime.now(timezone.utc),
        quantity=10,
        decision_note="我认为 AI 长期趋势不可阻挡，现在是回调买入的好时机。"
    )
    
    # 模拟 L1 事实：其实价格刚破位，成交量萎缩
    market_context = {
        "technical_fact": "价格跌破 50 日均线，成交量较前一交易日萎缩 30%",
        "price_action": "处于短期下行通道"
    }
    
    # 模拟 L2 情报：相关供应链传出砍单消息（用户可能不知道）
    events = [
        m.Event(
            title="下游大厂砍单传闻",
            summary="传闻某头部云厂商削减了明年 H1 的订单。影响权重：极高。",
            event_type=m.EventType.macro,
            impact_level=m.ImpactLevel.high
        )
    ]
    
    # 运行审计
    print("\n[Step 1] Running L1 Sentinel...")
    l1_out = orchestrator.l1.process({"asset_name": "NVDA", "price": 140}, market_context)
    print(f"L1 Report: {l1_out}")
    
    print("\n[Step 2] Running L2 Weaver...")
    l2_out = orchestrator.l2.process({"asset_name": "NVDA"}, [{"title": e.title, "summary": e.summary} for e in events])
    print(f"L2 Report: {l2_out}")
    
    print("\n[Step 3] Running L3 Judge (The Socratic Climax)...")
    final_q = orchestrator.run_full_audit(trade, asset, events, market_context)
    print(f"\nFINAL QUESTION: {final_q}")

if __name__ == "__main__":
    test_multi_agent_audit()
