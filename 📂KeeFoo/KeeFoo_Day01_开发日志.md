# 🧠 KeeFoo 投资第二大脑

## 开发日志 · Day 01

> 📅 日期：2026-03-30　　
> 👤 开发者：swimtoland　　
> 🔖 标签：`#开发日志` `#KeeFoo` `#FastAPI` `#React` `#投资复盘`


---

## 📌 今日概览

从零开始搭建 KeeFoo 完整产品原型：后端 API（FastAPI + SQLite）+ 前端 Web（React + Vite + Tailwind CSS）。一天内完成了三批功能迭代——基础四页面骨架、Agent 追问 + 影子仓位情景推演 + 标的详情页、复盘报告 + 策略画像 + 知识图谱、用户注册登录体系。从 PRD 到可交互原型，核心产品逻辑已全部跑通。

---

## 一、今日成果速览

| 模块 | 状态 | 说明 |
|------|------|------|
| 开发环境搭建 | ✅ 完成 | Node.js + Python + Git + Cursor |
| 后端 API 骨架 | ✅ 完成 | FastAPI + SQLAlchemy + SQLite |
| 数据库模型 | ✅ 完成 | 7张核心表（users/assets/trades/shadow_positions/events/event_asset_links/feed_cards） |
| 前端四个核心页面 | ✅ 完成 | 信息流 + 持仓概览 + 交易录入 + 影子仓位 |
| 视觉升级 | ✅ 完成 | 浅色极简风格，参考苹果设计语言 |
| Agent 苏格拉底追问 | ✅ 完成 | 交易录入后自动生成追问，前端通知+内联回复 |
| 影子仓位情景推演 | ✅ 完成 | 合规话术方向性推送 |
| 标的详情页 | ✅ 完成 | 交易时间轴 + 关联事件流左右分栏 |
| 复盘报告 | ✅ 完成 | 盈亏归因 + 认知偏差检测 + AI 点评 |
| 策略画像 | ✅ 完成 | 四维分析（时间/标的/行为/偏差）+ 图表 |
| 知识图谱 | ✅ 完成 | D3.js 力导向图，Obsidian 风格 |
| 用户注册登录 | ✅ 完成 | JWT 认证 + 路由保护 |
| 演示数据 | ✅ 完成 | 6标的 + 15+交易 + 6事件 + 2影子仓位 |

---

## 二、项目基本信息

```
项目名称：KeeFoo（投资复盘与原子信息图谱系统）
产品定位：个人投资第二大脑
基于文档：FinTrace PRD v1.1 + Gemini 技术推演对话
技术栈：FastAPI + React + Vite + Tailwind CSS + SQLite（MVP）
后端地址：http://127.0.0.1:8000
前端地址：http://localhost:5173
API 文档：http://127.0.0.1:8000/docs
演示账号：demo@keefoo.cn / demo123456
```

---

## 三、战略决策记录

### 3.1 市场路径选择：国内 Web 优先

**决策：** 放弃海外优先路径，选择国内 Web 先行验证。

**理由：**
- PRD 所有数据源（Tushare、AKShare、东财）、合规框架、用户场景全部深度绑定中国 A 股市场
- 海外金融工具赛道竞争激烈（Koyfin、Ziggma 等），从零建立英文信任成本极高
- 国内"投资复盘"赛道几乎空白，同花顺/东财做行情资讯，无人做"给人建模"
- 微信生态获客效率远优于海外冷启动
- Web 端不需要 App Store 审核和小程序类目审批，快速验证

**折中方案：** 先国内 Web → 跑通 Day 3 啊哦时刻 → 上小程序拿推送能力 → 最后做 APP

### 3.2 MVP 数据库选择：SQLite 而非 PostgreSQL

**决策：** 本地开发阶段用 SQLite，部署时切换 PostgreSQL（只改 .env 一行配置）。

**理由：**
- 避免本地安装 Docker + PostgreSQL 的复杂性（零基础开发者友好）
- SQLAlchemy ORM 层屏蔽了数据库差异，切换无痛
- MVP 阶段单用户数据量极小，SQLite 完全够用
- 保留了 Neo4j 图谱存储的设计，MVP 阶段用 PostgreSQL 模拟，后续迁移

### 3.3 项目命名：KeeFoo

**决策：** 从 FinTrace 更名为 KeeFoo。

---

## 四、项目文件结构

### 4.1 后端结构

```
keefoo/backend/
├── .env                         # 环境变量配置（数据库连接、API Key 等）
├── requirements.txt             # Python 依赖清单
├── seed_data.py                 # 演示数据填充脚本
├── keefoo_dev.db                # SQLite 数据库文件（自动生成）
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI 应用入口（路由注册、CORS、自动建表）
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py            # 读取 .env 配置，集中管理所有常量
│   │   ├── database.py          # SQLAlchemy 数据库连接、会话管理
│   │   └── auth.py              # JWT 认证（密码加密、Token 生成/验证）
│   ├── models/
│   │   ├── __init__.py
│   │   ├── models.py            # SQLAlchemy 数据表定义（7张核心表）
│   │   └── schemas.py           # Pydantic 请求/响应数据验证模型
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py            # 所有 API 路由（20+ 接口）
│   └── services/
│       ├── __init__.py
│       ├── agent_service.py     # 苏格拉底追问生成 + 用户回复意图解析
│       ├── scenario_service.py  # 影子仓位情景推演生成
│       ├── report_service.py    # 复盘报告生成（盈亏归因、偏差检测、AI 点评）
│       ├── profile_service.py   # 策略画像（四维分析）
│       └── graph_service.py     # 知识图谱节点/边数据生成
```

### 4.2 前端结构

```
keefoo/frontend/
├── index.html
├── package.json
├── vite.config.js               # Vite 配置（Tailwind 插件、API 代理）
├── src/
│   ├── index.css                # 全局样式（Tailwind 引入、动画定义）
│   ├── api.js                   # Axios 实例 + 所有 API 调用函数封装
│   ├── App.jsx                  # 根组件（路由配置、侧边栏布局、路由保护）
│   ├── contexts/
│   │   └── AuthContext.jsx      # 认证状态全局管理（React Context）
│   ├── components/
│   │   └── Toast.jsx            # 全局 Toast 提示组件
│   └── pages/
│       ├── Login.jsx            # 登录/注册页
│       ├── Feed.jsx             # 信息流首页（含 Agent 追问通知）
│       ├── Positions.jsx        # 持仓概览（真实持仓 + 观望仓）
│       ├── TradeForm.jsx        # 交易录入表单
│       ├── Shadow.jsx           # 影子仓位管理（含情景推演展示）
│       ├── AssetDetail.jsx      # 标的详情页（交易时间轴 + 事件流）
│       ├── Report.jsx           # 复盘报告（盈亏归因、偏差检测、AI 点评）
│       ├── Profile.jsx          # 策略画像（四维图表分析）
│       └── Graph.jsx            # 知识图谱（D3.js 力导向图）
```

---

## 五、核心数据模型详解

### 5.1 设计原则

> 「用户在什么时间、什么市场环境下、基于什么信息、做了什么决策、结果如何」——六个维度决定所有数据表的设计边界。

### 5.2 七张核心表

| 表名 | 用途 | 核心字段 | 设计要点 |
|------|------|----------|----------|
| **users** | 用户账户 | id, email, password_hash, subscription_tier, risk_preference, settings_json | subscription_tier 控制功能权限（free/basic/pro） |
| **assets** | 标的信息 | id, code, name, asset_type, sector, market | code 唯一索引，支持股票/基金/债券/期货/贵金属 |
| **trades** | 交易记录（核心） | id, user_id, asset_id, direction, price, quantity, traded_at, decision_note, emotion_score, confidence_score, note_source, pnl, exit_reason, status, agent_question_* | note_source 三轨并行（user_input/agent_parsed/silence_inferred）是整个系统的数据基础 |
| **shadow_positions** | 影子仓位 | id, user_id, asset_id, shadow_type, hypothetical_entry_price, push_strength_cap | push_strength_cap 固定为 direction_only（合规红线） |
| **events** | 市场事件 | id, event_type, title, summary, source_tier, impact_level, occurred_at | source_tier 三级信源（L1_official/L2_professional/L3_social） |
| **event_asset_links** | 事件-标的关联 | event_id, asset_id, relevance_score | 多对多关联，relevance_score 驱动信息流排序 |
| **feed_cards** | 用户信息流卡片 | user_id, event_id, relevance_level, relevance_score, relevance_note, related_asset_ids | 预计算表，避免每次查询实时计算关联强度 |

### 5.3 trades 表 decision_note 三轨采集机制

这是整个产品最核心的数据创新：

```
轨道一：用户主动填写（目标 30%）
  → 交易录入时直接填写买入理由
  → note_source = "user_input"
  → 权重最高，分析时优先采信

轨道二：Agent 对话解析（目标 40%）
  → 交易录入后 2-4 小时，Agent 推送苏格拉底式追问
  → 用户回复后自动结构化存储
  → note_source = "agent_parsed"
  → 权重次之

轨道三：沉默行为推断（兜底 30%）
  → 用户对追问沉默 → 本身是行为特征
  → 连续对利好消息触发的买入沉默 → 推断倾向于不承认外部驱动
  → note_source = "silence_inferred"
  → 仅作辅助参考

设计哲学：沉默即数据。系统永远不因用户不配合而停止学习。
```

---

## 六、API 接口清单

### 6.1 认证接口

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/v1/auth/register | 注册（email + password + nickname） |
| POST | /api/v1/auth/login | 登录（返回 JWT token） |
| GET | /api/v1/auth/me | 获取当前用户信息（需 Bearer token） |

### 6.2 核心业务接口

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/v1/users | 创建用户 |
| GET | /api/v1/users/{user_id} | 获取用户信息 |
| GET | /api/v1/assets/search?keyword= | 模糊搜索标的 |
| POST | /api/v1/trades?user_id= | 录入交易（自动触发 Agent 追问生成） |
| GET | /api/v1/trades?user_id=&status= | 查询交易列表 |
| GET | /api/v1/trades/{trade_id} | 单笔交易详情 |
| POST | /api/v1/shadow-positions?user_id= | 添加影子仓位（免费版限 5 个） |
| GET | /api/v1/shadow-positions?user_id= | 影子仓位列表 |
| DELETE | /api/v1/shadow-positions/{shadow_id} | 删除影子仓位 |
| GET | /api/v1/positions?user_id= | 持仓概览（真实持仓 + 影子仓位） |
| GET | /api/v1/feed?user_id= | 个性化信息流（按关联强度降序） |
| POST | /api/v1/feed/{card_id}/read | 标记信息卡片已读 |

### 6.3 Agent 追问接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/agent/pending-questions?user_id= | 获取待回复的追问 |
| POST | /api/v1/agent/reply | 回复追问（触发意图解析） |

### 6.4 分析侧接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/reports/{period}?user_id= | 复盘报告（weekly/monthly/quarterly） |
| GET | /api/v1/profile/strategy?user_id= | 策略画像 |
| GET | /api/v1/profile/biases?user_id= | 认知偏差分析 |
| GET | /api/v1/graph/knowledge?user_id= | 知识图谱节点和边数据 |
| GET | /api/v1/scenario-pushes?user_id= | 影子仓位情景推演 |
| GET | /api/v1/assets/{asset_id}/detail?user_id= | 标的详情页数据 |

---

## 七、技术选型与理由

### 7.1 后端技术栈

| 技术 | 用途 | 为什么选它 |
|------|------|------------|
| **Python FastAPI** | Web 框架 | 异步支持好，自动生成 Swagger 文档，类型校验内置，适合 AI 应用 |
| **SQLAlchemy** | ORM | Python 最成熟的 ORM，支持多种数据库无缝切换 |
| **SQLite → PostgreSQL** | 数据库 | MVP 用 SQLite 零配置开发，部署时改一行 .env 切 PostgreSQL |
| **Pydantic v2** | 数据验证 | FastAPI 原生集成，请求/响应自动校验，减少手写验证代码 |
| **PyJWT** | 认证 | 轻量 JWT 实现，够用且简单 |
| **passlib[bcrypt]** | 密码加密 | 行业标准 bcrypt 哈希，安全可靠 |

### 7.2 前端技术栈

| 技术 | 用途 | 为什么选它 |
|------|------|------------|
| **React 18** | UI 框架 | 生态最大，Cursor AI 生成代码质量最高 |
| **Vite** | 构建工具 | 比 CRA 快 10x+，HMR 即时热更新 |
| **Tailwind CSS v4** | 样式 | 原子化 CSS，不写单独样式文件，通过 @tailwindcss/vite 插件引入 |
| **react-router-dom** | 路由 | React 标准路由方案 |
| **axios** | HTTP 请求 | 支持拦截器（自动加 token、401 自动跳转登录） |
| **recharts** | 图表 | React 原生图表库，用于饼图/柱状图/折线图/雷达图 |
| **D3.js** | 知识图谱 | 力导向图的行业标准，实现 Obsidian 风格图谱 |
| **lucide-react** | 图标 | 轻量图标库，风格统一 |

### 7.3 未来部署技术栈（待实施）

| 技术 | 用途 | 说明 |
|------|------|------|
| **PostgreSQL 16** | 生产数据库 | 用户/交易/标的等结构化数据 |
| **Neo4j 5.x** | 图谱数据库 | 公共图谱（系统预建）+ 用户私有图谱（行为积累） |
| **Redis 7.x** | 缓存/队列 | 会话管理、延迟队列（Agent 追问 2-4h 延迟）、推送频控 |
| **阿里云/腾讯云** | 服务器 | 国内部署，ICP 备案 |
| **Docker Compose** | 容器编排 | 一键部署所有服务 |
| **Claude API** | AI 分析 | 复盘报告生成、意图解析、图谱游走验证（替代 MVP 的关键词匹配） |

---

## 八、核心业务逻辑详解

### 8.1 信息流排序逻辑（核心差异化）

```
信息不按时间排列，而是按「与用户持仓的关联强度」排序。

关联级别四层：
  direct  → 直接关联（事件直接涉及用户持仓标的）
  entity  → 实体关联（事件涉及持仓标的的关联实体，如基金公司/经理）
  sector  → 板块联动（事件涉及持仓标的所属板块）
  macro   → 宏观传导（利率/CPI 等宏观指标的间接影响）

同一条降准新闻：
  持有债券基金的用户 → relevance_score 0.85，排在前面
  持有科技股的用户 → relevance_score 0.30，排在后面
```

### 8.2 去噪三步架构（PRD v1.1 核心）

```
第一步：粗筛（线性规则，零 Token 消耗）
  直接涉及持仓标的 +50
  涉及关联实体    +25
  同板块联动      +15
  纯宏观背景      +5
  用户历史点击    +10
  → 总分 ≥ 20 进入第二步，否则丢弃

第二步：图谱游走（核心过滤层，MVP 阶段简化）
  在图谱中沿 Event → Asset → Position 路径验证
  游走终点必须与用户当前持仓产生逻辑闭环
  → 无法形成闭环直接剪枝

第三步：逻辑验证（高算力终筛）
  只有 impact_level = high 的事件才进入
  每用户每日上限 10 次
  → 超出上限降级为日报聚合

MVP 阶段：第一步已实现，第二步简化为数据库查询，第三步待接入 Claude API
```

### 8.3 Agent 苏格拉底追问系统

```
触发时机：用户录入交易后 2-4 小时（MVP 阶段立即触发）
追问生成逻辑：
  1. 查询标的在交易日前后 3 天内的关联事件
  2. 找到 impact_level 最高的事件
  3. 基于该事件生成反向追问（不超过 40 字）

追问示例：
  "你在1680元建仓了贵州茅台，当天白酒板块有政策利好，
   你是基于中线消费逻辑，还是短线技术突破？"

用户回复解析（MVP 用关键词匹配，后续接 Claude API）：
  "赌""博""试试" → confidence=low
  "确定""肯定"   → confidence=high
  "长期""价值"   → time_horizon=long
  "财报""业绩"   → decision_type=fundamental
  "政策""利好"   → decision_type=event_driven
```

### 8.4 影子仓位合规红线

```
合规规则：
  ✅ 真实持仓 → 可输出具体数字区间
     "历史同类情境下该类基金平均反应 +1.2%~+2.8%"

  ❌ 影子仓位 → 永远只给方向，不给数字
     "该类债基在历史降准情境下通常呈现正向反应，可供参考"

  原因：一旦给影子仓位出具体数字区间，可能被认定为投资建议
  数据库层面：push_strength_cap 字段固定为 "direction_only"
```

### 8.5 认知偏差检测规则

```
处置效应（Disposition Effect）：
  检测：亏损交易的平均持仓天数 > 盈利交易的 2 倍
  含义：赢了急着卖，亏了死扛不走

过度交易（Overtrading）：
  检测：月均交易超过 20 笔
  含义：频繁操作，交易成本侵蚀收益

情绪化交易（Emotional Trading）：
  检测：emotion_score ≥ 8 的交易胜率显著低于整体胜率
  含义：情绪越激动，决策质量越差

FOMO（Fear of Missing Out）：
  检测：交易发生在事件后 1 小时内的比例过高
  含义：追涨杀跌，被市场情绪裹挟
```

---

## 九、视觉设计规范

### 9.1 设计风格

```
风格定位：极简克制的金融工具风
参考对象：苹果官网 + 高端 SaaS 产品
关键词：留白、呼吸感、层次靠阴影不靠颜色

背景色：#FAFAFA（页面底色），#FFFFFF（卡片底色）
文字色：#1A1A1A（标题），#555（正文），#999（辅助信息）
强调色：#22C55E（绿，盈利/买入），#EF4444（红，亏损/卖出）
卡片：圆角 16-20px，shadow-sm，hover 时 shadow-md + translateY(-2px)
动画：fadeInUp 入场，stagger 效果（每项延迟 80ms）
```

### 9.2 知识图谱风格（Obsidian 风格）

```
实现方式：D3.js force simulation
物理模拟：forceManyBody（斥力 -80）+ forceLink + forceCenter + forceCollide
交互：拖拽节点、缩放平移、hover 高亮（其余节点 opacity 0.1）
节点类型：
  Asset 标的 → 蓝灰 #4A5568，半径 12px
  Trade 交易 → 绿色/红色，半径 7px
  Event 事件 → 琥珀 #F59E0B，半径 8px
  Shadow 影子仓位 → 虚线边框，半径 9px
背景：点阵网格（radial-gradient 小圆点，间距 20px）
```

---

## 十、今日开发流程完整记录

### 10.1 环境搭建（第一步 ~ 第三步）

```
安装 Node.js v24.14.0 → 跑前端
安装 Python 3.14.3 → 跑后端
安装 Git 2.53.0 → 代码管理

⚠️ 踩坑：Python 安装时必须勾选 "Add python.exe to PATH"
   不勾选的话 cmd 里找不到 python 命令
   修复方法：重新运行安装程序 → Modify → 勾选 Add to PATH
```

### 10.2 项目初始化（第四步 ~ 第六步）

```bash
# 创建项目文件夹
mkdir keefoo && cd keefoo
mkdir backend frontend

# 后端初始化
cd backend
python -m venv venv           # 创建虚拟环境
venv\Scripts\activate         # 激活虚拟环境（Windows）
pip install fastapi uvicorn sqlalchemy psycopg2-binary redis neo4j python-dotenv pydantic httpx

# 前端初始化
cd ..\frontend
npx create-vite@latest . -- --template react    # 选 React + JavaScript
npm install
npm install react-router-dom axios tailwindcss @tailwindcss/vite
```

### 10.3 三批功能迭代

```
第一批：基础骨架
  → Cursor 指令生成后端全部代码（models + schemas + routes + main）
  → Cursor 指令生成前端四个核心页面
  → 前后端联调跑通

第二批（上半场）：核心闭环
  后端：agent_service.py（追问生成+意图解析）
       scenario_service.py（情景推演）
       新增 3 个 API 接口
  前端：Agent 追问通知（Feed 页内联回复）
       影子仓位情景推演展示
       标的详情页（交易时间轴+事件流）

第二批（下半场）：分析侧
  后端：report_service.py（复盘报告）
       profile_service.py（策略画像）
       graph_service.py（知识图谱数据）
       新增 4 个 API 接口
  前端：复盘报告页（盈亏归因+偏差检测+AI 点评）
       策略画像页（四维图表）
       知识图谱页（D3.js Obsidian 风格力导向图）

第三批：认证体系
  后端：auth.py（JWT + bcrypt）
       注册/登录/验证 3 个接口
  前端：Login 页面、AuthContext、路由保护、axios 拦截器
```

---

## 十一、Cursor AI 使用技巧 ⭐

### 技巧1：用 Composer Agent 模式批量生成文件

```
✅ 按 Ctrl + I 打开 Composer
✅ 切换到 Agent 模式（不是 Normal 模式）
✅ 一次性描述清楚所有文件的需求
✅ 等生成完毕后点 Accept 全部接受

❌ 不要用 Normal 模式，它只能改单个文件
❌ 不要一个文件一个文件地分开请求
```

### 技巧2：指令要写得像产品需求文档

```
✅ 列出每个文件要做什么
✅ 写明数据结构和字段
✅ 给出具体的 UI 布局描述
✅ 注明技术约束（已安装的库、API 地址等）
✅ 强调"不要省略任何代码"

❌ 不要只说"帮我做一个登录页"
❌ 不要假设 AI 知道你的后端接口长什么样
```

### 技巧3：前后端分开发指令

```
✅ 先发后端指令 → 确认没报错 → 再发前端指令
✅ 后端改完要重启服务（Ctrl+C → python seed_data.py → uvicorn）
✅ 前端改完要重启开发服务器（Ctrl+C → npm run dev）

❌ 不要前后端一起改，容易混乱
❌ 不要在前端终端运行后端命令（注意看终端标签）
```

### 技巧4：修复问题要具体

```
✅ "节点斥力太强了，forceManyBody strength 从 -300 改为 -80"
✅ "hover 时其余节点 opacity 降到 0.1，目标节点保持不变"

❌ "图看起来不对，修一下"
❌ "效果不好，优化一下"
```

---

## 十二、常用命令速查

### 后端命令（在 backend 目录下执行）

```bash
# 激活虚拟环境
venv\Scripts\activate

# 填充/重置演示数据
python seed_data.py

# 启动后端服务
python -m uvicorn app.main:app --reload --port 8000

# 安装新依赖
pip install 包名

# 查看 API 文档
浏览器打开 http://127.0.0.1:8000/docs
```

### 前端命令（在 frontend 目录下执行）

```bash
# 安装依赖
npm install

# 安装新库
npm install 库名

# 启动开发服务器
npm run dev

# 访问页面
浏览器打开 http://localhost:5173
```

---

## 十三、待解决问题与下一步计划

### 🔴 优先级1（下次开发第一件事）

- [ ] 把代码推送到 GitHub 做版本管理
- [ ] 购买域名（建议 keefoo.cn 或 keefoo.com.cn）
- [ ] 开始 ICP 备案流程（需要 7-15 天）

### 🟡 优先级2（本周内）

- [ ] 购买国内云服务器（阿里云/腾讯云轻量应用服务器）
- [ ] 部署后端（PostgreSQL + FastAPI + Nginx）
- [ ] 部署前端（Nginx 静态文件托管）
- [ ] 配置 HTTPS（Let's Encrypt 免费证书）

### 🟢 优先级3（部署上线后）

- [ ] 接入真实数据源（Tushare Pro / AKShare）替代演示数据
- [ ] 接入 Claude API 替代 MVP 的关键词匹配意图解析
- [ ] 实现 Agent 追问的 2-4 小时延迟队列（Celery + Redis）
- [ ] 构建公共图谱（A 股全部标的行业关系预建）
- [ ] 将图谱存储迁移到 Neo4j
- [ ] 开发微信公众号推送能力
- [ ] 实现付费墙和订阅管理

---

## 十四、关键成功指标（PRD v1.1）

| 指标 | 定义 | 目标值 | 优先级 |
|------|------|--------|--------|
| Day 3 啊哦时刻触发率 | 影子仓位推送后用户点击展开比例 | > 50% | P0 |
| D90 留存率 | 注册 90 天后仍活跃比例 | > 40% | P0 |
| 付费转化率 | 90 天节点付费转化率 | > 15% | P0 |
| 交易录入率 | 有交易录入的周活跃比例 | > 60% | P0 |
| decision_note 有效覆盖率 | 三轨并行合计有效覆盖 | > 70% | P1 |

---

## 十五、资源链接

| 资源 | 地址 |
|------|------|
| 项目后端 | http://127.0.0.1:8000 |
| API 文档 | http://127.0.0.1:8000/docs |
| 项目前端 | http://localhost:5173 |
| Cursor 编辑器 | cursor.com |
| FastAPI 文档 | fastapi.tiangolo.com |
| React 文档 | react.dev |
| Tailwind CSS | tailwindcss.com |
| Recharts | recharts.org |
| D3.js | d3js.org |

---

> 💬 **今日感悟**：从 PRD 到可交互原型，最大的挑战不是写代码——Cursor AI 可以处理绝大部分编码工作。真正的难点在于两个：一是把业务逻辑想清楚（决策笔记三轨采集、去噪三步架构、合规话术边界），二是给 AI 写出足够清晰的指令。指令的质量直接决定了生成代码的质量。这和 PRD 里说的一样：思路指导技术，技术反哺思路。

---

_📝 下次开发从推送代码到 GitHub + 部署上线开始_
