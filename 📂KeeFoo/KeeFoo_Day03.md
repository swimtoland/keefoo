# 🧠 KeeFoo 投资第二大脑

## 开发日志 · Day 03

> 📅 日期：2026-03-31　　 👤 开发者：swimtoland　　 🔖 标签：`#开发日志` `#KeeFoo` `#部署上线` `#AKShare` `#DeepSeek` `#腾讯云`

---

## 📌 今日概览

Day 03 的核心工作分三块：全面 API 联调修复、GitHub 推送 + 腾讯云服务器部署上线、接入真实数据源（AKShare + DeepSeek AI）。产品已成功部署到公网可访问（http://111.229.156.79），但真实数据源接入遇到两个环境问题：本地 Windows 的 DLL 安全策略阻止 AKShare 运行，腾讯云试用服务器的网络出站可能对部分域名有限制。这两个问题待下次开发解决。

---

## 一、今日成果速览

|模块|状态|说明|
|---|---|---|
|recharts 图表警告修复|✅ 完成|ResponsiveContainer 改为固定像素高度|
|GitHub 仓库创建并推送|✅ 完成|https://github.com/swimtoland/keefoo|
|.gitignore 配置|✅ 完成|排除 venv/node_modules/.db/.env|
|腾讯云服务器购买|✅ 完成|试用实例 2核2G Ubuntu 24.04 上海二区|
|服务器环境安装|✅ 完成|Python3/Node.js 22.x/Nginx/Git|
|后端部署|✅ 完成|FastAPI + uvicorn + systemd 后台运行|
|前端部署|✅ 完成|Vite build + Nginx 静态托管 + API 反向代理|
|公网可访问|✅ 完成|http://111.229.156.79|
|AKShare 数据服务（后端）|✅ 代码完成|大盘指数/个股行情/K线/新闻/基本面|
|DeepSeek AI 服务（后端）|✅ 代码完成|追问生成/意图解析/报告点评/情景推演|
|前端对接真实数据|✅ 代码完成|行情滚动栏/K线图/持仓实时价/标的详情|
|AKShare 本地运行|❌ 阻塞|Windows DLL 安全策略阻止 pandas C 扩展加载|
|AKShare 服务器运行|⏳ 待验证|服务器网络出站可能受限，需进一步排查|

---

## 二、部署架构详解

### 2.1 服务器信息

```
云服务商：腾讯云
实例类型：CVM 标准型 S5（试用）
配置：2核 2GiB 3Mbps
操作系统：Ubuntu 24.04.4 LTS
地域：上海二区
公网 IP：111.229.156.79
试用到期：2026-04-30
```

### 2.2 部署架构图

```
用户浏览器
    │
    ▼ HTTP :80
┌──────────────────────────────────┐
│  Nginx（反向代理 + 静态文件）      │
│                                    │
│  /              → frontend/dist/   │  ← React 构建产物
│  /api/*         → 127.0.0.1:8000   │  ← 代理到后端
│  try_files      → /index.html      │  ← SPA 路由支持
└──────────────────────────────────┘
    │
    ▼ localhost:8000
┌──────────────────────────────────┐
│  FastAPI (uvicorn)                 │
│  通过 systemd 管理（keefoo-api）   │
│  WorkingDirectory: backend/        │
│  Python venv 隔离环境              │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  SQLite (keefoo_prod.db)          │
│  位置：backend/keefoo_prod.db      │
└──────────────────────────────────┘
```

### 2.3 关键配置文件

**Nginx 配置** `/etc/nginx/sites-available/keefoo`：

```nginx
server {
    listen 80;
    server_name 111.229.156.79;

    root /home/ubuntu/keefoo/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;  # SPA 路由 fallback
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**systemd 服务** `/etc/systemd/system/keefoo-api.service`：

```ini
[Unit]
Description=KeeFoo API Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/keefoo/backend
Environment=PATH=/home/ubuntu/keefoo/backend/venv/bin:/usr/bin
ExecStart=/home/ubuntu/keefoo/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

**安全组规则**：

|端口|协议|来源|用途|
|---|---|---|---|
|80|TCP|0.0.0.0/0|HTTP 网站访问|
|443|TCP|0.0.0.0/0|HTTPS（后续用）|
|8000|TCP|0.0.0.0/0|后端 API（临时）|

---

## 三、新增代码模块详解

### 3.1 market_data_service.py — AKShare 数据服务

```
功能清单：
  get_market_indices()     → 大盘指数实时数据（上证/深证/沪深300/创业板指等）
  get_stock_realtime(code) → 个股实时行情（价格/涨跌幅/成交量/换手率/PE）
  get_fund_realtime(code)  → 基金实时净值
  get_stock_kline(code)    → 个股日K/周K/月K线数据
  get_financial_news()     → 最新财经新闻
  get_stock_info(code)     → 上市公司基本面（行业/市值/PE/PB/营收/净利润）

缓存机制：
  内存级缓存，key + ttl_seconds + fetch_fn 模式
  大盘指数缓存 60 秒
  个股行情缓存 30 秒
  K线数据缓存 5 分钟
  新闻缓存 5 分钟
  基本面缓存 1 小时
  
  缓存失效时如果 API 调用失败，返回旧缓存数据（降级策略）
```

### 3.2 ai_service.py — DeepSeek AI 服务

```
技术方案：
  使用 OpenAI 兼容 SDK：
    from openai import OpenAI
    client = OpenAI(api_key=KEY, base_url="https://api.deepseek.com")
  模型：deepseek-chat

功能清单：

  generate_smart_question() → 苏格拉底追问生成
    System Prompt 定义 AI 角色为苏格拉底式访谈者
    基于交易标的 + 当天市场环境生成反向追问
    温度 0.7（允许一定创造性）
    max_tokens 100（追问不超过 40 字）
    失败时 fallback 到模板匹配

  parse_reply_with_ai() → 用户回复意图解析
    输出严格 JSON 格式：decision_type/time_horizon/confidence/emotion_score/structured_note
    温度 0.3（低温度保证结构化输出稳定）
    max_tokens 200
    失败时 fallback 到关键词匹配

  generate_report_commentary() → 复盘报告 AI 点评
    遵循规则：不做裁判、不做马后炮、区分数据源可信度
    温度 0.5
    max_tokens 500
    失败时 fallback 到模板文字

  generate_scenario() → 影子仓位情景推演
    合规红线：绝对不输出具体数字区间
    输出 JSON：scenario_text + direction(positive/negative/neutral)
    温度 0.5
    max_tokens 150
    失败时 fallback 到固定模板

设计原则：所有 AI 调用都有 fallback，没有 API Key 也能正常运行
```

### 3.3 前端真实数据对接

```
修改的页面：

Feed.jsx 行情滚动栏：
  调用 getMarketIndices() 替代 mock 数据
  每 60 秒自动刷新
  失败时显示"行情数据加载中..."

Chart.jsx K线图：
  调用 getStockKline(code, period, count) 替代随机数据
  切换时间周期重新请求
  图表下方调用 getStockRealtime() 显示实时数据

Positions.jsx 持仓页：
  并行请求所有持仓标的实时价格（Promise.all）
  显示实时市值和浮动盈亏
  单个标的失败不影响其他

AssetDetail.jsx 标的详情：
  调用 getStockRealtime() + getStockInfo() 显示实时行情和基本面

Feed.jsx 市场快讯：
  调用 getFinancialNews() 显示最新财经新闻
```

### 3.4 新增 API 接口

|方法|路径|功能|
|---|---|---|
|GET|/api/v1/market/indices|大盘指数实时数据|
|GET|/api/v1/market/stock/{code}|个股实时行情|
|GET|/api/v1/market/fund/{code}|基金实时净值|
|GET|/api/v1/market/kline/{code}|K线数据|
|GET|/api/v1/market/news|财经新闻|
|GET|/api/v1/market/stock-info/{code}|公司基本面|

```
累计接口：44 + 6 = 50+ 个
```

---

## 四、完整部署操作流程

### 4.1 本地 → GitHub

```bash
# 配置 Git
git config --global user.name "swimtoland"
git config --global user.email "yangmaizhe@gmail.com"

# 创建 .gitignore（根目录）
# 排除：backend/venv/, backend/*.db, backend/.env, frontend/node_modules/, frontend/dist/

# 初始化并提交
git init
git add -A
git commit -m "KeeFoo v0.1.0 - MVP complete"

# GitHub 创建仓库（Private），然后推送
git remote add origin https://github.com/swimtoland/keefoo.git
git branch -M main
git push -u origin main
```

### 4.2 服务器环境安装

```bash
# 安装基础工具
sudo apt update && sudo apt install -y git python3 python3-pip python3-venv nginx nodejs npm

# 升级 Node.js 到 22.x（Vite 要求 20.19+）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4.3 拉取代码并部署后端

```bash
cd /home/ubuntu
git clone https://github.com/swimtoland/keefoo.git

cd keefoo/backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary redis neo4j python-dotenv pydantic httpx pyjwt "passlib[bcrypt]" akshare openai

# 创建生产环境配置
cat > .env << 'EOF'
APP_NAME=KeeFoo
APP_ENV=production
SECRET_KEY=keefoo-prod-2026-change-this-to-random-string
DEBUG=False
DATABASE_URL=sqlite:///./keefoo_prod.db
DEEPSEEK_API_KEY=你的key
EOF

# 初始化数据库
python seed_data.py
```

### 4.4 构建前端

```bash
cd /home/ubuntu/keefoo/frontend
npm install
npm run build  # 生成 dist/ 静态文件
```

### 4.5 配置 Nginx

```bash
# 写入配置（用 sudo tee 避免权限问题）
sudo tee /etc/nginx/sites-available/keefoo > /dev/null << 'EOF'
server {
    listen 80;
    server_name 111.229.156.79;
    root /home/ubuntu/keefoo/frontend/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# 启用配置
sudo ln -sf /etc/nginx/sites-available/keefoo /etc/nginx/sites-enabled/keefoo
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t  # 验证配置
sudo systemctl restart nginx
```

### 4.6 配置后端后台运行

```bash
# 创建 systemd 服务
sudo tee /etc/systemd/system/keefoo-api.service > /dev/null << 'EOF'
[Unit]
Description=KeeFoo API Server
After=network.target
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/keefoo/backend
Environment=PATH=/home/ubuntu/keefoo/backend/venv/bin:/usr/bin
ExecStart=/home/ubuntu/keefoo/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable keefoo-api
sudo systemctl start keefoo-api
sudo systemctl status keefoo-api  # 确认 active (running)
```

### 4.7 更新部署流程（后续使用）

```bash
# 本地推送
git add -A && git commit -m "描述" && git push origin main

# 服务器更新
cd /home/ubuntu/keefoo && git pull origin main
cd backend && source venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm install && npm run build
sudo systemctl restart keefoo-api && sudo systemctl restart nginx
```

---

## 五、今日踩坑记录

### 🔴 问题1：Node.js 版本太低

```
现象：npm run build 报错 "Vite requires Node.js version 20.19+ or 22.12+"
原因：Ubuntu 24.04 默认 Node.js 是 v18.19.1
解决：通过 NodeSource 安装 Node.js 22.x
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
```

### 🔴 问题2：Nginx 配置写入权限拒绝

```
现象：sudo cat > /etc/nginx/... 报 Permission denied
原因：shell 重定向 > 是在当前用户权限下执行，sudo 只作用于 cat 命令
解决：使用 sudo tee 替代 sudo cat >
  sudo tee /etc/nginx/sites-available/keefoo > /dev/null << 'EOF'
  ...
  EOF
```

### 🔴 问题3：SSH 密码登录失败

```
现象：本地 PowerShell ssh root@IP 始终 Permission denied
原因：可能是 PowerShell 密码输入编码问题
解决：改用腾讯云 WebShell（网页终端）直接操作，效果完全一样
```

### 🔴 问题4：服务器 git clone 路径错误

```
现象：cd /home/ubuntu/keefoo/backend 报 No such file or directory
原因：首次 venv 创建在 /home/ubuntu/ 下，git clone 没执行成功
解决：确认 git clone 成功后再进入子目录
  ls keefoo/  # 先确认目录存在
```

### 🔴 问题5：Nginx 500 Internal Server Error

```
现象：部署完访问 IP 显示 500
原因：Nginx worker 进程（www-data 用户）没有权限读取 /home/ubuntu/ 目录
解决：
  sudo chmod 755 /home/ubuntu
  sudo chmod -R 755 /home/ubuntu/keefoo/frontend/dist
```

### 🔴 问题6：本地 AKShare DLL 加载失败

```
现象：import akshare 报 ImportError: DLL load failed: 应用程序控制策略已阻止此文件
原因：Windows 企业安全策略（AppLocker/WDAC）阻止 pandas C 扩展 DLL 加载
状态：⏳ 无法在本地解决，需在服务器上运行
```

### 🟡 问题7：服务器 AKShare 网络连接失败

```
现象：服务器上 akshare 调用报 ConnectionError: Remote end closed connection
可能原因：腾讯云试用服务器出站网络可能有限制
状态：⏳ 待进一步排查（测试 curl 访问东方财富等域名）
```

---

## 六、服务器管理常用命令

```bash
# 后端服务管理
sudo systemctl start keefoo-api     # 启动
sudo systemctl stop keefoo-api      # 停止
sudo systemctl restart keefoo-api   # 重启
sudo systemctl status keefoo-api    # 查看状态
sudo journalctl -u keefoo-api -n 50 # 查看后端日志（最近50行）

# Nginx 管理
sudo nginx -t                       # 测试配置是否正确
sudo systemctl restart nginx        # 重启
sudo cat /var/log/nginx/error.log | tail -20  # 查看错误日志

# 文件权限修复
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/keefoo/frontend/dist
```

---

## 七、当前项目完整数据统计

```
截止 Day 03：

代码仓库：https://github.com/swimtoland/keefoo
线上地址：http://111.229.156.79
演示账号：demo@keefoo.cn / demo123456

数据库表：12 张
API 接口：50+ 个
前端页面：12 个
前端组件：4 个（TradeWizard, Toast, AuthContext, UiPreferencesContext）
后端服务：7 个（agent, scenario, report, profile, graph, market_data, ai）

技术栈：
  后端：FastAPI + SQLAlchemy + SQLite + PyJWT + passlib + AKShare + OpenAI SDK
  前端：React 18 + Vite + Tailwind CSS v4 + axios + recharts + D3.js + lucide-react
  部署：Ubuntu 24.04 + Nginx + systemd + 腾讯云 CVM
```

---

## 八、待解决问题与下一步计划

### 🔴 优先级1（下次开发第一件事）

- [ ] 排查服务器网络出站限制（curl 测试东方财富/新浪财经域名）
- [ ] 如果试用服务器网络受限，考虑购买正式服务器或换用其他数据源
- [ ] 验证 AKShare + DeepSeek AI 在服务器上完整运行

### 🟡 优先级2（本周内）

- [ ] 购买域名（keefoo.cn 或 keefoo.com）
- [ ] ICP 备案（需要 7-15 天）
- [ ] 配置 HTTPS（Let's Encrypt 免费证书）
- [ ] 回到导航重构方案：将 10+ 导航精简为 4-5 个核心入口

### 🟢 优先级3（产品打磨）

- [ ] 全面 UI 走查：逐页面检查布局一致性
- [ ] 实现 Agent 追问的 2-4 小时延迟队列（Celery + Redis）
- [ ] 构建公共图谱（A 股全行业关系预建）
- [ ] 迁移数据库到 PostgreSQL
- [ ] 迁移图谱存储到 Neo4j
- [ ] 付费墙和订阅管理
- [ ] 微信公众号推送能力

---

## 九、三天开发总结

|维度|Day 01|Day 02|Day 03|
|---|---|---|---|
|核心产出|完整 MVP 原型|功能矩阵补齐|部署上线 + 数据接入|
|数据库表|7 张|+5 = 12 张|12 张|
|API 接口|20+|+24 = 44+|+6 = 50+|
|前端页面|8 个|+4 = 12 个|12 个|
|后端服务|5 个|5 个|+2 = 7 个|
|部署状态|本地开发|本地开发|公网上线 ✅|
|Git 状态|未初始化|未初始化|GitHub ✅|

---

> 💬 **今日感悟**：部署上线看似是最后一步，实际上暴露了开发环境和生产环境之间的巨大鸿沟——Node.js 版本差异、文件权限、Nginx 配置语法、系统安全策略、网络出站限制。这些在本地 localhost 上永远不会遇到的问题，一到真实服务器就全冒出来了。另一个认知是：对于 MVP 阶段的产品，"能在服务器上跑起来让别人访问"比"所有功能都完美"重要一百倍。先上线再迭代。

---

_📝 下次开发从排查服务器 AKShare 网络问题开始_