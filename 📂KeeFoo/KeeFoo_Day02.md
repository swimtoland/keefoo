# 🧠 KeeFoo 投资第二大脑

## 开发日志 · Day 02

> 📅 日期：2026-03-31　　 👤 开发者：swimtoland　　 🔖 标签：`#开发日志` `#KeeFoo` `#日历` `#图表分析` `#笔记本` `#交易录入`

---

## 📌 今日概览

Day 02 聚焦在三个大方向：新增核心功能模块（图表分析 + 笔记本 + 日历视图 + 交易录入弹窗流程）、全局布局重构（内容靠左铺满 + 行情滚动栏改造）、以及持续的视觉修复。今天最大的工程量在图表分析页（TradingView K线图 + 右侧笔记面板）和日历视图（月/周双视图 + 右侧详情面板 + 提醒系统），这两个模块前后端都有大量新增。同时完成了用户注册登录体系（JWT认证 + 路由保护），KeeFoo 现在具备了完整的用户账户能力。

---

## 一、今日成果速览

|模块|状态|说明|
|---|---|---|
|用户注册登录|✅ 完成|JWT + bcrypt，登录/注册页面，路由保护，axios 拦截器|
|图表分析页|✅ 完成|TradingView Lightweight Charts K线图 + 右侧笔记面板|
|笔记本系统|✅ 完成|后端 CRUD（文件夹/笔记/标签）+ 前端三栏布局（Obsidian风格）|
|交易录入弹窗|✅ 完成|心态自检 → 交易表单两步流程，含复盘侧边栏|
|日历视图|✅ 完成|月/周双视图 + 右侧详情面板 + 提醒系统 CRUD|
|全局布局重构|✅ 完成|内容靠左铺满、行情滚动栏英文标的 + 跑马灯|
|信息流布局修复|✅ 完成|解决卡片溢出视口问题（calc + overflow 方案）|
|弹窗毛玻璃效果|✅ 完成|backdrop-blur 遮罩 + 复盘侧边栏固定高度|

---

## 二、新增文件清单

### 2.1 后端新增文件

|文件路径|用途|
|---|---|
|`backend/app/core/auth.py`|JWT认证模块（密码加密、Token生成/验证、FastAPI依赖注入）|
|`backend/app/services/agent_service.py`|苏格拉底追问生成 + 用户回复意图解析|
|`backend/app/services/scenario_service.py`|影子仓位情景推演生成（合规话术）|
|`backend/app/services/report_service.py`|复盘报告生成（盈亏归因、偏差检测、AI模板点评）|
|`backend/app/services/profile_service.py`|策略画像四维分析|
|`backend/app/services/graph_service.py`|知识图谱节点和边数据生成|
|`backend/requirements.txt`|全部Python依赖清单|

### 2.2 后端修改文件

|文件路径|改动内容|
|---|---|
|`models.py`|新增 notebooks、notes、note_tags、note_tag_links、reminders 五张表|
|`schemas.py`|新增 30+ Pydantic模型|
|`routes.py`|新增 20+ API接口|
|`seed_data.py`|新增笔记文件夹3个、笔记6条、标签4个、提醒6条、额外交易8-10笔|

### 2.3 前端新增文件

|文件路径|用途|
|---|---|
|`src/contexts/AuthContext.jsx`|全局认证状态管理|
|`src/components/TradeWizard.jsx`|交易录入两步弹窗|
|`src/components/Toast.jsx`|全局Toast提示|
|`src/pages/Login.jsx`|登录/注册页面|
|`src/pages/AssetDetail.jsx`|标的详情页|
|`src/pages/Report.jsx`|复盘报告|
|`src/pages/Profile.jsx`|策略画像|
|`src/pages/Graph.jsx`|知识图谱（D3.js）|
|`src/pages/Chart.jsx`|图表分析（TradingView）|
|`src/pages/Notebook.jsx`|笔记本（三栏布局）|
|`src/pages/Calendar.jsx`|日历视图|

---

## 三、新增数据模型

### 3.1 notebooks 表

|字段|类型|说明|
|---|---|---|
|id|UUID PK|文件夹唯一标识|
|user_id|UUID FK|关联用户|
|name|VARCHAR(128)|文件夹名称|
|parent_id|UUID FK自关联|支持嵌套|
|sort_order|INT|排序|

### 3.2 notes 表

|字段|类型|说明|
|---|---|---|
|id|UUID PK|笔记唯一标识|
|title|VARCHAR(256)|标题|
|content|TEXT|正文（Markdown/HTML）|
|notebook_id|UUID FK可选|所属文件夹|
|linked_asset_id|UUID FK可选|关联标的|
|linked_trade_id|UUID FK可选|关联交易|
|is_pinned|BOOLEAN|置顶|
|is_archived|BOOLEAN|软删除|

### 3.3 note_tags 表

|字段|类型|说明|
|---|---|---|
|id|UUID PK|标签标识|
|name|VARCHAR(64)|标签名|
|color|VARCHAR(7)|颜色值|

### 3.4 reminders 表

|字段|类型|说明|
|---|---|---|
|id|UUID PK|提醒标识|
|title|VARCHAR(256)|标题|
|remind_date|DATE|日期|
|is_completed|BOOLEAN|完成状态|
|priority|ENUM|high/medium/low|
|linked_asset_id|UUID FK可选|关联标的|

---

## 四、新增API接口清单

### 认证（3个）

|方法|路径|功能|
|---|---|---|
|POST|/auth/register|注册|
|POST|/auth/login|登录|
|GET|/auth/me|当前用户|

### 笔记本（14个）

|方法|路径|功能|
|---|---|---|
|POST/GET/PUT/DELETE|/notebooks|文件夹CRUD|
|POST/GET/PUT/DELETE|/notes|笔记CRUD|
|POST|/notes/{id}/move|移动笔记|
|POST/GET/PUT/DELETE|/tags|标签CRUD|

### 日历（7个）

|方法|路径|功能|
|---|---|---|
|GET|/calendar/month|月概览|
|GET|/calendar/day|日详情|
|GET|/calendar/week|周数据|
|POST/GET/PUT/DELETE|/reminders|提醒CRUD|

### 分析侧（6个）

|方法|路径|功能|
|---|---|---|
|GET|/reports/{period}|复盘报告|
|GET|/profile/strategy|策略画像|
|GET|/profile/biases|认知偏差|
|GET|/graph/knowledge|知识图谱|
|GET|/scenario-pushes|情景推演|
|GET|/assets/{id}/detail|标的详情|

---

## 五、核心功能设计详解

### 5.1 交易录入弹窗（TradeWizard）

```
Step 1 心态自检：
  5种心态 → 直接写入 emotion_score
  平静(3) 兴奋(7) 焦虑(8) 愤怒(9) 无聊(2)
  选择后显示对应风险提示

Step 2 交易表单：
  标的搜索 + 方向选择 + 执行数据 + 交易逻辑 + 置信度滑块
  复盘侧边栏：笔记 + 复盘笔记 + 错误标签

弹窗特性：
  毛玻璃遮罩 backdrop-blur-md
  展开侧边栏宽度过渡 640px → 900px
  固定高度 max-h-[85vh] 内部独立滚动
```

### 5.2 图表分析页

```
左侧：TradingView K线图（CDN加载）+ 120日Mock数据
右侧：笔记面板（关联当前标的，富文本编辑，自动保存）
上涨红色 下跌绿色（中国习惯）

⚠️ 踩坑：chart实例不能存在ref.current上
   修复：用局部let变量持有
```

### 5.3 笔记本（Obsidian风格）

```
三栏：文件夹树(220px) + 笔记列表(300px) + 编辑器(flex-1)
文件夹嵌套、标签系统、关联标的/交易
编辑器：contentEditable + execCommand（MVP方案）
```

### 5.4 日历视图

```
月视图：大数字日期(32px) + 格子内事项预览 + 网格线分隔
周视图：7列事项卡片纵向排列
右侧面板：滑入动画 + 按类型分组 + 跳转链路
提醒系统：完整CRUD + 三级优先级 + 关联标的
```

---

## 六、今日遇到的问题与解决方案

### 🔴 问题1：TradingView createChart 报错

```
Cannot add property __lastChart, object is not extensible
```

**解决：** chart实例用局部let变量，不存ref.current。

### 🔴 问题2：信息流卡片反复溢出视口

```
尝试 grid-cols-12 → 失败
尝试 min-w-0 → 部分修复
```

**最终方案：**

1. App.jsx `style={{ width: 'calc(100vw - 220px)' }}` 锁死
2. `overflow-x-hidden` 最后防线
3. Feed.jsx 改用 flex + 百分比（70%/30%）

**教训：** Grid子元素默认min-width:auto阻止收缩，flex+百分比更可控。

### 🔴 问题3：弹窗展开侧边栏高度变化

**解决：** `max-h-[85vh] overflow-hidden`，左右各自`overflow-y-auto`。

### 🔴 问题4：终端混用

**解决：** 注意Cursor底部终端标签，区分backend和frontend。

---

## 七、当前项目完整能力清单

### 输入侧

- ✅ 信息流首页（关联排序 + 追问通知 + 行情滚动栏）
- ✅ 持仓概览（真实持仓 + 影子观望仓）
- ✅ 交易录入弹窗（心态自检 + 表单 + 复盘侧边栏）
- ✅ 交易记录列表
- ✅ 影子仓位管理（+ 情景推演）
- ✅ 图表分析（K线图 + 笔记面板）
- ✅ 标的详情页

### 分析侧

- ✅ 复盘报告（盈亏归因 + 偏差检测 + AI点评）
- ✅ 策略画像（四维图表 + 雷达图）
- ✅ 知识图谱（D3.js力导向图）

### 工具侧

- ✅ 笔记本（三栏 + 文件夹 + 标签 + 富文本 + 关联）
- ✅ 日历视图（月/周 + 详情面板 + 提醒系统 + 跳转链路）

### 基础设施

- ✅ 用户注册/登录（JWT + 路由保护）
- ✅ 演示数据全套
- ✅ API文档（Swagger）

---

## 八、新增依赖

### 后端

```
pyjwt, passlib[bcrypt]
```

### 前端

```
recharts, lucide-react, d3, react-markdown, remark-gfm
CDN: lightweight-charts (TradingView)
```

---

## 九、项目统计

|指标|Day 01|Day 02|增长|
|---|---|---|---|
|API接口数|16|40+|+150%|
|前端页面数|8|13|+62%|
|数据库表数|7|12|+71%|
|后端文件数|8|14|+75%|
|前端文件数|10|18|+80%|

---

## 十、下一步计划

### 🔴 优先级1

- [ ] 推送代码到 GitHub
- [ ] 购买域名 + ICP备案

### 🟡 优先级2

- [ ] 部署上线（国内云服务器）
- [ ] 图表接入真实行情数据
- [ ] 笔记编辑器升级（TipTap）
- [ ] 日历视图细节打磨

### 🟢 优先级3

- [ ] 接入 Tushare/AKShare 真实数据
- [ ] 接入 Claude API 意图解析
- [ ] Agent 追问延迟队列
- [ ] 公共图谱预建
- [ ] 付费墙 + 微信推送

---

> 💬 **今日感悟**：Day 02 的开发量比 Day 01 大得多，但 Cursor 效率也在提升——随着代码量增加，AI 对项目上下文理解更准确。最大教训是布局溢出：CSS Grid 和 Flex 在"严格约束宽度"时行为差异很关键，`min-w-0` 和 `calc(100vw - sidebar)` 是救命属性。产品层面，交易录入弹窗的心态自检不只是UX花招，而是直接为 emotion_score 数据采集服务——一个交互动作同时完成"用户体验"和"数据收集"两件事。

---

_📝 下次开发从推送代码到 GitHub + 部署上线准备开始_