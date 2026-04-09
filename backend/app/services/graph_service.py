"""知识图谱节点与边（MVP：PostgreSQL/SQLite 聚合，后续可迁 Neo4j）。"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models import models as m


def _parse_uid(user_id: str | uuid.UUID) -> uuid.UUID:
    return user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))


def get_knowledge_graph(user_id: str | uuid.UUID, db: Session) -> dict[str, Any]:
    uid = _parse_uid(user_id)
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_node(nid: str, payload: dict[str, Any]) -> None:
        if nid not in seen:
            seen.add(nid)
            nodes.append({"id": nid, **payload})

    trades = (
        db.query(m.Trade)
        .options(joinedload(m.Trade.asset))
        .filter(m.Trade.user_id == uid)
        .all()
    )
    shadows = (
        db.query(m.ShadowPosition)
        .options(joinedload(m.ShadowPosition.asset))
        .filter(m.ShadowPosition.user_id == uid)
        .all()
    )

    asset_ids: set[uuid.UUID] = set()
    for t in trades:
        asset_ids.add(t.asset_id)
    for sp in shadows:
        asset_ids.add(sp.asset_id)

    for aid in asset_ids:
        a = db.query(m.Asset).filter(m.Asset.id == aid).first()
        if not a:
            continue
        add_node(
            f"asset_{a.id}",
            {
                "type": "asset",
                "label": a.name,
                "code": a.code,
            },
        )

    for t in trades:
        tid = f"trade_{t.id}"
        dir_zh = "买入" if t.direction == m.TradeDirection.buy else "卖出"
        add_node(
            tid,
            {
                "type": "trade",
                "label": f"{dir_zh} {t.price}×{t.quantity}",
                "direction": t.direction.value,
            },
        )
        edges.append(
            {
                "source": tid,
                "target": f"asset_{t.asset_id}",
                "type": "INVOLVES",
            }
        )

    if asset_ids:
        links = (
            db.query(m.EventAssetLink)
            .filter(m.EventAssetLink.asset_id.in_(asset_ids))
            .all()
        )
        eids = {lk.event_id for lk in links}
        events = db.query(m.Event).filter(m.Event.id.in_(eids)).all() if eids else []
        for ev in events:
            add_node(
                f"event_{ev.id}",
                {
                    "type": "event",
                    "label": ev.title[:120] if ev.title else "事件",
                    "impact": ev.impact_level.value,
                },
            )
        events_map = {ev.id: ev for ev in events}
        for lk in links:
            eid_raw = lk.event_id
            aid = f"asset_{lk.asset_id}"
            eid = f"event_{eid_raw}"
            ev = events_map.get(eid_raw)
            edges.append({
                "source": eid,
                "target": aid,
                "type": "AFFECTS",
                "impact": ev.impact_level.value if ev else "medium"
            })

    for sp in shadows:
        a = sp.asset
        st = "观望" if sp.shadow_type == m.ShadowType.watchlist else "错过"
        name = a.name if a else "标的"
        sid = f"shadow_{sp.id}"
        add_node(
            sid,
            {
                "type": "shadow",
                "label": f"{name}({st})",
                "shadow_type": sp.shadow_type.value,
            },
        )
        edges.append(
            {
                "source": sid,
                "target": f"asset_{sp.asset_id}",
                "type": "TRACKS",
            }
        )

    valid = {n["id"] for n in nodes}
    edges = [e for e in edges if e["source"] in valid and e["target"] in valid]

    return {"nodes": nodes, "edges": edges}
