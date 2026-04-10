"""
第五层 Agent：Profiler（画像师）

职责：
- 基于 profile_service 的统计数据，生成叙事化策略画像
- 偏差诊断可视化描述
- 需要 30 天以上数据才有意义
"""

from __future__ import annotations

import json
from typing import Any

from app.services.ai_service import _chat, _extract_json


def generate_strategy_narrative(
    profile_stats: dict[str, Any],
    trade_count: int,
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    基于 profile_service 的统计数据，生成策略画像叙事。

    返回：
    {
        "style_label": "投资风格标签（如：消息驱动型中线投资者）",
        "strengths": ["优势特征1", "优势特征2"],
        "patterns_to_watch": ["需关注模式1", "需关注模式2"],
        "profile_summary": "3~4句话的画像总结"
    }
    """
    system = (
        "你是 KeeFoo 的策略画像引擎（Profiler）。\n"
        "基于用户的历史交易数据统计，生成一份个性化的投资策略画像。\n\n"
        "写作原则：\n"
        "1. style_label：一个准确的标签，格式如'XX驱动型 + 偏好周期 + 投资者'（如'消息驱动型中线投资者'）\n"
        "2. strengths：基于数据发现的正面模式，用具体数据说话\n"
        "3. patterns_to_watch：潜在的行为模式提醒（不是批评，是提醒）\n"
        "4. 不给投资建议，只描述行为特征\n"
        "5. 每条不超过40字\n\n"
        "请严格按以下 JSON 输出：\n"
        "{\n"
        '  "style_label": "投资风格标签",\n'
        '  "strengths": ["优势1", "优势2"],\n'
        '  "patterns_to_watch": ["模式1", "模式2"],\n'
        '  "profile_summary": "3~4句画像总结，不超过150字"\n'
        "}"
    )

    user = (
        f"基于 {trade_count} 笔历史交易的统计数据：\n"
        f"{json.dumps(profile_stats, ensure_ascii=False)[:1000]}\n"
        "请生成策略画像。"
    )

    try:
        text = _chat(system, user, max_tokens=400, temperature=0.5, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "style_label" in result:
            return result
    except Exception as e:
        print(f"Profiler narrative failed: {e}")

    return {
        "style_label": "数据积累中",
        "strengths": [],
        "patterns_to_watch": [],
        "profile_summary": f"基于当前 {trade_count} 笔交易数据，画像正在生成中。交易记录越多，画像越精准。",
    }


def narrate_bias_diagnosis(
    bias_scores: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    将偏差分数转化为可理解的叙事描述。

    返回：
    {
        "overall_assessment": "总体评估，不超过60字",
        "bias_details": [
            {"name": "处置效应", "score": 45, "description": "..."},
            ...
        ],
        "suggestion": "改善方向提示（不是投资建议，是行为建议）"
    }
    """
    system = (
        "你是 KeeFoo 的行为偏差诊断引擎。\n"
        "基于量化的偏差分数（0~100，越高偏差越明显），生成可理解的诊断描述。\n\n"
        "原则：\n"
        "1. 客观描述行为模式，不做道德判断\n"
        "2. suggestion 是行为改善方向（如'可尝试记录止损价'），不是投资建议\n"
        "3. 分数 <30 基本正常，30~60 需关注，>60 明显偏差\n\n"
        "请严格按以下 JSON 输出：\n"
        "{\n"
        '  "overall_assessment": "总体评估，不超过60字",\n'
        '  "bias_details": [\n'
        '    {"name": "偏差名称", "score": 分数, "description": "不超过40字"}\n'
        "  ],\n"
        '  "suggestion": "不超过60字的行为改善方向"\n'
        "}"
    )

    user = f"偏差分数：{json.dumps(bias_scores, ensure_ascii=False)}\n请生成诊断叙事。"

    try:
        text = _chat(system, user, max_tokens=400, temperature=0.4, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "bias_details" in result:
            return result
    except Exception as e:
        print(f"Profiler bias narration failed: {e}")

    return {
        "overall_assessment": "偏差诊断数据已生成，详见各项分数。",
        "bias_details": [
            {"name": k.replace("_score", ""), "score": v, "description": ""}
            for k, v in bias_scores.items()
            if k.endswith("_score") and isinstance(v, (int, float))
        ],
        "suggestion": "",
    }
