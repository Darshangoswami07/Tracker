"""
DeliveryHub Baseline Load Test — Locust Script
================================================
MEASUREMENT ONLY — no code/schema/config modifications.

Targets:
  1. GET /health                         (no auth, no DB, rate-limit whitelisted)
  2. GET /api/v1/registration/companies   (no auth, DB read, rate-limited 60/min)
  3. GET /api/v1/admin/dashboard/stats    (admin auth, 14 concurrent DB queries, rate-limited)
  4. GET /api/v1/admin/orders             (admin auth, DB listing, rate-limited)
  5. GET /api/v1/users/me                 (admin auth, DB read, rate-limited)

Run:
  locust -f baseline.py --headless -u <users> -r <spawn_rate> --run-time <time>
  locust -f baseline.py   (web UI on :8089)

Environment:
  TARGET_HOST  — default https://tracker-m0id.onrender.com
  TEST_EMAIL   — admin email for authenticated endpoints
  TEST_PASSWORD — admin password for authenticated endpoints
"""
from __future__ import annotations

import json
import os
import time
from locust import HttpUser, between, events, task
from locust.runners import MasterRunner

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TARGET_HOST = os.getenv("TARGET_HOST", "https://tracker-m0id.onrender.com")
TEST_EMAIL = os.getenv("TEST_EMAIL", "abhiyanshbisht@gmail.com")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "12345678")

# Rate limit: 60 req/min per IP per path (except /health which is whitelisted)
# We intentionally stay within or slightly above the limit to measure the
# rate-limiter impact.  Aggressive tests above 60 req/min will get 429s —
# that IS part of the baseline (the rate limiter is a real constraint).
RATE_LIMIT = 60  # requests per 60 seconds per path


class HealthUser(HttpUser):
    """Unauthenticated health endpoint — pure FastAPI overhead."""
    weight = 3
    wait_time = between(0.1, 0.5)

    @task(10)
    def health(self):
        self.client.get("/health", name="/health")


class RegistrationCompaniesUser(HttpUser):
    """Unauthenticated DB-read endpoint (company listing)."""
    weight = 2
    wait_time = between(0.5, 1.5)

    @task(5)
    def companies(self):
        self.client.get(
            "/api/v1/registration/companies",
            name="/api/v1/registration/companies",
        )


class AdminDashboardUser(HttpUser):
    """Authenticated admin user hitting the dashboard stats endpoint."""
    weight = 2
    wait_time = between(1.0, 3.0)

    def on_start(self):
        """Authenticate once per user and reuse the token."""
        with self.client.post(
            "/api/v1/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            name="/api/v1/auth/login [setup]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self.token = data["data"]["tokens"]["accessToken"]
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code} {resp.text[:200]}")
                self.token = None

    @task(5)
    def dashboard_stats(self):
        if not self.token:
            return
        self.client.get(
            "/api/v1/admin/dashboard/stats",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/v1/admin/dashboard/stats",
        )

    @task(3)
    def admin_orders(self):
        if not self.token:
            return
        self.client.get(
            "/api/v1/admin/orders?page=1&page_size=10",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/v1/admin/orders",
        )

    @task(2)
    def users_me(self):
        if not self.token:
            return
        self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/v1/users/me",
        )


# ---------------------------------------------------------------------------
# Event hooks — log structured results per test run
# ---------------------------------------------------------------------------
_test_results: list[dict] = []


@events.quitting.add_listener
def on_quit(environment, **kwargs):
    """Write aggregated stats to stdout and optionally to a JSON file."""
    stats = environment.runner.stats
    if stats is None:
        return

    print("\n" + "=" * 80)
    print("DELIVERYHUB BASELINE LOAD TEST — RESULTS")
    print("=" * 80)
    print(f"Target: {TARGET_HOST}")
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Total failures: {stats.total.num_failures}")
    print(f"Median response time (ms): {stats.total.get_response_time_percentile(0.5):.0f}")
    print(f"p95 response time (ms): {stats.total.get_response_time_percentile(0.95):.0f}")
    print(f"p99 response time (ms): {stats.total.get_response_time_percentile(0.99):.0f}")
    print(f"Average response time (ms): {stats.total.avg_response_time:.0f}")
    print(f"Min response time (ms): {stats.total.min_response_time:.0f}")
    print(f"Max response time (ms): {stats.total.max_response_time:.0f}")
    print(f"Requests/sec (actual): {stats.total.current_rps:.2f}")
    print()

    print("Per-endpoint breakdown:")
    print("-" * 80)
    print(f"{'Endpoint':<50} {'Reqs':>8} {'Fails':>8} {'Med':>8} {'p95':>8} {'p99':>8} {'RPS':>8}")
    print("-" * 80)
    for name, entry in sorted(stats.entries.items()):
        method, path = name
        label = f"{method} {path}"
        if label.startswith("/api/v1/auth/login"):
            continue  # skip setup calls
        print(
            f"{label:<50} {entry.num_requests:>8} {entry.num_failures:>8} "
            f"{entry.get_response_time_percentile(0.5):>7.0f}ms "
            f"{entry.get_response_time_percentile(0.95):>7.0f}ms "
            f"{entry.get_response_time_percentile(0.99):>7.0f}ms "
            f"{entry.current_rps:>7.2f}"
        )
    print("=" * 80)

    # Save JSON for programmatic comparison
    results = {
        "target": TARGET_HOST,
        "total_requests": stats.total.num_requests,
        "total_failures": stats.total.num_failures,
        "median_ms": stats.total.get_response_time_percentile(0.5),
        "p95_ms": stats.total.get_response_time_percentile(0.95),
        "p99_ms": stats.total.get_response_time_percentile(0.99),
        "avg_ms": stats.total.avg_response_time,
        "min_ms": stats.total.min_response_time,
        "max_ms": stats.total.max_response_time,
        "rps": stats.total.current_rps,
        "endpoints": {},
    }
    for name, entry in stats.entries.items():
        method, path = name
        label = f"{method} {path}"
        if label.startswith("/api/v1/auth/login"):
            continue
        results["endpoints"][label] = {
            "num_requests": entry.num_requests,
            "num_failures": entry.num_failures,
            "median_ms": entry.get_response_time_percentile(0.5),
            "p95_ms": entry.get_response_time_percentile(0.95),
            "p99_ms": entry.get_response_time_percentile(0.99),
            "avg_ms": entry.avg_response_time,
            "min_ms": entry.min_response_time,
            "max_ms": entry.max_response_time,
            "rps": entry.current_rps,
        }

    os.makedirs("load-test-results", exist_ok=True)
    with open("load-test-results/baseline_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to load-test-results/baseline_results.json")
