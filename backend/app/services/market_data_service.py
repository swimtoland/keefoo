"""AKShare market data service (best-effort, cached, no API key required)."""

from __future__ import annotations

import random
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from app.core.config import get_settings
from app.services import tushare_service

_cache: dict[str, dict[str, Any]] = {}
_executor = ThreadPoolExecutor(max_workers=4)


def _run_with_timeout(fetch_fn: Callable[[], Any], timeout_seconds: float) -> Any:
    fut = _executor.submit(fetch_fn)
    return fut.result(timeout=timeout_seconds)


def cached(key: str, ttl_seconds: int, fetch_fn: Callable[[], Any], *, max_wait_seconds: float = 8.0):
    """简易缓存：key 存在且未过期则返回缓存，否则调用 fetch_fn 获取新数据。"""
    now = time.time()
    if key in _cache and now - float(_cache[key]["time"]) < ttl_seconds:
        return _cache[key]["data"]
    try:
        data = _run_with_timeout(fetch_fn, max_wait_seconds)
        _cache[key] = {"data": data, "time": now}
        return data
    except FutureTimeout:
        print(f"AKShare timeout for {key} (> {max_wait_seconds}s)")
        if key in _cache:
            return _cache[key]["data"]
        return None
    except Exception as e:
        print(f"AKShare error for {key}: {e}")
        if key in _cache:
            return _cache[key]["data"]
        return None


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, str):
            s = v.strip().replace("%", "").replace(",", "")
            if s in ("", "-", "—", "None", "nan", "NaN"):
                return None
            return float(s)
        return float(v)
    except Exception:
        return None


def _pick(row: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return None


_INDEX_EN = {
    "000001": "SSE Composite",
    "399001": "SZSE Component",
    "000300": "CSI 300",
    "399006": "ChiNext",
    "000688": "STAR 50",
    "000016": "SSE 50",
    "000905": "CSI 500",
    "000852": "CSI 1000",
}

_INDEX_NAME_ZH = {
    "000001": "上证指数",
    "399001": "深证成指",
    "000300": "沪深300",
    "399006": "创业板指",
    "000688": "科创50",
    "000016": "上证50",
    "000905": "中证500",
    "000852": "中证1000",
}


def _seeded_rng(key: str) -> random.Random:
    day_key = datetime.now(timezone.utc).strftime("%Y%m%d")
    seed = sum(ord(ch) for ch in f"{key}:{day_key}")
    return random.Random(seed)


def _fallback_indices() -> list[dict]:
    base = {
        "000001": 3050.0,
        "399001": 9550.0,
        "000300": 3580.0,
        "399006": 1950.0,
        "000688": 780.0,
        "000016": 2450.0,
        "000905": 5550.0,
        "000852": 6000.0,
    }
    out: list[dict] = []
    for code in _INDEX_NAME_ZH:
        rng = _seeded_rng(f"idx:{code}")
        change = round(rng.uniform(-1.8, 1.8), 2)
        price = round(base.get(code, 1000.0) * (1 + change / 100), 2)
        out.append(
            {
                "name": _INDEX_NAME_ZH[code],
                "name_en": _INDEX_EN.get(code, ""),
                "code": code,
                "price": price,
                "change_pct": change,
            }
        )
    return out


def _fallback_stock_realtime(symbol: str) -> dict:
    rng = _seeded_rng(f"stock:{symbol}")
    price = round(8 + rng.random() * 320, 2)
    change_pct = round(rng.uniform(-9.8, 9.8), 2)
    volume = float(int((2e6 + rng.random() * 18e6)))
    turnover = round(rng.uniform(0.3, 8.5), 2)
    pe = round(rng.uniform(8, 48), 2)
    market_cap = float(int((200e8 + rng.random() * 4000e8)))
    return {
        "code": symbol,
        "name": f"模拟标的 {symbol}",
        "price": price,
        "change_pct": change_pct,
        "volume": volume,
        "turnover_rate": turnover,
        "pe": pe,
        "market_cap": market_cap,
    }


def _fallback_fund_realtime(symbol: str) -> dict:
    rng = _seeded_rng(f"fund:{symbol}")
    nav = round(0.8 + rng.random() * 3.2, 4)
    change_pct = round(rng.uniform(-3.0, 3.0), 2)
    return {"code": symbol, "name": f"模拟基金 {symbol}", "nav": nav, "change_pct": change_pct}


def _fallback_stock_kline(symbol: str, period: str, count: int) -> list[dict]:
    rng = _seeded_rng(f"kline:{symbol}:{period}:{count}")
    step = timedelta(days=1 if period == "daily" else (7 if period == "weekly" else 30))
    cursor = datetime.now(timezone.utc) - step * (count - 1)
    close = 20 + rng.random() * 180
    out: list[dict] = []
    for _ in range(count):
        drift = rng.uniform(-0.03, 0.03)
        open_ = close
        close = max(0.5, open_ * (1 + drift))
        high = max(open_, close) * (1 + rng.uniform(0.0, 0.02))
        low = min(open_, close) * (1 - rng.uniform(0.0, 0.02))
        volume = float(int(1e6 + rng.random() * 2e7))
        out.append(
            {
                "date": cursor.strftime("%Y-%m-%d"),
                "open": round(open_, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2),
                "volume": volume,
            }
        )
        cursor += step
    return out


def _fallback_news(count: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    topics = ["宏观流动性", "新能源产业链", "半导体景气度", "消费修复", "医药创新", "AI 算力"]
    out: list[dict] = []
    for i in range(count):
        topic = topics[i % len(topics)]
        publish_at = (now - timedelta(minutes=35 * i)).strftime("%Y-%m-%d %H:%M:%S")
        out.append(
            {
                "title": f"{topic}跟踪：市场关注度上升（模拟）",
                "summary": f"该快讯为离线兜底数据，用于网络受限时保持页面可用。主题：{topic}。",
                "source": "KeeFoo Fallback",
                "publish_time": publish_at,
                "url": "",
            }
        )
    return out


def _fallback_stock_info(symbol: str) -> dict:
    rng = _seeded_rng(f"info:{symbol}")
    sectors = ["白酒", "新能源", "半导体", "券商", "医药", "消费", "AI"]
    return {
        "code": symbol,
        "name": f"模拟标的 {symbol}",
        "sector": sectors[int(rng.random() * len(sectors)) % len(sectors)],
        "market": "sh",
        "market_cap": float(int((300e8 + rng.random() * 3000e8))),
        "pe": round(rng.uniform(8, 55), 2),
        "pb": round(rng.uniform(0.8, 8.0), 2),
        "total_shares": float(int((5e8 + rng.random() * 120e8))),
        "float_shares": float(int((2e8 + rng.random() * 100e8))),
        "revenue": float(int((30e8 + rng.random() * 2000e8))),
        "net_profit": float(int((2e8 + rng.random() * 300e8))),
    }


def get_market_indices() -> list[dict]:
    """
    获取主要大盘指数的实时数据（best-effort）。

    失败时返回空列表（不抛异常）。
    缓存 60 秒（默认，可通过 AKSHARE_CACHE_TTL 调整）。
    """

    settings = get_settings()
    ttl = int(getattr(settings, "AKSHARE_CACHE_TTL", 60) or 60)

    def _fetch():
        import akshare as ak  # type: ignore

        df = ak.stock_zh_index_spot_em()
        rows = df.to_dict(orient="records")
        want = set(_INDEX_NAME_ZH.keys())
        out: list[dict] = []
        for r in rows:
            code = str(_pick(r, "代码", "code", "symbol") or "").strip()
            if code not in want:
                continue
            name = str(_pick(r, "名称", "name") or _INDEX_NAME_ZH.get(code, code))
            price = _to_float(_pick(r, "最新价", "最新", "price", "现价"))
            chg = _to_float(_pick(r, "涨跌幅", "涨跌幅(%)", "change_pct", "涨跌幅%"))
            if price is None and chg is None:
                continue
            out.append(
                {
                    "name": _INDEX_NAME_ZH.get(code, name),
                    "name_en": _INDEX_EN.get(code, ""),
                    "code": code,
                    "price": float(price or 0.0),
                    "change_pct": float(chg or 0.0),
                }
            )
        return out

    data = cached("indices", ttl, _fetch, max_wait_seconds=8.0)
    return data or _fallback_indices()


def get_stock_realtime(code: str) -> dict:
    """
    获取单只股票实时行情（best-effort）。

    缓存 30 秒；失败时返回空 dict。
    """

    symbol = str(code).strip()
    if not symbol:
        return {}

    def _fetch():
        import akshare as ak  # type: ignore

        df = ak.stock_zh_a_spot_em()
        rows = df.to_dict(orient="records")
        hit = None
        for r in rows:
            c = str(_pick(r, "代码", "code", "symbol") or "").strip()
            if c == symbol:
                hit = r
                break
        if not hit:
            return {}
        name = str(_pick(hit, "名称", "name") or "")
        price = _to_float(_pick(hit, "最新价", "最新", "price", "现价")) or 0.0
        change_pct = _to_float(_pick(hit, "涨跌幅", "涨跌幅(%)", "change_pct")) or 0.0
        volume = _to_float(_pick(hit, "成交量", "volume")) or 0.0
        turnover_rate = _to_float(_pick(hit, "换手率", "turnover_rate")) or 0.0
        pe = _to_float(_pick(hit, "市盈率-动态", "市盈率", "pe")) or 0.0
        market_cap = _to_float(_pick(hit, "总市值", "总市值(元)", "market_cap")) or 0.0
        # akshare 市值字段可能是元；这里按“亿”为单位更常见，但不强行换算，交给前端展示。
        return {
            "code": symbol,
            "name": name,
            "price": float(price),
            "change_pct": float(change_pct),
            "volume": float(volume),
            "turnover_rate": float(turnover_rate),
            "pe": float(pe),
            "market_cap": float(market_cap),
        }

    data = cached(f"stock:{symbol}", 30, _fetch, max_wait_seconds=6.0)
    return data or _fallback_stock_realtime(symbol)


def get_fund_realtime(code: str) -> dict:
    """
    获取基金实时/最新净值（best-effort）。

    缓存 60 秒；失败时返回空 dict。
    """

    symbol = str(code).strip()
    if not symbol:
        return {}

    def _fetch():
        import akshare as ak  # type: ignore

        df = ak.fund_open_fund_info_em(symbol=symbol, indicator="单位净值走势")
        rows = df.to_dict(orient="records")
        if not rows:
            return {}
        last = rows[-1]
        nav = _to_float(_pick(last, "单位净值", "nav", "净值")) or 0.0
        chg_raw = _pick(last, "日增长率", "change_pct", "涨跌幅")
        change_pct = _to_float(chg_raw) or 0.0
        return {
            "code": symbol,
            "name": "",
            "nav": float(nav),
            "change_pct": float(change_pct),
        }

    data = cached(f"fund:{symbol}", 60, _fetch, max_wait_seconds=8.0)
    return data or _fallback_fund_realtime(symbol)


def get_stock_kline(code: str, period: str = "daily", count: int = 120) -> list[dict]:
    """
    获取股票 K 线数据（best-effort）。

    缓存 5 分钟；失败时返回空列表。
    """

    symbol = str(code).strip()
    if not symbol:
        return []
    p = (period or "daily").strip().lower()
    if p not in ("daily", "weekly", "monthly"):
        p = "daily"
    n = int(count or 120)
    n = max(1, min(n, 2000))

    def _fetch():
        # 1. 优先尝试 Tushare
        # 根据 count 计算大概的开始日期
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=n * 1.5 + 10)
        start_str = start_dt.strftime("%Y%m%d")
        end_str = end_dt.strftime("%Y%m%d")
        
        ts_data = tushare_service.get_daily_stock_kline(symbol, start_str, end_str)
        if ts_data:
            return ts_data[-n:]

        # 2. Fallback 到 AKShare
        try:
            import akshare as ak  # type: ignore

            df = ak.stock_zh_a_hist(symbol=symbol, period=p, adjust="qfq")
            rows = df.to_dict(orient="records")
            if not rows:
                return []
            tail = rows[-n:]
            out: list[dict] = []
            for r in tail:
                d = _pick(r, "日期", "date")
                open_ = _to_float(_pick(r, "开盘", "open")) or 0.0
                high = _to_float(_pick(r, "最高", "high")) or 0.0
                low = _to_float(_pick(r, "最低", "low")) or 0.0
                close = _to_float(_pick(r, "收盘", "close")) or 0.0
                vol = _to_float(_pick(r, "成交量", "volume")) or 0.0
                out.append(
                    {
                        "date": str(d),
                        "open": float(open_),
                        "high": float(high),
                        "low": float(low),
                        "close": float(close),
                        "volume": float(vol),
                    }
                )
            return out
        except Exception as e:
            print(f"AKShare error for {symbol} kline: {e}")
            return []

    data = cached(f"kline:{symbol}:{p}:{n}", 300, _fetch, max_wait_seconds=10.0)
    return data or _fallback_stock_kline(symbol, p, n)


def get_financial_news(count: int = 20) -> list[dict]:
    """
    获取最新财经新闻（best-effort，多接口兜底）。

    缓存 5 分钟；失败时返回空列表。
    """

    n = int(count or 20)
    n = max(1, min(n, 100))

    def _fetch():
        import akshare as ak  # type: ignore

        errors: list[str] = []
        candidates = []

        try:
            df = ak.stock_news_em(symbol="")
            candidates = df.to_dict(orient="records")
        except Exception as e:
            errors.append(f"stock_news_em: {e}")

        if not candidates:
            try:
                df = ak.news_cctv()
                candidates = df.to_dict(orient="records")
            except Exception as e:
                errors.append(f"news_cctv: {e}")

        if not candidates:
            raise RuntimeError("all news sources failed: " + " | ".join(errors))

        out: list[dict] = []
        for r in candidates[:n]:
            title = str(_pick(r, "标题", "title") or "").strip()
            if not title:
                continue
            out.append(
                {
                    "title": title,
                    "summary": str(_pick(r, "内容", "摘要", "summary") or "")[:300],
                    "source": str(_pick(r, "来源", "source") or ""),
                    "publish_time": str(_pick(r, "发布时间", "时间", "publish_time") or ""),
                    "url": str(_pick(r, "链接", "url") or ""),
                }
            )
        return out

    data = cached(f"news:{n}", 300, _fetch, max_wait_seconds=8.0)
    return data or _fallback_news(n)


def get_stock_info(code: str) -> dict:
    """
    获取上市公司基本面信息（best-effort）。

    缓存 1 小时；失败时返回空 dict。
    """

    symbol = str(code).strip()
    if not symbol:
        return {}

    def _fetch():
        # 1. 优先尝试 Tushare
        ts_info = tushare_service.get_stock_basic_info(symbol)
        
        # 2. 使用 AKShare 补充或作为 Fallback
        import akshare as ak  # type: ignore

        df = ak.stock_individual_info_em(symbol=symbol)
        rows = df.to_dict(orient="records")
        # 常见结构：{"item": "...", "value": "..."} 或中文列名
        kv: dict[str, Any] = {}
        for r in rows:
            k = str(_pick(r, "item", "项目", "指标") or "").strip()
            v = _pick(r, "value", "值", "数据")
            if k:
                kv[k] = v

        name = str(kv.get("股票简称") or kv.get("名称") or "")
        sector = str(kv.get("行业") or kv.get("所属行业") or "")
        market = str(kv.get("市场") or kv.get("上市市场") or "")

        def pick_num(*ks: str) -> Optional[float]:
            for k in ks:
                if k in kv:
                    v = _to_float(kv.get(k))
                    if v is not None:
                        return v
            return None

        return {
            "code": symbol,
            "name": name,
            "sector": sector,
            "market": market.lower() if market else "",
            "market_cap": pick_num("总市值", "市值") or 0.0,
            "pe": pick_num("市盈率", "市盈率(动态)") or 0.0,
            "pb": pick_num("市净率") or 0.0,
            "total_shares": pick_num("总股本") or 0.0,
            "float_shares": pick_num("流通股") or 0.0,
            "revenue": pick_num("营业收入") or 0.0,
            "net_profit": pick_num("净利润") or 0.0,
        }

    data = cached(f"stock-info:{symbol}", 3600, _fetch, max_wait_seconds=10.0)
    return data or _fallback_stock_info(symbol)

