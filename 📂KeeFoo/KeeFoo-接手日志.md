# KeeFoo 项目开发接手日志

> **文档目的**：记录截至目前的实现范围、架构与约定，便于新成员或接手者快速对齐上下文并继续开发。  
> **最后更新**：2026-04-03  
> **项目状态**：已部署公网（腾讯云），完成多智能体联邦架构（Federated Agent Team）升级。

---

## 1. 产品核心逻辑 (2.0 版)

**KeeFoo** 不仅仅是交易记录器，而是基于 **苏格拉底式审计** 的个人投资第二大脑。
其核心链路：**事件/交易录入** -> **多级智能体解析 (Sentinel/Weaver/Judge)** -> **策略手册审计 (Strategy Manual Audit)** -> **逻辑留痕与画像**。

---

## 2. 核心架构说明

### 2.1 多智能体联邦 (Federated Agent Team)
项目在 `backend/app/agents/` 和 `app/services/agent_service.py` 中实现了三级解构：
- **Sentinel (L1)**: 事实提取（标的、数据、时间）。
- **Weaver (L2)**: 关系编织（计算与 Watchlist 的相关性，更新知识图谱 Edge）。
- **Judge (L3)**: 逻辑法官。**关键**：它调用 `strategies` 表中的用户规则，对录入的逻辑进行批判性审计。

### 2.2 策略手册 (Strategy Manual)
- **数据库表**：`strategies` (id, user_id, name, content, category, is_active)。
- **作用**：作为 L3 智能体的“宪法”。用户在 `pages/StrategyManual.jsx` 中配置。

---

## 3. 目录结构

```
keefoo/
├── frontend/                 # React SPA (Vite 8 + React 19)
│   ├── src/
│   │   ├── components/
│   │   │   ├── FeedCard.jsx  # 三层原子化卡片 (事实/推演/审计)
│   │   │   ├── ...
│   │   ├── pages/
│   │   │   ├── Feed.jsx      # 逻辑审计信息流
│   │   │   ├── Graph.jsx     # D3.js 动态知识图谱 (含 Pulse/Flow 动画)
│   │   │   ├── StrategyManual.jsx # 策略配置门户
│   │   │   ├── ...
│   │   ├── index.css         # 定义了关键动画 node-pulse, edge-dash-flow
│   │   └── api.js            # Axios 封装 (已修复 URL 参数致命错误)
├── backend/
│   ├── app/
│   │   ├── models/models.py  # 新增 Strategy 模型
│   │   ├── services/
│   │   │   ├── agent_service.py # 多智能体编排核心
│   │   │   ├── ai_service.py    # 适配 DeepSeek-R1 / Claude 3.5 推理模型
│   │   └── ...
```

---

## 4. 接手注意事项 (避坑指南)

### 4.1 D3 与 CSS 动画冲突
- **禁止** 在 `Graph.jsx` 的节点分组 `<g>` 上直接应用 `transform` 相关的 CSS 动画（如缩放、位移）。
- **原因**：CSS 的 `transform` 会覆盖 D3 力导向图计算出的坐标。
- **规范**：动画类必须应用在内部的 `<circle>` 或 `<path>` 上，并设置 `transform-origin: center`。

### 4.2 i18n 与 变量 `t`
- 在 `pages/Feed.jsx` 等页面，如果你在循环中使用 `item.map(t => ...)`，会覆盖全局的 `useUiPreferences().t` 翻译函数。
- **规范**：翻译函数统一命名为 `tr` 或 `t_` 以示区分。

### 4.3 api.js 完整性
- 所有的 API 调用必须包含完整的路径参数。
- **错误示范**：`api.put(, data)` (参数缺失导致 Vite 全局编译失败)。
- **规范**：使用模板字符串 `` `/strategies/${strategyId}` ``。

---

## 5. 待办开发计划 (Roadmap)

1.  **Phase 2 认知偏见分析**：从 `Judge Audit` 文本中提取情感分数，量化 FOMO、损失厌恶。
2.  **图谱双向过滤**：点击 `Graph.jsx` 节点，应向 `Feed.jsx` 发送事件或更新全局状态，实现信息流筛选。
3.  **Shadow 推演服务**：完善 `scenario_service.py`，根据 L2 事件自动触发影子仓位的极端情况预测。

---

## 6. 环境启动

### 后端 (Python 3.12+)
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 前端 (Node 22+)
```bash
cd frontend
npm install
npm run dev
```

---
*📝 2026-04-03 存档。开发者：Accio Team*
