"""Entry point for ``python -m backend`` or ``python .`` from the backend dir.

Sets the Windows SelectorEventLoop policy BEFORE uvicorn creates its loop,
so psycopg 3 async connections work on Windows.
"""
import asyncio
import sys
import os

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

os.chdir(os.path.dirname(os.path.abspath(__file__)))


async def _serve():
    import uvicorn

    config = uvicorn.Config("main:app", host="127.0.0.1", port=8099, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(_serve())
