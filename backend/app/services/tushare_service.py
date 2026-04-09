"""Tushare market data service (requires API token, fallback to AKShare)."""

import pandas as pd
import tushare as ts
from typing import Any, Optional
from app.core.config import get_settings

def _get_ts_pro():
    settings = get_settings()
    token = getattr(settings, "TUSHARE_TOKEN", "")
    if not token:
        return None
    return ts.pro_api(token)

def get_daily_stock_kline(code: str, start_date: str, end_date: str) -> list[dict]:
    """获取股票日线数据。使用 Tushare 免费积分即可调用的接口。"""
    pro = _get_ts_pro()
    if not pro:
        return []
        
    try:
        # Tushare 股票代码通常是 000001.SZ 格式
        ts_code = code
        if not ("." in ts_code):
            if ts_code.startswith("60") or ts_code.startswith("68"):
                ts_code = f"{ts_code}.SH"
            else:
                ts_code = f"{ts_code}.SZ"
                
        # Tushare pro.daily 支持 adj='qfq' 需要更高级权限，基础 120 积分可能不支持。
        # 这里我们先用最基础的，如果返回为空，尝试 pro.stock_basic 确认代码是否存在。
        df = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
        if df.empty:
            return []
            
        # 转换为前端通用格式
        # Tushare 字段: trade_date, open, high, low, close, vol
        df = df.sort_values("trade_date")
        out = []
        for _, r in df.iterrows():
            out.append({
                "date": f"{r['trade_date'][:4]}-{r['trade_date'][4:6]}-{r['trade_date'][6:]}",
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["vol"]) * 100 # Tushare 手 -> 股
            })
        return out
    except Exception as e:
        print(f"Tushare error for {code}: {e}")
        return []

def get_stock_quote(code: str) -> dict:
    """获取股票最新日线报价（模拟实时）。"""
    from datetime import datetime
    pro = _get_ts_pro()
    if not pro:
        return {}
        
    try:
        ts_code = code
        if not ("." in ts_code):
            if ts_code.startswith("60") or ts_code.startswith("68"):
                ts_code = f"{ts_code}.SH"
            else:
                ts_code = f"{ts_code}.SZ"
                
        # 获取最近两天的行情，以防今天还没收盘或还没数据
        end_date = datetime.now().strftime("%Y%m%d")
        df = pro.daily(ts_code=ts_code, end_date=end_date, limit=1)
        if df.empty:
            return {}
            
        r = df.iloc[0]
        # 计算涨跌幅
        close = float(r["close"])
        pre_close = float(r["pre_close"])
        change_pct = round((close - pre_close) / pre_close * 100, 2) if pre_close else 0.0
        
        return {
            "code": code,
            "name": "", # Basic info needed for name
            "price": close,
            "change_pct": change_pct,
            "volume": float(r["vol"]) * 100,
            "turnover_rate": float(r.get("turnover_rate", 0.0)),
            "pe": float(r.get("pe", 0.0)),
            "market_cap": float(r.get("amount", 0.0)) # 凑合用金额当市值，或者后续调用 basic
        }
    except Exception as e:
        print(f"Tushare quote error for {code}: {e}")
        return {}

def get_stock_basic_info(code: str) -> dict:
    """获取股票基础信息。"""
    pro = _get_ts_pro()
    if not pro:
        return {}
        
    try:
        ts_code = code
        if not ("." in ts_code):
            if ts_code.startswith("60") or ts_code.startswith("68"):
                ts_code = f"{ts_code}.SH"
            else:
                ts_code = f"{ts_code}.SZ"
                
        df = pro.stock_basic(ts_code=ts_code, fields='ts_code,symbol,name,area,industry,list_date')
        if df.empty:
            return {}
            
        r = df.iloc[0]
        return {
            "code": r["symbol"],
            "name": r["name"],
            "sector": r["industry"],
            "area": r["area"],
            "list_date": r["list_date"]
        }
    except Exception as e:
        print(f"Tushare basic info error: {e}")
        return {}
