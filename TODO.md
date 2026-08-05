# PA Agent Web 版 — 工作记录

> 把 PyQt6 桌面 GUI 迁移为「本地 FastAPI 后端 + React 前端」，与原 GUI **并存**。
> 启动：`python run_web.py` 或 `python -m pa_agent.web`（原 GUI `python -m pa_agent.main` 不变）。
> 前端开发态：`cd web_frontend && npm run dev` + `python -m pa_agent.web --dev`。
> 视觉参考：nof1.ai（白底极简、量化专业感）。

---

## 一、已完成（详细）

### 1. 后端 `pa_agent/web/`（FastAPI，零 Qt 依赖）

| 文件 | 职责 |
|---|---|
| `__main__.py` | 启动入口：argparse（`--host/--port/--no-browser/--dev`）+ `_find_free_port`（被占 +1）+ `webbrowser.open`（延迟 1.5s）+ `uvicorn.run(create_app, factory=True)` |
| `app.py` | `create_app(*, dev=False)`：lifespan 装配 `ctx` / `AnalysisBridge(ThreadPoolExecutor(max_workers=4))` / `SessionRegistry`；挂载 health/kline/analysis/chat/settings/records 路由 + SPA 静态 serve；dev 模式开 CORS（仅 localhost:5173） |
| `bootstrap.py` | `web_bootstrap()`：复用 `AppContext.bootstrap()`，注入 Qt-free shim（`NullEventBus` + `WebTokenLedger`，按 settings 的 context_window/warn_pct 构造） |
| `shims.py` | `NullEventBus`（满足 `PendingWriter.emit(name,data)` no-op）；`WebTokenLedger`（`add/breakdown/reset/context_used` 拉模式接口，镜像 `SessionTokenLedger` 字段） |
| `bridge.py` | **核心** `AnalysisBridge`：线程池跑同步 `TwoStageOrchestrator.submit()`，8 个回调经 `loop.call_soon_threadsafe(queue.put_nowait, msg)` 投递 `asyncio.Queue`，WS 协程消费转发；`cancel(aid)` 协作式 `CancelToken.set()`（下一 chunk 边界生效）；`run_chat`/`_run_chat_turn` 锚定 `_last_record` 跑 `FreeChatSession`；**增量分析**调 `find_latest_successful_record` + `compute_incremental_bar_delta`；order-opportunity 判断内联（保持无 Qt，不 import `gui`）；支持 `orchestrator_factory` 注入（测试用 FakeOrchestrator） |
| `data_source.py` | 运行时切换 `ctx.data_source`：`ensure_data_source(kind)`（不同则 disconnect 旧的 + create + connect）+ `ensure_subscribed(symbol,tf)`；模块级锁 + `_state`，kline 与 bridge 共享同一订阅 |
| `sessions.py` | `SessionRegistry`：analysis_id/session_id → `CancelToken` 的注册/取消/释放 |
| `static_serve.py` | `mount_spa(app)`：挂载 `static_dist/assets` + catch-all `/{full_path:path}` 回 `index.html`（排除 `api/`/`ws/`/`docs`，避免劫持 API） |
| `deps.py` | `get_ctx(request)` 依赖：返回 `request.app.state.ctx` |
| `schemas.py` | Pydantic 响应模型：`KlineBarOut`/`KlineResponse`/`SymbolsResponse`/`TimeframesResponse`/`HealthResponse`/`DataSourceInfo`/`DataSourcesResponse` |
| `api/kline.py` | `GET /api/kline?source&symbol&timeframe&n`（`build_display_frame` + forming bar 分离）、`/api/symbols`、`/api/timeframes`、`/api/data-sources`（7 源，**东方财富+AkShare 标 primary 置前**）；所有同步数据源调用走 `asyncio.to_thread` |
| `api/analysis.py` | `WS /ws/analyze`（收 start → `bridge.run_analysis`）+ `POST /api/analyze/cancel` |
| `api/chat.py` | `WS /ws/chat`（收 start → `bridge.run_chat`） |
| `api/settings.py` | `GET /api/settings`（api_key 脱敏，只返回 `has_api_key`）；`PUT /api/settings`（partial 更新，非空 api_key 覆盖，provider 变化时 `create_ai_client` 原地重建 client，`save_settings` 落盘） |
| `api/records.py` | `GET /api/records`（`list_record_paths` → 摘要列表）、`GET /api/records/{id}`（`load_record` → 完整 AnalysisRecord JSON，供回放） |
| `api/health.py` | `GET /api/health`（status + `provider_api_key_configured` + data_source/symbol/timeframe） |

**WS 协议**（`/ws/analyze`）：客户端 `{"type":"start", analysis_id, source, symbol, timeframe, bar_count, incremental}`；服务端按时序推 `analysis_started → lifecycle(OrchestratorEvent.name) → stage_prompt → reasoning_chunk/content_chunk(stage1) → Stage1Done → stage2_files → reasoning_chunk/content_chunk(stage2) → Stage2Done → record_ready → order_opportunity? → error/cancelled`。

### 2. 前端 `web_frontend/`（React 18 + Vite 5 + TypeScript + lightweight-charts 5 + zustand 4）

| 模块 | 职责 |
|---|---|
| `api/types.ts` | TS 类型镜像后端：`KlineBar/KlineResponse/HealthResponse/DataSourceInfo/DataSourcesResponse/RecordSummary/Decision/DiagnosisSummary/Stage2Record/AnalysisRecord/TraceItem/Terminal` |
| `api/client.ts` | REST 封装：health/dataSources/kline/symbols/timeframes/getSettings/putSettings/records/record |
| `api/ws.ts` | `openWs(path,...)` 通用 + `openAnalyzeWs`/`openChatWs` |
| `hooks/useKline.ts` | K线获取 + 静默自动刷新（`autoRefresh`，5s setInterval，不闪烁） |
| `hooks/useAnalysisStream.ts` | `/ws/analyze` 驱动：发 start、消息分发到 store、`POST /api/analyze/cancel` |
| `hooks/useChatStream.ts` | `/ws/chat` 驱动：首次 send 时 ensureOpen、按轮累积 reasoning/content、cancel |
| `store/analysisStore.ts` | zustand：按 `(stage, field)` 累积 chunk、lifecycle→phase 映射、record/orderAlert/error |
| `pages/WorkbenchPage.tsx` | 主工作台：左图表 + 右侧栏（FlowBar/DiagnosisSummary/DecisionPanel/DecisionTree/StreamPanel/FreeChat/RecordsPanel）+ ControlBar + OrderAlert + SettingsDialog |
| `components/control/ControlBar.tsx` | 数据源下拉（主源标记）/品种/周期/根数 + 获取数据/提交分析/取消 + 「实时」开关 + 「⚙设置」 |
| `components/chart/KlineChart.tsx` | lightweight-charts：Candlestick + EMA20 LineSeries + forming bar `update` + 决策 `createPriceLine`（Entry/TP1/TP2/SL 虚线，随 decision 增删） |
| `components/stream/StreamPanel.tsx` | 两阶段流式（reasoning/content 分区 `<details>`，带字数统计）+ 策略文件 + error |
| `components/stream/FlowBar.tsx` | 5 步进度（数据/快照/诊断/决策/追问），按 lifecycle 推断 active |
| `components/decision/DecisionPanel.tsx` | order_type/方向 badge + 价格表（入场/止损/TP1/TP2/盈亏比/胜率）+ reasoning + watch_points + invalidation |
| `components/decision/DiagnosisSummary.tsx` | cycle_position/direction/key_signals chips |
| `components/decision/DecisionTree.tsx` | 决策路径降级表格（decision_trace + terminal） |
| `components/decision/OrderAlert.tsx` | 下单机会 toast（store.orderAlert 驱动，非模态） |
| `components/chat/FreeChat.tsx` | 追问输入 + 多轮流式回答（reasoning 折叠 + content）+ 停止 |
| `components/settings/SettingsDialog.tsx` | provider 表单（base_url/model/api_key 脱敏/thinking/reasoning_effort）+ 保存 |
| `components/records/RecordsPanel.tsx` | 历史记录列表 + 点击回放（载入 record → store，决策面板复用渲染） |
| `vite.config.ts` | dev proxy `/api`+`/ws` → 127.0.0.1:8765；build outDir → `pa_agent/web/static_dist` |
| `styles.css` | nof1.ai 风格：系统无衬线字体栈、白底、紧凑专业；stream/flow/decision/dialog/chat/records 全套样式 |

### 3. Qt 解耦（非破坏性，GUI 零影响）

- `pa_agent/app_context.py`：`AppContext.bootstrap(*, event_bus=None, ledger=None)` 加可选注入参数；`EventBus` / `SessionTokenLedger` 的 import 从顶部移到 `if is None` 块内（延迟）→ **web 进程完全不 import PyQt6**，GUI 默认路径（无参调用）行为不变
- web 注入 `NullEventBus` / `WebTokenLedger`（duck-type），`AppContext` 字段类型是 `Any`，orchestrator/pending_writer/free_chat 只调方法不查类型，完全兼容
- `RefreshLoop`(QThread) 不复用——web 用前端轮询替代

### 4. 配置 / 启动 / 依赖

- `pyproject.toml`：新增 `[web]` 可选依赖组（`fastapi>=0.110` / `uvicorn[standard]>=0.29` / `websockets>=12` / `anyio>=4`）+ console script `pa-agent-web` + dev 组补 `pytest-asyncio>=0.23`；`uv.lock` 已同步
- `run_web.py`（项目根）：PyCharm 友好启动入口，调 `pa_agent.web.__main__:main`
- `config/settings.json`：默认 provider 已配 DeepSeek（`model=deepseek-reasoner` + api_key）；该文件 `.gitignore` 不入库
- 前端 `package.json`：react18/react-dom/lightweight-charts5/zustand4/clsx + vite5/typescript5（dev）

### 5. 验证过的硬指标

- web_bootstrap 产出的 `event_bus` / `ledger` 实例 `isinstance(QObject)` 为 **False**（零 Qt）
- 东方财富实测拉到 `000001` 30 根日线，`close=11.11`，**EMA20 全 30 根 non-NaN**（warmup 逻辑正确）
- bridge 消息时序（FakeOrchestrator）：`analysis_started → lifecycle → stage_prompt → reasoning/content(stage1) → Stage1Done → stage2_files → reasoning/content(stage2) → Stage2Done → record_ready → order_opportunity`，完全符合协议
- 真实 WS `/ws/analyze`：收到 `analysis_started → lifecycle(Stage1Started) → stage_prompt`；无 key 时正确推 `error(OpenAIError: Missing credentials)` 且不崩溃
- WS `/ws/chat`：无 record 时正确返回「请先完成一次两阶段分析再追问」
- 增量路径（`incremental=true`）无历史 record 时回退全量，不崩
- order-opportunity 触发正确（限价单 + trade_confidence≥阈值）
- settings GET/PUT 往返：PUT `reasoning_effort=medium` → `{"ok":true}` → GET 确认生效
- `GET /api/records` → `{"records":[]}`；openapi 确认 9 条 REST 路由 + 2 个 WS 全注册
- DeepSeek 官方 key + `deepseek-reasoner` 实测：`reasoning_chunk` 思考流真实流式返回
- 前端 `tsc -b && vite build` 通过（68 modules，JS ~336KB / gzip ~109KB）
- SPA serve：`/` → 200 html、`/api/*` 共存、客户端路由 → fallback、`/api/none` → 404（不被 SPA 劫持）
- 原 GUI 入口 `python -m pa_agent.main` 仍可正常启动（并存验证）
- 回归：`test_cost_and_ledger` / `test_switch_mid_analysis` 通过；GUI import 链未断

### 6. K线图增强：指标副图 + hover tooltip

- **hover tooltip**（`KlineChart.tsx`）：`crosshair:{mode:Normal}` + `subscribeCrosshairMove` → 绝对定位 div 显示 时间/OHLC/涨跌额幅/成交量 + 当前指标值（量/K·D·J/主力）；`param.point===undefined` 隐藏，自动边界避让。
- **指标副图**（K线下方 pane 1，下拉菜单切换；`panes()[0/1].setStretchFactor(0.75/0.25)`）：
  - **VOL 成交量**：`bar.volume` 直取 `HistogramSeries`（涨绿跌红，跟 K线配色），全数据源支持，纯前端零后端。
  - **KDJ**：`utils/indicators.ts:kdjFull`(9,3,3, K/D 初值 50) + 3 条 `LineSeries`（K 蓝/D 橙/J 紫），纯前端。
  - **主力资金**：后端新增 `GET /api/money-flow`（`asyncio.to_thread` 复用 `eastmoney_extended.fetch_money_flow_klines` klt=101 日K，纯函数自发 curl_cffi HTTP、不依赖 ctx）；前端按 `date` 对齐 K线 time（`Date.UTC`）画主力净流入柱（正红负绿）。**仅 A 股个股 + 日线**，非此情形副图显示「主力资金仅支持 A 股个股日线」占位。
  - 切「无」→ `removePane(1)` 主图占满；副图 effect 依赖 `closedCount` 而非整个 data，避免 5s autoRefresh 重建闪烁；flow 用独立 effect（按 symbol/timeframe/source/closedCount 去 fetch，不随 forming bar 抖动）。
- **文件**：后端 `pa_agent/web/api/money_flow.py`（新）、`app.py`；前端 `KlineChart.tsx`（大改）、`WorkbenchPage.tsx`（indicator state + main-tabs 内 select）、`utils/indicators.ts`（加 KDJ）、`api/{client,types}.ts`（moneyFlow）、`styles.css`（chart-wrap/tooltip/select）。
- **验证**：`tsc -b && vite build` 通过（221 modules）；`/api/money-flow?symbol=000001&lmt=5` 实测返回 5 条 main_net/pct 真实数据，非 A 股（XAUUSDm）返回空。

---

## 二、未完成 / 后置

### 功能后置（非核心闭环必需）
- [ ] **keep_analysis 持续跟踪**：新 K 线收盘自动触发新一轮分析（GUI 有，web 未做）
- [x] **决策树可视化**：react-flow 交互式静态树（`DecisionFlowViz.tsx` + `GET /api/decision-tree`），主区与 K线 tab 切换，点击节点高亮根→节点路径 + 缩放/平移；侧栏降级表保留
- [x] **演示回放器**：点历史记录 `loadRecord` 一次性回填流式文本/策略文件/prompt/决策，K线用 record.kline_data 客户端重算 EMA20/ATR14（`utils/indicators.ts`），「↩ 返回实时」切回
- [x] **飞书 / PushPlus 推送**：`bridge._spawn_order_notify` 在 order_opportunity 时起 daemon 线程调 `send_order_signal`（复用 GUI 模板，web 无图表 → 飞书降级纯文字卡片）；webhook/token 在 settings.json 配，`pyproject [web]` 补 requests
- [ ] **实时 K线 WebSocket**：当前为前端轮询（`useKline` autoRefresh，5s），未做 `WS /ws/kline` 服务端推送

### 技术债 / 健壮性
- [ ] **多窗口并发隔离**：data_source 是有状态单例（单订阅），同一浏览器开多 tab 切不同品种会互相干扰；多订阅需 data_source 多实例化
- [ ] **web 层正式 pytest 套件**：当前是 FakeOrchestrator + 真实 WS 脚本验证，未落 `tests/`（bridge / sessions / shims / REST / WS 协议时序，用 pytest-asyncio + httpx）
- [ ] **GUI 纯函数双份维护**：`has_order_opportunity` 等在 web 内联镜像（避免 import `gui` 触发 Qt）；宜提取到非 gui 模块（如 `util/`）让 gui 与 web 共用，消除双份
- [ ] **错误提示打磨**：网络错误 / 配额耗尽 / 校验失败的前端友好提示（当前 StreamPanel 仅显示 error 文本）

### 待处理（非本次引入）
- [ ] **预先存在的测试失败**：全量 `pytest -m "not e2e"` 约 25 个失败（`deepseek_client` / `stage2_normalizer` / `order_opportunity` / `json_validator` / `free_chat_*`），已用 `git stash` 回干净 HEAD 确证**与 web 迁移无关**（仓库既有，疑似依赖版本漂移或 mock 与新 SDK 不匹配）；建议单独排查

### 待人工验证
- [ ] **浏览器端到端完整跑一次**：配 DeepSeek key 后在浏览器走「获取数据 → 提交分析 → 看流式 + 决策 + 图表决策线 → 追问 → 历史回放」，确认交互/视觉无异常（自动化只验到 WS 协议层）
- [ ] **K线增强浏览器验证**：hover 任意 K线显示 时间+OHLC+涨跌+成交量；副图下拉切 VOL/KDJ/主力资金/无 正常；主力资金在「东方财富+A股代码+日线」画出净流入柱，在 mt5/XAUUSDm 或分钟周期显示「仅支持 A 股日线」占位（主力资金需重启 web 服务才有 `/api/money-flow`）

### 建议优先级
1. web 层正式测试（质量保障）
2. 提取共享纯函数（消技术债）
3. keep_analysis（功能补齐）
4. 排查预存测试失败（仓库健康）
