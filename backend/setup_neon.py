"""One-off: build the Neon schema using the app's own create_all path.

Reads DATABASE_URL from .env.example (the project's single source of
connection config), coerces it to the async `+psycopg` driver, runs
`init_database()` (Base.metadata.create_all), then stamps Alembic at head so
the migration chain is consistent with the live schema.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path

# psycopg (async) cannot run on Windows' ProactorEventLoop; use the selector loop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

ROOT = Path(__file__).resolve().parent


def load_neon_url() -> str:
    env_file = ROOT / ".env.example"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*DATABASE_URL\s*=\s*(.+)$", line)
        if m:
            raw = m.group(1).strip()
            # Ensure the async driver is used (config default already uses it,
            # but the example file is written in the plain psycopg form).
            if raw.startswith("postgresql://"):
                return raw.replace("postgresql://", "postgresql+psycopg://", 1)
            if raw.startswith("postgres://"):
                return raw.replace("postgres://", "postgresql+psycopg://", 1)
            return raw
    raise SystemExit("DATABASE_URL not found in .env.example")


def load_alembic_url() -> str:
    """Read sqlalchemy.url from alembic.ini (targets deliveryhub_test)."""
    ini = ROOT / "alembic.ini"
    for line in ini.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("sqlalchemy.url"):
            raw = line.split("=", 1)[1].strip()
            if raw.startswith("postgresql://"):
                return raw.replace("postgresql://", "postgresql+psycopg://", 1)
            return raw
    raise SystemExit("sqlalchemy.url not found in alembic.ini")


async def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else "env"
    url = load_neon_url() if target == "env" else load_alembic_url()
    os.environ["DATABASE_URL"] = url

    from app.database.db import init_database, close_database
    from app.core.config import settings

    print(f"Using DATABASE_URL host: {settings.DATABASE_URL.split('@')[-1].split('?')[0]}")

    await init_database()
    print("create_all completed")

    # Stamp Alembic at head so the version table matches the created schema.
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.stamp(cfg, "head")
    print("Alembic stamped at head")

    await close_database()


if __name__ == "__main__":
    asyncio.run(main())