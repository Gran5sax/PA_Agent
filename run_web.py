"""启动 PA Agent Web 版（FastAPI + React，本地浏览器）。

用法：
    python run_web.py                 # 默认 :8765，自动开浏览器
    python run_web.py --no-browser    # 不自动开浏览器（调试时常用）
    python run_web.py --dev           # 允许 CORS（配合 web_frontend 的 npm run dev）
    python run_web.py --port 9000     # 指定端口

等价于 ``python -m pa_agent.web``。PyCharm 里把本文件设为 Run Configuration
的 Script path 即可启动调试。
"""
from pa_agent.web.__main__ import main

if __name__ == "__main__":
    raise SystemExit(main())
