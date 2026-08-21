"""Dispatch helpers for routing email side effects through Celery.

Two entry points:

* ``dispatch_email(background_tasks, task, *args)`` — used by routes that
  already hold a FastAPI ``BackgroundTasks``. Tries the Celery broker first;
  when it is unreachable (or eager mode is on), falls back to the same
  process-local background task that was used before Celery, so SMTP can never
  block or fail the HTTP response.
* ``enqueue_email(task, *args)`` — used by services that have no access to a
  ``BackgroundTasks`` (e.g. the OTP service). Returns ``True`` when the task
  was accepted by the broker; ``False`` when it was not, so the caller can fall
  back to an awaited inline send.
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def enqueue_email(task, *args, **kwargs) -> bool:
    """Attempt to enqueue ``task`` on the Celery broker.

    Returns ``True`` when the broker accepted the task. Returns ``False`` when
    eager mode is enabled or the broker is unreachable, signalling the caller
    to fall back to an in-process send (eager mode cannot use ``task.delay``
    from inside a running event loop because the task body runs ``asyncio.run``).
    """
    if settings.CELERY_TASK_ALWAYS_EAGER:
        return False
    try:
        task.delay(*args, **kwargs)
        return True
    except Exception as exc:  # noqa: BLE001 - broker unreachable
        if not settings.celery_fallback_in_process:
            logger.error(
                "[Workers] Celery broker unreachable (%s); %s dropped (in-process "
                "fallback disabled in %s)",
                exc,
                task.name,
                settings.ENV,
            )
        else:
            logger.warning(
                "[Workers] Celery broker unreachable (%s); %s will fall back in-process",
                exc,
                task.name,
            )
        return False


def dispatch_email(background_tasks, task, *args, **kwargs) -> None:
    """Enqueue ``task`` on Celery, else fall back to an in-process background task.

    ``task.run`` is the task's underlying sync body; Starlette executes it in a
    threadpool where ``asyncio.run`` is safe (matches the pre-Celery behavior of
    scheduling the async service call after the response is sent).

    In production the in-process fallback is disabled by default: a broker
    outage logs an error and the task is dropped rather than silently running
    expensive async work inside the API process.
    """
    if settings.CELERY_TASK_ALWAYS_EAGER:
        background_tasks.add_task(task.run, *args, **kwargs)
        return
    try:
        task.delay(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - broker unreachable
        if not settings.celery_fallback_in_process:
            logger.error(
                "[Workers] Celery broker unreachable (%s); %s dropped (in-process "
                "fallback disabled in %s)",
                exc,
                task.name,
                settings.ENV,
            )
            return
        logger.warning(
            "[Workers] Celery broker unreachable (%s); dispatching %s in-process",
            exc,
            task.name,
        )
        background_tasks.add_task(task.run, *args, **kwargs)