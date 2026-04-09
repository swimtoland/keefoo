"""
KeeFoo Agent 团队：核心定义与角色划分。
"""

from __future__ import annotations
import json
from typing import Any, Optional
from app.services.ai_service import _chat
from app.core.config import get_settings

class BaseAgent:
    def __init__(self, name: str, role: str, model: str = "deepseek-chat"):
        self.name = name
        self.role = role
        self.model = model

    def _think(self, system: str, user: str, temperature: float = 0.7) -> str:
        settings = get_settings()
        # 如果配置了 Claude，Judge 自动升级为 Claude
        actual_model = self.model
        if self.name == "Judge" and getattr(settings, "CLAUDE_API_KEY", ""):
            actual_model = "claude-3-5-sonnet-20240620"
            
        return _chat(system, user, max_tokens=300, temperature=temperature, model=actual_model)

class L1RuleAgent(BaseAgent):
    """
    代号：Sentinel (检查员)
    职责：基于技术面和价格事实进行「静态校验」。
    """
    def process(self, trade_info: dict, market_context: dict) -> str:
        system = (
            "你是 KeeFoo L1 级 Agent：Sentinel。\n"
            "你的职责是提取交易中的客观事实（价格、趋势、指标）。\n"
            "不要进行主观分析，只输出你看到的关键事实，例如：'价格处于20日均线上方'、'当前成交量是平均水平的2倍'。\n"
            "如果数据有明显矛盾，请直接指出。"
        )
        user = f"交易数据：{trade_info}\n市场行情：{market_context}"
        return self._think(system, user, temperature=0.1)

class L2GraphAgent(BaseAgent):
    """
    代号：Weaver (关联员)
    职责：基于知识图谱和事件关联进行「动态情报汇总」。
    """
    def process(self, trade_info: dict, events: list[dict]) -> str:
        system = (
            "你是 KeeFoo L2 级 Agent：Weaver。\n"
            "你的职责是寻找交易标的与外部事件的因果联系。\n"
            "利用提供的事件列表，分析哪些事件可能正在影响该标的。输出：'相关事件 X 的影响权重较高，可能造成短期流动性冲击'。\n"
            "目标是提供用户可能忽略的关联情报。"
        )
        user = f"标的：{trade_info.get('asset_name')}\n相关事件：{json.dumps(events, ensure_ascii=False)}"
        return self._think(system, user, temperature=0.5)

class L3LogicAgent(BaseAgent):
    """
    代号：Judge (审判长)
    职责：对比 L1 事实、L2 情报与用户自述，进行「逻辑审判」。
    """
    def process(self, user_note: str, l1_report: str, l2_report: str, trade_info: dict) -> str:
        system = (
            "你是 KeeFoo L3 级顶级 Agent：Judge（审判长）。\n"
            "你的任务是进行「逻辑降维打击」。你拿到了 L1 的事实报告和 L2 的关联情报，以及用户在交易时的自述。\n\n"
            "你的提问原则：\n"
            "1. **寻找逻辑断裂点**：如果用户说看多，但 L1 显示跌破位，L2 显示重大利空，问他他的‘底气’在哪里？\n"
            "2. **挑战偏误**：识别用户的锚定效应、损失厌恶或过度自信。\n"
            "3. **高冷专业**：语气冷峻，不需要寒暄，问题字数严格控制在 50 字以内，必须带有深度的思考冲击感。\n"
            "禁止：禁止给投资建议，禁止做价格预测。"
        )
        user = (
            f"用户自述：{user_note}\n"
            f"L1 事实报告：{l1_report}\n"
            f"L2 关联情报：{l2_report}\n"
            f"交易明细：{trade_info}\n"
            "请给出一个针对其逻辑矛盾的终极追问。"
        )
        return self._think(system, user, temperature=0.8)
