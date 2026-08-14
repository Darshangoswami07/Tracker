"""Local development server entrypoint.

Configures the Windows event loop *before* uvicorn starts so psycopg (async)
can run: uvicorn creates the loop before it imports the app, so the policy must
be set here rather than in ``main``. Equivalent to
``uvicorn main:app --reload`` (and works without ``--reload`` on Windows too).
"""
from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
