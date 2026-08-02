
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PA Agent 是一个 **价格行为（Price Action）AI 辅助决策工具**，从数据源（MT5 / TradingView / AkShare / EastMoney / Baostock / Tushare / yfinance）读取结构化 K 线与预计算特征，喂给大模型做**两阶段分析**：阶段一「市场诊断」→ 阶段二「交易决策」。

提供**两套并存的 UI**（共享同一后端分析层 `AppContext`，互不影响）：
- **PyQt6 桌面 GUI**（`python -m pa_agent.main`）—— 原生窗口，pyqtgraph K线 + 赛博风决策树可视化。
- **Web 版**（`python run_web.py` 或 `python -m pa_agent.web`）—— 本地 FastAPI + React，浏览器访问；详见下文「Web 版」章节。macOS 无 MT5 时用 Web 版 + 东方财富/AkShare 最顺。

**硬性边界（务必记住）**：
- 不做截图识图 —— 送入模型的是 K 线表 + 特征表，不是图片。
- **不连接券商、不执行下单** —— 阶段二只产出一个 `decision` JSON（限价单 / 突破单 / 市价单 / 不下单），并在「决策面板」与图表上展示。如果要做实盘下单，需要新增一个消费该 decision 的模块（见下文「自定义交易逻辑」第 7 层）。

语言：代码与注释英文，用户面向文档/提示词中文。回复用中文，技术术语保持英文。

## 常用命令

```bash
# 安装（推荐 editable + dev 依赖）
pip install -e ".[dev]"

# 启动 GUI（PyQt6，三选一）
python -m pa_agent.main      # 入口：pa_agent/main.py:main
python run.py                # 含 Spyder/Jupyter 内核检测，会自动 fork 独立进程
pa-agent                     # console script（pyproject [project.scripts]）

# 启动 Web 版（FastAPI + React，本地浏览器，与 GUI 并存）
pip install -e ".[web]"                  # 装 fastapi/uvicorn/websockets/anyio
python run_web.py                        # 项目根启动入口（PyCharm 友好，等价下行）
python -m pa_agent.web                   # 起 127.0.0.1:8765 并自动开浏览器
pa-agent-web                             # 等价 console script
#   常用参数：--no-browser（调试不弹浏览器）/ --dev（前端热更新时开 CORS）/ --port 8765
# 前端开发态（热更新）：cd web_frontend && npm install && npm run dev，另起 python -m pa_agent.web --dev
# 前端生产构建：cd web_frontend && npm run build → 产物 pa_agent/web/static_dist/ 由 FastAPI serve

# 测试
pytest -q                              # 全量
pytest -m "not e2e"                    # 提交前推荐（CONTRIBUTING 要求）
pytest tests/unit/test_router.py       # 单文件
pytest tests/unit/test_router.py::test_xxx   # 单用例
pytest -m property                     # 仅 hypothesis 属性测试

# lint / format
ruff check . && black --check .        # line-length=100, py311

# uv 隔离环境（依赖由 uv.lock 锁定，可复现）
make uv-run        # 自动建 .venv 并同步依赖，然后启动
make uv-test
make uv-lint
```

测试 markers：`unit` / `property`（hypothesis）/ `integration` / `e2e` / `live`（需真实 API key，经环境变量注入，**绝不读 config/settings.json**）。

依赖注意：`MetaTrader5`、`pywin32` 仅 Windows 安装（`sys_platform == 'win32'`）；macOS 上只能用 TradingView / AkShare / EastMoney / Tushare 数据源。

## 架构总览

### 启动与依赖装配
`pa_agent/main.py` → `QApplication` → `AppContext.bootstrap()`（`app_context.py`）。`AppContext` 是一个 **dataclass 容器，无全局单例**：把 `settings`、`data_source`、`client`、`assembler`、`router`、`validator`、`pending_writer`、`exp_reader`、`ledger`、`event_bus` 装配好后传给 `MainWindow(ctx)`。所有跨模块协作都经 `ctx` 显式传递——**不要新增模块级全局状态**。

### 数据层 `pa_agent/data/`
- `base.py` 定义核心类型：`KlineBar`（单根 OHLCV，`seq` 从 1 开始，0=未收盘 forming bar）、`KlineFrame`（不可变快照，`bars[0]` 最新）、`IndicatorBundle`（EMA20/ATR14）、`DataSource`（ABC）。
- `factory.py:create_data_source(kind)` 按设置分发；具体实现：`mt5.py`、`tradingview.py`（tvdatafeed）、`akshare_source.py`、`eastmoney_source.py` / `eastmoney_futures_source.py`、`tushare_source.py`、`yfinance_source.py`。
- `snapshot.py` / `refresh_loop.py` / `bar_close_wait.py` 负责快照与收盘等待（`keep_analysis` 依赖）。

### 两阶段分析管线 `pa_agent/orchestrator/two_stage.py`
`TwoStageOrchestrator.submit(frame, cancel_token, on_event, ...)` 是核心入口，9 步流水线（见文件顶部 docstring）：
1. `PromptAssembler.build_stage1` 组阶段一 prompt → 2. 调 `DeepSeekClient`（流式）→ 3. `JsonValidator` 校验阶段一 JSON → 4. `route_strategy_files(stage1_json)` 路由策略文件 → 5. 加载经验库 → 6. `build_stage2` 组阶段二 prompt → 7. 调模型 → 8. 校验阶段二 JSON → 9. `PendingWriter` 落盘 `AnalysisRecord`。
全程经 `CancelToken` 检查；网络错误被捕获并写入 partial record。校验失败时 `validation_retry.py` 会附 feedback 重试（仅格式错误 category a 重试；语义/安全错误不重试）。

### Prompt 组装层 `pa_agent/ai/prompt_assembler.py`（116KB，核心）
`PromptAssembler` 把 `prompt_engineering/*.txt` + K 线表 + 特征表 + 经验库拼成 message list。关键分组常量（改文件名会破坏路由/缓存）：
- `COMMON_SYSTEM_STAGE1/2_TXT_FILES` = `提示词大纲_人设与思维方式.txt` + `二元决策.txt`（两阶段共享 system prefix，为 DeepSeek KV cache 命中须字节一致 → `_SYSTEM_PROMPT_CACHE`）。
- `二元决策.txt`（42KB）是**整套交易决策树（§0–§14 闸门）的 prompt 形态**，是交易逻辑的核心知识。
- `市场诊断框架.txt`（85KB）是阶段一诊断框架。
- `STAGE2_BASE_PROMPT_TXT_FILES` = 逐棒检查单 + 文件16（信号识别）+ 文件17（止损止盈仓位）+ 文件23（Measured Move），阶段二常驻。
- `ai/prompts/schemas.py`：`STAGE1_SCHEMA` / `STAGE2_SCHEMA` / `_DECISION_BASE` —— 模型必须遵守的 JSON 契约。

### 校验与归一化 `pa_agent/ai/`
- `json_validator.py`（43KB）：JSON schema 校验 + 截断修复。
- `stage1_normalizer.py` / `stage2_normalizer.py`：模型输出在 schema 校验前/后做归一化（如 RR≥1.0 时自动外扩 stop、三价一致性、decision 与 trace 对齐）。`lenient`/`strict` 模式由 `validation.normalization_mode` 控制。
- `coherence_checks.py` / `trace_semantic_checks.py`：跨字段一致性、语义冲突检测（默认关，开关在 `validation.*`）。
- `decision_nodes.py`（93KB）：§0–§14 决策树节点的程序化定义，供决策树可视化（`decision_tree_panel.py`）与 preflight 检查复用。
- `router.py` + `pattern_routing.py`：见下文「自定义交易逻辑」第 3 层。

### 记录持久化 `pa_agent/records/`
`schema.py:AnalysisRecord`（含 `meta` / `kline_data` / 两阶段 prompt+raw response / 诊断+决策 JSON / token 用量 / 异常）。落盘到 `records/pending/`；`experience_reader.py` 按 `cycle_position` 从 `experience/` 检索历史案例；`trade_logger.py` 写 `trade_records/`。

### GUI 层 `pa_agent/gui/`
`MainWindow` 左侧 K 线图（`chart_widget.py` + pyqtgraph），右侧 `ai_sidebar.py` 六标签页：实时流（stream）、决策（decision）、决策树（decision_tree）、决策树可视化（decision_flow_viz）、未来走势（future_trend）、提示词文件（prompt_files —— **显示每轮实际加载了哪些 .txt，调试自定义逻辑必备**）。

## 自定义交易逻辑的位置（重点）

按「改动量从小到大 / 离代码由远到近」分层。前几层只改文本或配置，不动 Python：

1. **交易倾向档位（纯配置，GUI 设置即可）** — `general.decision_stance`（`config/settings.json`）：`conservative` / `balanced` / `aggressive` / `extreme_aggressive`。`general.decision_confidence_threshold` 控制只有 `trade_confidence ≥ 阈值` 才弹「下单机会」警报。
2. **策略知识 / Playbook（纯文本，无代码）** — `prompt_engineering/*.txt`。这是交易逻辑的**主体知识库**。改「如何找入场、设止损止盈、风控」就直接编辑对应文件，例如 `文件17-止损和止盈与仓位管理.txt`、`上涨通道交易策略.txt`、`二元决策.txt`（决策树总纲）。**保持文件名不变**——`router.py` 与 `prompt_assembler.py` 按文件名引用，改名需同步多处。
3. **路由「什么诊断 → 加载哪些策略」** — `pa_agent/ai/router.py` 的纯函数 `route_strategy_files(stage1_json)`（cycle_position/direction/patterns → 文件列表）；`pattern_routing.py` 的 `_PATTERN_KEYWORD_TAGS` / `ENTRY_SETUP_TYPE_PATTERN_OVERLAY`（形态标签 key → 触发的文件）。新增一种自定义形态：①在 `prompt_engineering/` 加策略 txt → ②在 `pattern_routing.py` 加 keyword→tag 映射 → ③在 `router.py` 加 `if "your_tag" in patterns: files.append(...)` → ④把文件名加入 `_ALL_VALID_FILES`。
4. **决策档位的文字画像** — `pa_agent/ai/decision_stance.py:build_decision_stance_guidance()`：四个档位各自注入阶段二的具体规则文本（保守偏观望、极度激进强制产出交易等）。`decision_continuity.py`：方案连续性、同结构位 N 根内禁止反手（冷却根数 `general.structure_flip_cooldown_bars`）。
5. **输出契约 / 「下单」长什么样** — `pa_agent/ai/prompts/schemas.py` 的 `_DECISION_BASE` / `STAGE2_SCHEMA`：`order_type`、`order_direction`、`entry/stop/target`、`estimated_win_rate` 等字段定义。改 decision 结构须同步 schema + `stage2_normalizer.py` + GUI `decision_panel.py`。
6. **后处理规则** — `stage2_normalizer.py`（RR 计算、stop 外扩、三价校验）、`coherence_checks.py`、`trace_semantic_checks.py`。改下单的数值约束在这层。
7. **实盘执行（项目目前没有，需自行接入）** — 阶段二产出的 `decision` JSON + `gui/order_opportunity.py` 的 `AlarmPayload` 是天然的挂载点；新增一个 broker 桥接模块订阅 `event_bus` 的下单机会事件即可。**当前仓库刻意不碰下单**，新增前与维护者确认。

调试自定义效果：跑一次分析后看 GUI「提示词文件」标签页（确认加载了哪些 .txt）、看 `logs/pa_agent.log`（路由决策有 warning/info）、看落盘的 `records/pending/*.json`（完整 prompt + 两阶段 JSON）。

## 关键约定

- **路径**：永远 `from pa_agent.config.paths import ...`（`PROMPT_DIR` / `SETTINGS_JSON_PATH` / `RECORDS_PENDING_DIR` / `EXPERIENCE_DIR` / `LOGS_DIR`），不要硬编码。
- **配置**：`config/settings.json` 是运行时文件，**已 gitignore，不提交**；模板 `config/settings.example.json`。结构见 `config/README.md`，由 `pa_agent/config/settings.py` 的 pydantic 模型定义（`provider` / `general` / `prompt` / `validation` / `feishu` / `pushplus` / `tushare`）。
- **密钥**：API key 经 GUI 保存时加密写入 `provider.api_key_encrypted`；明文 key 仅内存中。日志会 mask key（`util/mask_secret.py`）。**绝不**把 `settings.json` / `exception_state.json` / `tv_symbol_aliases.json` / `.env` 提交。
- **不提交的运行数据**：`records/`、`experience/`（内容）、`logs/`、`trade_records/`、根目录临时图片/笔记。仅源码、`prompt_engineering/`、`tests/`、`docs/` 进 Git。
- **测试优先**：改了 `router` / `normalizer` / `decision` 相关代码，必须跑对应 `tests/unit/`（项目有 80+ 单测，覆盖 router、normalizer、stance、coherence、schema 等）。改了 prompt 文件可跑 `tests/unit/test_prompt_txt_files.py` / `test_prompt_assembler.py` 验证文件齐全。
- **代码风格**：black + ruff，line-length 100，target py311。ruff 启用 `E,F,I,UP,B,SIM,RUF`，忽略 `E501`。
- **AGPL-3.0**：开源协议，分发修改须遵守。

## Web 版（FastAPI + React，与 PyQt6 GUI 并存）

另一套 UI：本地 FastAPI 后端 + React SPA（`web_frontend/`），`python run_web.py` / `python -m pa_agent.web` 启动后自动开浏览器（PyCharm 里把 `run_web.py` 设为 Script path 即可调试）。两套 UI 共享同一后端分析层（`AppContext`），互不影响。默认 provider 已在 `config/settings.json` 配 DeepSeek（`model=deepseek-reasoner` + api_key，gitignore 不入库）；网页「⚙ 设置」可改。

- **后端** `pa_agent/web/`：`app.py`（FastAPI + lifespan）、`bootstrap.py`（`web_bootstrap()` 注入 Qt-free shim）、`bridge.py`（`AnalysisBridge`：线程池跑同步 `TwoStageOrchestrator.submit()` + `asyncio.Queue` + `loop.call_soon_threadsafe` 桥接 8 回调到 WebSocket；`run_chat` 锚定 `_last_record` 跑 `FreeChatSession`）、`data_source.py`（运行时切数据源）、`sessions.py`（CancelToken 注册表）、`api/{kline,analysis,chat,settings,records,health}.py`。
- **Qt 解耦**：`AppContext.bootstrap(*, event_bus=, ledger=)` 接受可选注入；web 传 `NullEventBus`/`WebTokenLedger`（`shims.py`，duck-type），**web 进程零 Qt**。GUI 默认路径不变。
- **数据源**：`GET /api/data-sources` 返回 7 源，**东方财富 + AkShare 标记 primary 置前**；`/api/kline?source=` 运行时切换 `ctx.data_source`。所有同步数据源调用走 `asyncio.to_thread`，不阻塞事件循环。
- **流式协议**：`WS /ws/analyze`（start → lifecycle/stage_prompt/reasoning_chunk/content_chunk/stage2_files/record_ready/order_opportunity/error）、`WS /ws/chat`（追问）、`POST /api/analyze/cancel`（协作式 CancelToken，下一 chunk 边界生效）。增量分析复用 `records/analysis_history.py`。
- **前端** `web_frontend/`（React+Vite+TS）：lightweight-charts K线、zustand 流式状态、`useAnalysisStream`/`useChatStream`/`useKline`（含实时轮询）、决策面板/决策树降级/下单警报/设置对话框/记录回放。`vite.config.ts` proxy `/api`+`/ws`。
- **已完成 / 未完成清单**：详见根目录 `todo.md`（后置项含 keep_analysis 持续跟踪、赛博风决策树动画、演示回放器、飞书/PushPlus 推送、实时 K线 WS、web 层正式测试、多窗口并发隔离等）。多窗口并发受 data_source 单订阅限制（单用户场景够用）。

> web 后端**不 import `pa_agent.gui.*`**（gui 包 import PyQt6）；需要的纯逻辑（如 `has_order_opportunity`）在 web 内联镜像，保持 web 无 Qt。改 `gui/` 纯函数时同步检查 `web/` 镜像。