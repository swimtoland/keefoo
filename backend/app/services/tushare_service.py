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
