"""DeepSeek AI service (OpenAI-compatible) with safe fallbacks."""

from __future__ import annotations

import json
from typing import Any, Optional

from app.core.config import get_settings


def _confidence_to_score(confidence: str) -> int:
    return {"high": 8, "medium": 5, "low": 3}.get((confidence or "").strip().lower(), 5)


def _client(model: str = "deepseek-chat"):
    settings = get_settings()
    
    # 判定是否使用 Claude (Anthropic)
    if "claude" in model.lower():
        if not getattr(settings, "CLAUDE_API_KEY", ""):
            raise RuntimeError("CLAUDE_API_KEY not set")
        from anthropic import Anthropic
        return Anthropic(api_key=settings.CLAUDE_API_KEY)

    # 默认 DeepSeek (OpenAI-compatible)
    if not getattr(settings, "DEEPSEEK_API_KEY", ""):
        raise RuntimeError("DEEPSEEK_API_KEY not set")
    from openai import OpenAI  # type: ignore
    return OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")


def _chat(system: str, user: str, *, max_tokens: int, temperature: float, model: str = "deepseek-chat") -> str:
    client = _client(model)
    
    if "claude" in model.lower():
        # Anthropic SDK 格式
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user}]
        )
        return str(resp.content[0].text).strip()
    else:
        # OpenAI SDK 格式
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()


def generate_smart_question(trade_info: dict, market_context: dict) -> str:
    """
    DeepSeek 生成苏格拉底式追问（L3 逻辑审判）。
    基于市场背景、标的特性和交易行为，寻找逻辑上的「弱点」或「矛盾点」进行提问。
    """

    system = (
        "你是 KeeFoo 投资复盘系统的核心 Agent —— 一个冷峻、深邃、具有苏格拉底风格的投资导师。\n"
        "你的任务是针对用户的交易行为进行「逻辑审判」。你不需要给出建议，而是通过一个精准的问题，揭示用户决策中可能的盲点、情绪化或逻辑不自洽。\n\n"
        "提问原则：\n"
        "1. **直击痛点**：如果用户在利好出尽时买入，问他关于「预期兑现」的问题；如果在技术破位时买入，问他关于「安全边际」的问题。\n"
        "2. **寻找矛盾**：对比交易行为与市场大环境。例如：大盘暴跌时逆势重仓，是基于极度自信的逻辑，还是单纯的抄底冲动？\n"
        "3. **拒绝平庸**：不要问「你为什么买」这种宽泛问题。要问「在XX事件发生且股价已反应XX的情况下，你这笔交易锚定的确定性究竟来自哪里？」\n"
        "4. **合规边界**：严禁提供任何投资建议，严禁预测涨跌。你的角色是提问者，不是分析师。\n\n"
        "约束：\n"
        "- 问题字数严格控制在 50 字以内。\n"
        "- 语气：专业、中立、略带挑战性。\n"
        "- 只输出问题本身，不要有任何前缀、后缀或多余解释。"
    )
    
    # 构造更丰富的上下文
    asset_name = trade_info.get('asset_name', '该标的')
    price = trade_info.get('price', '未知')
    direction = "买入" if trade_info.get('direction') == "buy" else "卖出"
    
    user_prompt = (
        f"交易行为：在价格 {price} 元时{direction}了 {asset_name}。\n"
        f"市场背景：{json.dumps(market_context, ensure_ascii=False)}\n"
        "请基于以上信息，生成一个能够引发用户深度反思逻辑漏洞的 L3 级苏格拉底追问。"
    )
    
    try:
        return _chat(system, user_prompt, max_tokens=150, temperature=0.8)
    except Exception as e:
        print(f"L3 AI Question Generation failed: {e}")
        return f"这笔 {asset_name} 的交易，你当时最核心的决策锚点是什么？"


def _extract_json(text: str) -> Optional[dict[str, Any]]:
    s = (text or "").strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        # try to salvage fenced JSON
        if "```" in s:
            parts = s.split("```")
            for p in parts:
                p2 = p.strip()
                if p2.startswith("{") and p2.endswith("}"):
                    try:
                        return json.loads(p2)
                    except Exception:
                        continue
        # try substring from first { to last }
        i, j = s.find("{"), s.rfind("}")
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(s[i : j + 1])
            except Exception:
                return None
        return None


def parse_reply_with_ai(reply_text: str, trade_context: dict) -> dict:
    """
    DeepSeek 解析用户回复（失败时由调用方 fallback 到关键词匹配）。
    返回字段兼容现有 parse_user_reply 的核心用途。
    """

    system = (
        "你是金融交易意图解析引擎。分析用户的交易逻辑描述，提取结构化信息。\n\n"
        "请严格按以下 JSON 格式输出，不要有其他内容：\n"
        "{\n"
        '  "decision_type": "event_driven | technical | fundamental | sentiment",\n'
        '  "time_horizon": "intraday | short | medium | long",\n'
        '  "confidence": "high | medium | low",\n'
        '  "emotion_score": 1-10的整数,\n'
        '  "structured_note": "一句话总结用户的交易逻辑"\n'
        "}\n\n"
        "判断规则：\n"
        "- 提到政策、消息、新闻、利好利空 → event_driven\n"
        "- 提到均线、突破、技术指标、形态 → technical\n"
        "- 提到财报、业绩、估值、分红 → fundamental\n"
        "- 提到感觉、直觉、赌、试试 → sentiment\n"
        "- 提到长期、价值、持有 → time_horizon=long\n"
        "- 提到短线、做T、明天 → time_horizon=short\n"
        "- 用词确定自信 → confidence=high，犹豫试探 → confidence=low\n"
        "- emotion_score: 1=极冷静 10=极激动"
    )
    user = f"交易上下文：{trade_context}\n用户回复：{reply_text}\n请输出严格 JSON。"
    text = _chat(system, user, max_tokens=200, temperature=0.3)
    obj = _extract_json(text)
    if not isinstance(obj, dict):
        raise RuntimeError("DeepSeek returned non-JSON")

    decision_type = str(obj.get("decision_type") or "fundamental").strip()
    time_horizon = str(obj.get("time_horizon") or "medium").strip()
    confidence = str(obj.get("confidence") or "medium").strip()
    emotion_score = obj.get("emotion_score")
    try:
        emotion_score_i = int(emotion_score)
    except Exception:
        emotion_score_i = 5
    emotion_score_i = max(1, min(10, emotion_score_i))
    structured_note = str(obj.get("structured_note") or "").strip()
    if not structured_note:
        structured_note = reply_text.strip()[:200]

    return {
        "decision_type": decision_type,
        "time_horizon": time_horizon,
        "confidence": confidence,
        "emotion_score": emotion_score_i,
        "structured_note": structured_note,
        "confidence_score": _confidence_to_score(confidence),
    }


def generate_report_commentary(report_data: dict) -> str:
    """DeepSeek 生成复盘点评（失败时由调用方 fallback 到模板 ai_commentary）。"""

    system = (
        "你是 KeeFoo 投资复盘系统的分析师。基于用户的交易数据生成客观的复盘点评。\n\n"
        "规则：\n"
        "1. 不做裁判：不说'这笔操作是错的'，只说'与你过去同类情景下的决策存在差异'\n"
        "2. 不做马后炮：基于买入时的信息环境评价，不用结果倒推过程\n"
        "3. 区分数据源可信度：user_input 权重最高，agent_parsed 次之，silence_inferred 仅参考\n"
        "4. 语气专业但友好，像一个资深导师\n"
        "5. 不给任何投资建议\n"
        "6. 输出 2-3 段文字，总计不超过 300 字"
    )
    user = f"报告数据：{report_data}"
    return _chat(system, user, max_tokens=500, temperature=0.5)


def generate_scenario(asset_info: dict, event_info: dict) -> dict:
    """
    DeepSeek 生成情景推演（合规：不含数字区间）。
    返回：{"scenario_text": "...", "direction": "positive|negative|neutral"}
    """

    system = (
        "你是金融情景分析引擎。基于历史事件对标的的影响，生成方向性情景推演。\n\n"
        "合规红线：绝对不能输出具体数字区间或百分比。只能给方向性判断（正向/负向/中性）。\n\n"
        "请严格按以下 JSON 格式输出：\n"
        "{\n"
        '  "scenario_text": "不超过50字的情景推演描述",\n'
        '  "direction": "positive | negative | neutral"\n'
        "}"
    )
    user = f"标的信息：{asset_info}\n事件信息：{event_info}\n请输出严格 JSON。"
    text = _chat(system, user, max_tokens=150, temperature=0.5)
    obj = _extract_json(text)
    if not isinstance(obj, dict):
        raise RuntimeError("DeepSeek returned non-JSON")
    scenario_text = str(obj.get("scenario_text") or "").strip()
    direction = str(obj.get("direction") or "neutral").strip()
    if not scenario_text:
        scenario_text = "历史类似情境下反应可能分化，建议持续跟踪信息变化，仅供方向性参考。"
    if direction not in ("positive", "negative", "neutral"):
        direction = "neutral"
    return {"scenario_text": scenario_text[:60], "direction": direction}
