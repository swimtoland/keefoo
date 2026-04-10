"""
第三层：信息博弈 Agent 团队

四个 Agent：
- Interpreter：事件 → 结构化市场因子
- Bull：强制构建积极面逻辑链
- Bear：强制构建风险面逻辑链
- CardWriter：综合输出原子卡片内容

合规红线：描述信号，不给结论；呈现数据，不做判断。
"""

from __future__ import annotations

import json
from typing import Any, Optional

from app.services.ai_service import _chat, _extract_json


# ---------------------------------------------------------------------------
# 合规 System Prompt 前缀（所有 Agent 共享）
# ---------------------------------------------------------------------------

_COMPLIANCE_PREFIX = (
    "【合规红线 - 必须遵守】\n"
    "1. 绝对不给投资建议，不说「建议买入/卖出」\n"
    "2. 绝对不预测价格走势，不说「预计上涨/下跌」\n"
    "3. 只描述信号和事实，不做定性判断\n"
    "4. 用「历史数据显示」「信号偏多/偏空」替代「会涨/会跌」\n"
    "5. 你是信息整理工具，不是投资顾问\n\n"
)


# ---------------------------------------------------------------------------
# Interpreter：事件 → 结构化因子
# ---------------------------------------------------------------------------

def interpret_event(
    event_title: str,
    event_summary: str,
    related_assets: list[dict[str, str]],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    将一条事件解析为结构化市场因子。

    返回：
    {
        "factors": [
            {"type": "policy|earnings|sentiment|technical|macro",
             "description": "...",
             "direction": "positive|negative|neutral",
             "duration": "short|medium|long",
             "confidence": "high|medium|low"}
        ],
        "affected_assets": ["代码1", "代码2"],
        "summary": "一句话概括"
    }
    """
    system = (
        _COMPLIANCE_PREFIX
        + "你是 KeeFoo 的事件解析引擎（Interpreter）。\n"
        "你的任务是将一条市场事件拆解为结构化因子。\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "factors": [\n'
        '    {"type": "policy|earnings|sentiment|technical|macro",\n'
        '     "description": "不超过30字的因子描述",\n'
        '     "direction": "positive|negative|neutral",\n'
        '     "duration": "short|medium|long",\n'
        '     "confidence": "high|medium|low"}\n'
        "  ],\n"
        '  "affected_assets": ["涉及的标的代码"],\n'
        '  "summary": "一句话概括该事件的核心信息，不超过40字"\n'
        "}\n\n"
        "注意：direction 表示信号方向，不是预测。"
    )

    assets_str = ", ".join(f"{a.get('name','')}({a.get('code','')})" for a in related_assets)
    user = (
        f"事件标题：{event_title}\n"
        f"事件摘要：{event_summary or '无'}\n"
        f"关联标的：{assets_str or '无'}\n"
        "请解析为结构化因子。"
    )

    try:
        text = _chat(system, user, max_tokens=400, temperature=0.3, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "factors" in result:
            return result
    except Exception as e:
        print(f"Interpreter failed: {e}")

    # Fallback
    return {
        "factors": [{"type": "macro", "description": event_title[:30], "direction": "neutral", "duration": "short", "confidence": "low"}],
        "affected_assets": [a.get("code", "") for a in related_assets],
        "summary": event_title[:40],
    }


# ---------------------------------------------------------------------------
# Bull：强制构建积极面
# ---------------------------------------------------------------------------

def argue_bull(
    event_title: str,
    interpretation: dict[str, Any],
    asset_context: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    强制从积极角度分析该事件。

    返回：
    {
        "argument": "不超过80字的积极面分析",
        "supporting_signals": ["信号1", "信号2"],
        "historical_parallel": "历史上类似情景的表现参考（如有）"
    }
    """
    system = (
        _COMPLIANCE_PREFIX
        + "你是 KeeFoo 的多头分析引擎（Bull Agent）。\n"
        "你的任务是强制从积极角度解读这条事件信息。\n"
        "即使事件看起来是负面的，你也要找到其中可能的积极信号。\n\n"
        "注意：你不是在推荐买入，你是在呈现'如果从积极角度理解，逻辑链是什么'。\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "argument": "不超过80字的积极面分析",\n'
        '  "supporting_signals": ["支撑该观点的信号1", "信号2"],\n'
        '  "historical_parallel": "历史类似情景参考，无则填空字符串"\n'
        "}"
    )

    user = (
        f"事件：{event_title}\n"
        f"结构化因子：{json.dumps(interpretation.get('factors', []), ensure_ascii=False)}\n"
        f"标的背景：{json.dumps(asset_context, ensure_ascii=False)}\n"
        "请从积极角度分析。"
    )

    try:
        text = _chat(system, user, max_tokens=300, temperature=0.6, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "argument" in result:
            return result
    except Exception as e:
        print(f"Bull Agent failed: {e}")

    return {
        "argument": "当前信息存在多种解读可能，部分信号偏积极方向。",
        "supporting_signals": [],
        "historical_parallel": "",
    }


# ---------------------------------------------------------------------------
# Bear：强制构建风险面
# ---------------------------------------------------------------------------

def argue_bear(
    event_title: str,
    interpretation: dict[str, Any],
    asset_context: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    强制从风险角度分析该事件。

    返回：
    {
        "argument": "不超过80字的风险面分析",
        "risk_signals": ["风险信号1", "风险信号2"],
        "historical_parallel": "历史上类似情景的风险参考（如有）"
    }
    """
    system = (
        _COMPLIANCE_PREFIX
        + "你是 KeeFoo 的空头分析引擎（Bear Agent）。\n"
        "你的任务是强制从风险角度解读这条事件信息。\n"
        "即使事件看起来是正面的，你也要找到其中潜在的风险信号。\n\n"
        "注意：你不是在推荐卖出，你是在呈现'如果从谨慎角度理解，需要关注什么'。\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "argument": "不超过80字的风险面分析",\n'
        '  "risk_signals": ["风险信号1", "风险信号2"],\n'
        '  "historical_parallel": "历史类似情景风险参考，无则填空字符串"\n'
        "}"
    )

    user = (
        f"事件：{event_title}\n"
        f"结构化因子：{json.dumps(interpretation.get('factors', []), ensure_ascii=False)}\n"
        f"标的背景：{json.dumps(asset_context, ensure_ascii=False)}\n"
        "请从风险角度分析。"
    )

    try:
        text = _chat(system, user, max_tokens=300, temperature=0.6, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "argument" in result:
            return result
    except Exception as e:
        print(f"Bear Agent failed: {e}")

    return {
        "argument": "当前信息存在不确定性，部分信号需要关注潜在风险。",
        "risk_signals": [],
        "historical_parallel": "",
    }


# ---------------------------------------------------------------------------
# CardWriter：综合输出原子卡片
# ---------------------------------------------------------------------------

def write_card(
    event_title: str,
    interpretation: dict[str, Any],
    bull_view: Optional[dict[str, Any]],
    bear_view: Optional[dict[str, Any]],
    user_position_context: str,
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    综合所有分析结果，生成面向用户的原子卡片内容。

    返回：
    {
        "headline": "卡片标题（不超过25字）",
        "body": "卡片正文（不超过120字）",
        "perspectives": [
            {"label": "积极信号", "text": "..."},
            {"label": "风险关注", "text": "..."}
        ],
        "user_relevance": "与用户持仓的关联说明（不超过50字）"
    }
    """
    has_debate = bull_view is not None and bear_view is not None

    if has_debate:
        debate_context = (
            f"积极面分析：{bull_view.get('argument', '')}\n"
            f"风险面分析：{bear_view.get('argument', '')}\n"
        )
    else:
        debate_context = "（该事件未触发多空博弈分析）\n"

    system = (
        _COMPLIANCE_PREFIX
        + "你是 KeeFoo 的卡片撰写引擎（CardWriter）。\n"
        "你的任务是将事件分析综合为一张简洁、信息密度高的原子卡片。\n\n"
        "卡片设计原则：\n"
        "1. headline：一句话概括核心信息，像新闻标题一样吸引注意力\n"
        "2. body：补充关键细节，不重复 headline\n"
        "3. perspectives：如果有多空分析，分两个视角呈现；没有则只写一个中性视角\n"
        "4. user_relevance：说明这条信息为什么和用户有关\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "headline": "不超过25字",\n'
        '  "body": "不超过120字",\n'
        '  "perspectives": [\n'
        '    {"label": "视角名称", "text": "不超过40字"}\n'
        "  ],\n"
        '  "user_relevance": "不超过50字"\n'
        "}"
    )

    user = (
        f"事件：{event_title}\n"
        f"结构化因子：{json.dumps(interpretation.get('factors', []), ensure_ascii=False)}\n"
        f"{debate_context}"
        f"用户持仓关联：{user_position_context}\n"
        "请生成原子卡片。"
    )

    try:
        text = _chat(system, user, max_tokens=400, temperature=0.5, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "headline" in result:
            return result
    except Exception as e:
        print(f"CardWriter failed: {e}")

    # Fallback：用原始数据直接构建
    perspectives = []
    if bull_view:
        perspectives.append({"label": "积极信号", "text": bull_view.get("argument", "")[:40]})
    if bear_view:
        perspectives.append({"label": "风险关注", "text": bear_view.get("argument", "")[:40]})
    if not perspectives:
        perspectives.append({"label": "信息概要", "text": interpretation.get("summary", event_title)[:40]})

    return {
        "headline": event_title[:25],
        "body": interpretation.get("summary", "")[:120],
        "perspectives": perspectives,
        "user_relevance": user_position_context[:50],
    }
