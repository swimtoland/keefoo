"""复盘报告生成（MVP：规则与模板）。"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models import models as m


def _parse_uid(user_id: str | uuid.UUID) -> uuid.UUID:
    return user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))


def _period_window(period: str, end: datetime) -> tuple[datetime, datetime]:
    end = end.astimezone(timezone.utc)
    if period == "weekly":
        start = end - timedelta(days=7)
    elif period == "monthly":
        start = end - timedelta(days=30)
    elif period == "quarterly":
        start = end - timedelta(days=90)
    else:
        start = end - timedelta(days=30)
    return start, end


def _pnl_val(t: m.Trade) -> float:
    return float(t.pnl) if t.pnl is not None else 0.0


def generate_report(user_id: str | uuid.UUID, period: str, db: Session) -> dict[str, Any]:
    """
    生成复盘报告（基于该时间段内 status=closed 的交易，按 traded_at 落入窗口）。
    """
    uid = _parse_uid(user_id)
    now = datetime.now(timezone.utc)
    start, end = _period_window(period, now)

    closed = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(
            m.Trade.user_id == uid,
            m.Trade.status == m.TradeStatus.closed,
            m.Trade.traded_at >= start,
            m.Trade.traded_at <= end,
        )
        .all()
    )

    if not closed:
        return {
            "message": "该时间段暂无已完成的交易数据",
            "has_data": False,
            "period": period,
            "generated_at": now.isoformat(),
        }

    total_trades = len(closed)
    pnls = [_pnl_val(t) for t in closed]
    winning = [t for t in closed if _pnl_val(t) > 0]
    losing = [t for t in closed if _pnl_val(t) < 0]
    flat = [t for t in closed if _pnl_val(t) == 0]

    winning_trades = len(winning)
    losing_trades = len(losing)
    win_rate = (winning_trades / total_trades * 100.0) if total_trades else 0.0
    total_pnl = sum(pnls)

    best = max(closed, key=_pnl_val)
    worst = min(closed, key=_pnl_val)

    best_trade = {
        "asset_name": best.asset.name if best.asset else "—",
        "pnl": _pnl_val(best),
        "holding_days": best.holding_days or 0,
        "trade_id": str(best.id),
    }
    worst_trade = {
        "asset_name": worst.asset.name if worst.asset else "—",
        "pnl": _pnl_val(worst),
        "holding_days": worst.holding_days or 0,
        "trade_id": str(worst.id),
    }

    hd = [t.holding_days for t in closed if t.holding_days is not None]
    avg_holding_days = sum(hd) / len(hd) if hd else 0.0

    emo = [t.emotion_score for t in closed if t.emotion_score is not None]
    avg_emotion_score = sum(emo) / len(emo) if emo else None

    conf = [t.confidence_score for t in closed if t.confidence_score is not None]
    avg_confidence_score = sum(conf) / len(conf) if conf else None

    with_note = sum(1 for t in closed if (t.decision_note or "").strip())
    note_coverage = with_note / total_trades * 100.0 if total_trades else 0.0

    src_counts: dict[str, int] = {}
    for t in closed:
        key = t.note_source.value if t.note_source else "none"
        src_counts[key] = src_counts.get(key, 0) + 1
    note_source_distribution: dict[str, float] = {}
    for k, v in src_counts.items():
        note_source_distribution[k] = round(v / total_trades * 100.0, 1)

    avg_loss_hd = (
        sum(t.holding_days or 0 for t in losing) / len(losing) if losing else 0.0
    )
    avg_win_hd = (
        sum(t.holding_days or 0 for t in winning) / len(winning) if winning else 0.0
    )
    disposition_effect = None
    if losing and winning and avg_win_hd > 0 and avg_loss_hd > 2 * avg_win_hd:
        disposition_effect = "存在处置效应倾向"
    elif losing and winning:
        disposition_effect = "暂未观察到明显处置效应"

    days_span = max((end - start).days, 1)
    months = max(days_span / 30.0, 1 / 30.0)
    monthly_rate = total_trades / months
    overtrading = "月均交易超过20笔" if monthly_rate > 20 else None

    high_emo = [t for t in closed if t.emotion_score is not None and t.emotion_score >= 8]
    emotional_trading = None
    if high_emo:
        hw = sum(1 for t in high_emo if _pnl_val(t) > 0)
        hr = hw / len(high_emo) * 100.0
        if win_rate - hr >= 15.0:
            emotional_trading = "高情绪分交易的胜率显著低于整体水平，需留意情绪化决策"

    summary = {
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "flat_trades": len(flat),
        "win_rate": round(win_rate, 2),
        "total_pnl": round(total_pnl, 2),
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "avg_holding_days": round(avg_holding_days, 2),
    }

    behavior = {
        "avg_emotion_score": round(avg_emotion_score, 2) if avg_emotion_score is not None else None,
        "avg_confidence_score": round(avg_confidence_score, 2)
        if avg_confidence_score is not None
        else None,
        "note_coverage": round(note_coverage, 2),
        "note_source_distribution": note_source_distribution,
    }

    biases = {
        "disposition_effect": disposition_effect,
        "overtrading": overtrading,
        "emotional_trading": emotional_trading,
    }

    style = "偏长线" if avg_holding_days >= 20 else "偏短线" if avg_holding_days <= 7 else "均衡"
    ai_commentary = [
        (
            f"本期共完成{total_trades}笔已平仓交易，胜率约{win_rate:.1f}%。"
            f"你在{best_trade['asset_name']}上的单笔表现最佳，持仓约{best_trade['holding_days']}天，"
            f"实现盈亏约{best_trade['pnl']:.0f}元。"
        ),
        (
            f"数据显示平均持仓周期约{avg_holding_days:.1f}天，整体偏{style}风格。"
            f"记录覆盖率约{note_coverage:.0f}%，建议持续用笔记区分主观叙述与系统解析（agent_parsed）的可信度。"
        ),
    ]
    if emotional_trading:
        ai_commentary.append(emotional_trading)
    elif disposition_effect and "存在" in disposition_effect:
        ai_commentary.append(
            "亏损单的持仓时间显著长于盈利单时，往往与「卖盈持亏」的心理惯性有关，可适当复盘止损纪律。"
        )

    return {
        "has_data": True,
        "period": period,
        "generated_at": now.isoformat(),
        "summary": summary,
        "behavior": behavior,
        "biases": biases,
        "ai_commentary": ai_commentary,
        "message": None,
    }
