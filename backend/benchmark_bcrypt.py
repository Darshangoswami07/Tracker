"""Benchmark bcrypt.checkpw independently — measure CPU cost before any changes."""
import asyncio
import statistics
import time

import bcrypt


def make_hash(password: str = "TestPassword123!", rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("utf-8")


def bench_single(password: str, password_hash: str) -> float:
    """Single synchronous bcrypt.checkpw call. Returns latency in seconds."""
    t0 = time.perf_counter()
    bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    return time.perf_counter() - t0


def bench_sequential(n: int, password: str, password_hash: str) -> list[float]:
    """N sequential bcrypt.checkpw calls."""
    return [bench_single(password, password_hash) for _ in range(n)]


async def bench_concurrent(n: int, password: str, password_hash: str) -> dict:
    """N concurrent bcrypt.checkpw calls via asyncio (no executor — raw sync)."""
    loop = asyncio.get_running_loop()
    latencies = []
    errors = 0

    async def one_call():
        nonlocal errors
        # Run sync bcrypt on the event loop directly (simulates current broken behavior)
        t0 = time.perf_counter()
        try:
            await loop.run_in_executor(None, bcrypt.checkpw, password.encode("utf-8"), password_hash.encode("utf-8"))
            latencies.append(time.perf_counter() - t0)
        except Exception:
            errors += 1
            latencies.append(time.perf_counter() - t0)

    tasks = [one_call() for _ in range(n)]
    await asyncio.gather(*tasks)
    return {"n": n, "latencies": latencies, "errors": errors}


def main():
    password = "TestPassword123!"
    rounds = 12
    print(f"=== BCRYPT BENCHMARK (rounds={rounds}) ===\n")

    # Hash a password
    print("Generating hash...")
    h = make_hash(password, rounds)
    print(f"Hash prefix: {h[:29]}...\n")

    # 1. Single call latency
    single = bench_single(password, h)
    print(f"Single call: {single:.4f}s ({single*1000:.1f}ms)")

    # 2. Sequential N calls
    for n in [1, 5, 10, 25, 50]:
        times = bench_sequential(n, password, h)
        total = sum(times)
        avg = statistics.mean(times)
        med = statistics.median(times)
        print(f"Sequential {n:>2d}: total={total:.3f}s  avg={avg:.4f}s  med={med:.4f}s")

    # 3. Concurrent via run_in_executor (what the fix will do)
    print("\n--- Concurrent via run_in_executor (thread pool) ---")
    for n in [1, 5, 10, 25, 50]:
        result = asyncio.run(bench_concurrent(n, password, h))
        lats = sorted(result["latencies"])
        p50 = lats[len(lats)//2]
        p95 = lats[int(len(lats)*0.95)]
        p99 = lats[min(int(len(lats)*0.99), len(lats)-1)]
        print(f"  c={n:>2d}: wall={max(lats):.4f}s  p50={p50:.4f}s  p95={p95:.4f}s  p99={p99:.4f}s  err={result['errors']}")


if __name__ == "__main__":
    main()
