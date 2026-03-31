"""影子仓位情景推演（仅方向性描述，不含具体价格区间）。"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.models import models as m


def _neutral_payload(
    shadow_id: uuid.UUID,
    event_title: str,
    scenario_text: str,
) -> dict[str, Any]:
    return {
        "shadow_id": str(shadow_id),
        "event_title": event_title,
        "scenario_text": scenario_text,
        "direction": "neutral",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def generate_scenario_push(
    shadow_position: m.ShadowPosition,
    event: Optional[m.Event],
) -> dict[str, Any]:
    """
    为影子仓位生成情景推演推送内容（合规：不输出具体数字区间）。
    """
    shadow_id = shadow_position.id
    asset = shadow_position.asset
    asset_name = asset.name if asset else "该标的"
    atype = asset.asset_type if asset else m.AssetType.stock

    if event is None:
        return _neutral_payload(
            shadow_id,
            "—",
            "暂无可关联的公开事件推演，建议持续关注标的与板块动态，结合自身风险承受能力判断。",
        )

    title = event.title or ""
    summary = (event.summary or "") + title
    et = event.event_type

    # 降准 / 降息
    if any(k in summary for k in ("降准", "降息", "利率")):
        if atype in (m.AssetType.fund, m.AssetType.bond, m.AssetType.gold):
            text = (
                "货币政策边际宽松环境下，债券类与贵金属类资产在历史类似情境中通常更易呈现正向反应，"
                "成长股则相对中性，仅供方向性参考。"
            )
            return {
                "shadow_id": str(shadow_id),
                "event_title": title,
                "scenario_text": text,
                "direction": "positive",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        if atype in (m.AssetType.stock, m.AssetType.futures):
            text = (
                "货币政策边际宽松情境下，成长股在历史类似阶段往往反应分化，"
                "该类标的通常呈现中性偏正向的预期，不构成买卖建议。"
            )
            return {
                "shadow_id": str(shadow_id),
                "event_title": title,
                "scenario_text": text,
                "direction": "neutral",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

    # 财报超预期
    if et == m.EventType.earnings or any(k in summary for k in ("超预期", "财报", "净利", "营收")):
        text = (
            f"在{asset_name}相关业绩披露前后，市场往往围绕预期差重新定价，"
            "历史类似情境下通常对标的本身偏正向反应，仅供方向性参考。"
        )
        return {
            "shadow_id": str(shadow_id),
            "event_title": title,
            "scenario_text": text,
            "direction": "positive",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    # 高管变动
    if et == m.EventType.executive or any(k in summary for k in ("高管", "辞职", "离职")):
        text = (
            f"在{asset_name}治理层变动期间，不确定性往往上升，"
            "历史类似情境下通常对股价偏谨慎，整体偏负向至中性，仅供方向性参考。"
        )
        return {
            "shadow_id": str(shadow_id),
            "event_title": title,
            "scenario_text": text,
            "direction": "negative",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    # 行业政策利好
    if et in (m.EventType.policy, m.EventType.announcement) or any(
        k in summary for k in ("行业", "政策", "利好", "支持")
    ):
        text = (
            "在行业政策利好传导下，相关板块在历史类似情境中通常更易呈现正向反应，"
            "个股需结合基本面与估值，仅供方向性参考。"
        )
        return {
            "shadow_id": str(shadow_id),
            "event_title": title,
            "scenario_text": text,
            "direction": "positive",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    return _neutral_payload(
        shadow_id,
        title,
        "该类标的在历史类似情境下通常呈现分化反应，建议关注宏观与行业节奏，不构成投资建议。",
    )
