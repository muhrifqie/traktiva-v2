"""Traktiva's frozen entry point for flow2api (PyInstaller sidecar).

flow2api checks its own runtime by re-running the interpreter (`python -c ...`, `python -m playwright install`).
Frozen, the "interpreter" is this exe, so those calls would start a second server. They are answered here:
the captcha browser is the PC's Chrome (BROWSER_EXECUTABLE_PATH, set by Traktiva), nothing to install.
"""

import os
import sys

if len(sys.argv) > 1 and sys.argv[1] == "-c":
    # flow2api's "is chromium installed?" probe prints the browser path and checks it exists
    print(os.environ.get("BROWSER_EXECUTABLE_PATH", ""))
    sys.exit(0)
if len(sys.argv) > 1 and sys.argv[1] == "-m":
    sys.exit(0)  # pip / playwright install: everything ships inside the bundle

import uvicorn  # noqa: E402

from src.core.config import config  # noqa: E402
from src.main import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host=config.server_host, port=config.server_port, reload=False, log_level="info")
