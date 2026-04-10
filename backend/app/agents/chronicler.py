"""
第五层 Agent：Chronicler（记史官）

职责：
- 基于 report_service 的统计数据，生成有叙事深度的复盘报告
- 日报：今日发生了什么 + 和你的持仓有什么关系
- 周报/月报：交易行为复盘 + 偏差诊断叙事化
- 不做裁判，不做马后炮
"""

from __future__ import annotations

import json
from typing import Any

from app.services.ai_service import _chat, _extract_json


# ---------------------------------------------------------------------------
# 日报生成
# ---------------------------------------------------------------------------

def generate_daily_report(
    user_context: dict[str, Any],
    today_cards: list[dict[str, Any]],
    position_summary: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    基于今日信息流卡片 + 持仓概览，生成每日收盘日报。

    返回：
    {
        "title": "日报标题",
        "sections": [
            {"heading": "今日要点", "content": "..."},
            {"heading": "持仓关联", "content": "..."},
            {"heading": "明日关注", "content": "..."}
        ],
        "one_liner": "一句话总结（适合推送通知）"
    }
    """
    system = (
        "你是 KeeFoo 的日报撰写引擎（Chronicler）。\n"
        "每日收盘后，你基于今天的信息流和用户持仓状况，生成一份简洁的日报。\n\n"
        "写作原则：\n"
        "1. 只描述已发生的事实和信号，不预测明天走势\n"
        "2. '明日关注'只列出已公布的事件日程（如财报发布日、政策会议），不猜测影响\n"
        "3. 语气专业友好，像一个帮你做笔记的同事\n"
        "4. 不给投资建议\n"
        "5. 总字数不超过 300 字\n\n"
        "请严格按以下 JSON 输出：\n"
        "{\n"
        '  "title": "日报标题，不超过15字",\n'
        '  "sections": [\n'
        '    {"heading": "今日要点", "content": "..."},\n'
        '    {"heading": "持仓关联", "content": "..."},\n'
        '    {"heading": "明日关注", "content": "..."}\n'
        "  ],\n"
        '  "one_liner": "一句话总结，不超过30字"\n'
        "}"
    )

    # 整理卡片摘要
    card_summaries = []
    for c in today_cards[:10]:
        card = c.get("card", {})
        headline = card.get("headline", c.get("event_title", ""))
        has_debate = c.get("has_debate", False)
        card_summaries.append(f"{'[重要] ' if has_debate else ''}{headline}")

    user = (
        f"今日信息流（共{len(today_cards)}条）：\n"
        + "\n".join(f"- {s}" for s in card_summaries)
        + f"\n\n持仓概览：{json.dumps(position_summary, ensure_ascii=False)[:400]}\n"
        "请生成日报。"
    )

    try:
        text = _chat(system, user, max_tokens=500, temperature=0.5, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "sections" in result:
            return result
    except Exception as e:
        print(f"Chronicler daily report failed: {e}")

    return {
        "title": "今日市场概览",
        "sections": [
            {"heading": "今日要点", "content": "、".join(card_summaries[:3]) if card_summaries else "今日无重大关联事件"},
            {"heading": "持仓关联", "content": "请查看信息流了解详情"},
            {"heading": "明日关注", "content": "暂无已公布的关注日程"},
        ],
        "one_liner": f"今日共{len(today_cards)}条关联信息",
    }


# ---------------------------------------------------------------------------
# 周报/月报叙事增强
# ---------------------------------------------------------------------------

def narrate_period_report(
    report_stats: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    基于 report_service 的统计数据，生成叙事化复盘。

    返回：
    {
        "narrative": "2~3段文字的复盘叙事",
        "key_insight": "本期最核心的一条发现",
        "action_reflection": "值得复盘的行为模式"
    }
    """
    system = (
        "你是 KeeFoo 的复盘叙事引擎。\n"
        "基于用户的交易统计数据，生成一段有深度的复盘文字。\n\n"
        "写作原则：\n"
        "1. 不做裁判：不说'这笔操作是错的'，说'与过去同类情景下的决策存在差异'\n"
        "2. 不做马后炮：基于买入时的信息环境评价，不用结果倒推过程\n"
        "3. 数据驱动：每个观点都要有数据支撑\n"
        "4. 语气像一个资深导师在复盘，不是批评\n"
        "5. 不给投资建议\n\n"
        "请严格按以下 JSON 输出：\n"
        "{\n"
        '  "narrative": "2~3段复盘文字，总计不超过250字",\n'
        '  "key_insight": "本期最核心发现，不超过50字",\n'
        '  "action_reflection": "值得关注的行为模式，不超过80字"\n'
        "}"
    )

    user = f"本期交易统计：{json.dumps(report_stats, ensure_ascii=False)[:800]}\n请生成复盘叙事。"

    try:
        text = _chat(system, user, max_tokens=500, temperature=0.5, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "narrative" in result:
            return result
    except Exception as e:
        print(f"Chronicler narration failed: {e}")

    return {
        "narrative": "本期交易数据已汇总，请查看统计详情了解完整情况。",
        "key_insight": "数据积累中，更多洞察将在后续报告中呈现。",
        "action_reflection": "",
    }
