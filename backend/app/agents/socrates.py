"""
第四层 Agent：Socrates（苏格拉底追问）

职责：
- 交易录入后延迟 2~4 小时，发起苏格拉底式追问
- 拉取交易时刻的市场环境（第三层卡片），反向提问
- 解析用户回答 → 结构化 decision_note
- 用户沉默 → 沉默推断兜底

原则：
- 每笔交易最多追问一次
- 问题不超过 40 字
- 呈现为极简单选卡片 + 自由输入
- 不做事前拦截，只做事后记录
"""

from __future__ import annotations

import json
from typing import Any, Optional

from app.services.ai_service import _chat, _extract_json


# ---------------------------------------------------------------------------
# 追问生成
# ---------------------------------------------------------------------------

def generate_socratic_question(
    trade_info: dict[str, Any],
    market_snapshot: dict[str, Any],
    recent_cards: list[dict[str, Any]],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    基于交易和当时的市场环境，生成一个苏格拉底式追问。

    返回：
    {
        "question": "不超过40字的追问",
        "options": ["选项A", "选项B", "选项C"],  # 3 个单选项
        "question_type": "trigger|horizon|confidence|emotion"
    }
    """
    # 组装第三层卡片上下文（交易时刻的市场环境）
    cards_context = ""
    if recent_cards:
        card_summaries = []
        for c in recent_cards[:5]:
            card_data = c.get("card", {})
            headline = card_data.get("headline", c.get("event_title", ""))
            card_summaries.append(headline)
        cards_context = f"交易当日相关信息：{'、'.join(card_summaries)}"

    direction = "买入" if trade_info.get("direction") == "buy" else "卖出"

    system = (
        "你是 KeeFoo 的苏格拉底追问引擎。\n"
        "用户刚完成一笔交易，你的任务是在几小时后发起一个温和但精准的追问，\n"
        "帮助用户回忆和记录当时的决策逻辑。\n\n"
        "追问原则：\n"
        "1. 温和友好，不带审判感——这不是考试，是帮用户做记录\n"
        "2. 问题不超过 40 字\n"
        "3. 提供 3 个单选项 + 用户可自由输入\n"
        "4. 选项要覆盖最常见的决策逻辑类型\n"
        "5. 利用当日市场信息让问题更具体，而非泛泛的'你为什么买'\n"
        "6. 绝对不给投资建议\n\n"
        "question_type 说明：\n"
        "- trigger：追问触发原因（什么信息驱动了这笔交易）\n"
        "- horizon：追问持仓预期（打算拿多久）\n"
        "- confidence：追问确信度（多有把握）\n"
        "- emotion：追问情绪状态（做这笔交易时的心理状态）\n\n"
        "请严格按以下 JSON 输出：\n"
        "{\n"
        '  "question": "不超过40字",\n'
        '  "options": ["选项A", "选项B", "选项C"],\n'
        '  "question_type": "trigger|horizon|confidence|emotion"\n'
        "}"
    )

    user = (
        f"交易：{direction} {trade_info.get('asset_name', '')}，"
        f"价格 {trade_info.get('price', '')}，"
        f"时间 {trade_info.get('traded_at', '')}\n"
        f"市场背景：{json.dumps(market_snapshot, ensure_ascii=False)[:300]}\n"
        f"{cards_context}\n"
        "请生成一个苏格拉底式追问。"
    )

    try:
        text = _chat(system, user, max_tokens=250, temperature=0.7, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "question" in result:
            # 强制截断
            result["question"] = result["question"][:40]
            if "options" in result:
                result["options"] = [str(o)[:20] for o in result["options"][:3]]
            return result
    except Exception as e:
        print(f"Socrates question generation failed: {e}")

    # Fallback
    return {
        "question": f"这笔{trade_info.get('asset_name', '')}的{direction}，核心逻辑是什么？",
        "options": ["跟踪到利好消息", "技术面出现信号", "中长期看好基本面"],
        "question_type": "trigger",
    }


# ---------------------------------------------------------------------------
# 意图解析（轨道二）
# ---------------------------------------------------------------------------

def parse_decision_intent(
    user_reply: str,
    trade_info: dict[str, Any],
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """
    解析用户对追问的回答，提取结构化 decision_note。

    返回：
    {
        "decision_type": "event_driven|technical|fundamental|sentiment",
        "time_horizon": "intraday|short|medium|long",
        "confidence": "high|medium|low",
        "emotion_score": 1-10,
        "structured_note": "一句话总结"
    }
    """
    system = (
        "你是交易意图解析引擎。分析用户的交易逻辑描述，提取结构化信息。\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "decision_type": "event_driven|technical|fundamental|sentiment",\n'
        '  "time_horizon": "intraday|short|medium|long",\n'
        '  "confidence": "high|medium|low",\n'
        '  "emotion_score": 1-10的整数,\n'
        '  "structured_note": "一句话总结用户的交易逻辑"\n'
        "}\n\n"
        "判断规则：\n"
        "- 提到政策、消息、新闻 → event_driven\n"
        "- 提到均线、突破、技术指标 → technical\n"
        "- 提到财报、业绩、估值 → fundamental\n"
        "- 提到感觉、直觉、赌 → sentiment\n"
        "- 用词确定自信 → high，犹豫试探 → low\n"
        "- emotion_score: 1=极冷静 10=极激动"
    )

    user = (
        f"交易上下文：{json.dumps(trade_info, ensure_ascii=False)}\n"
        f"用户回复：{user_reply}\n"
        "请输出严格 JSON。"
    )

    try:
        text = _chat(system, user, max_tokens=200, temperature=0.3, model=model)
        result = _extract_json(text)
        if isinstance(result, dict) and "decision_type" in result:
            # 校正 emotion_score 范围
            es = result.get("emotion_score", 5)
            try:
                es = max(1, min(10, int(es)))
            except (TypeError, ValueError):
                es = 5
            result["emotion_score"] = es
            return result
    except Exception as e:
        print(f"Socrates intent parsing failed: {e}")

    # Fallback
    return {
        "decision_type": "fundamental",
        "time_horizon": "medium",
        "confidence": "medium",
        "emotion_score": 5,
        "structured_note": user_reply[:200],
    }


# ---------------------------------------------------------------------------
# 沉默推断（轨道三）
# ---------------------------------------------------------------------------

def infer_from_silence(
    trade_info: dict[str, Any],
    hours_since_trade: float,
) -> dict[str, Any]:
    """
    用户持续沉默时的兜底推断。
    不调用 LLM，纯规则推断。

    逻辑：
    - 沉默本身是数据：用户不愿回答可能暗示情绪化交易或低确信度
    - 结合交易方向和持仓时间做粗略推断
    """
    direction = trade_info.get("direction", "buy")

    # 沉默推断：确信度默认 low，情绪分偏高（沉默常与焦虑/犹豫相关）
    emotion = 6
    confidence = "low"
    decision_type = "sentiment"
    time_horizon = "short"

    # 如果交易金额较大（从 quantity * price 推断），情绪分更高
    try:
        amount = float(trade_info.get("price", 0)) * float(trade_info.get("quantity", 0))
        if amount > 100000:  # 10 万以上
            emotion = 7
    except (TypeError, ValueError):
        pass

    # 买入时沉默 vs 卖出时沉默的情绪差异
    if direction == "sell":
        emotion = min(emotion + 1, 10)  # 卖出沉默更可能焦虑

    return {
        "decision_type": decision_type,
        "time_horizon": time_horizon,
        "confidence": confidence,
        "emotion_score": emotion,
        "structured_note": f"用户未回复追问（{hours_since_trade:.0f}h），系统推断为低确信度交易",
        "source": "silence_inferred",
    }
