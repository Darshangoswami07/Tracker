"""
DeliveryHub Dashboard Stats Load Test
======================================
Authenticated admin endpoint with 14 concurrent DB queries.
MEASUREMENT ONLY.
"""
from __future__ import annotations
import os
from locust import HttpUser, between, events, task

TARGET_HOST = os.getenv("TARGET_HOST", "https://tracker-m0id.onrender.com")
TEST_EMAIL = os.getenv("TEST_EMAIL", "abhiyanshbisht@gmail.com")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "12345678")


class DashboardStatsUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        with self.client.post(
            "/api/v1/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            name="/auth/login [setup]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self.token = data["data"]["tokens"]["accessToken"]
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code}")
                self.token = None

    @task
    def dashboard_stats(self):
        if not self.token:
            return
        self.client.get(
            "/api/v1/admin/dashboard/stats",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/v1/admin/dashboard/stats",
        )


@events.quitting.add_listener
def on_quit(environment, **kwargs):
    stats = environment.runner.stats
    if stats is None:
        return
    print("\n" + "=" * 80)
    print("DASHBOARD STATS BASELINE")
    print("=" * 80)
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Total failures: {stats.total.num_failures}")
    print(f"Median (ms): {stats.total.get_response_time_percentile(0.5):.0f}")
    print(f"p95 (ms): {stats.total.get_response_time_percentile(0.95):.0f}")
    print(f"p99 (ms): {stats.total.get_response_time_percentile(0.99):.0f}")
    print(f"Min (ms): {stats.total.min_response_time:.0f}")
    print(f"Max (ms): {stats.total.max_response_time:.0f}")
    print(f"RPS: {stats.total.current_rps:.2f}")

    for name, entry in stats.entries.items():
        method, path = name
        if "login" in path:
            continue
        print(f"\n  {path}:")
        print(f"    Requests: {entry.num_requests}, Failures: {entry.num_failures}")
        print(f"    p50: {entry.get_response_time_percentile(0.5):.0f}ms")
        print(f"    p95: {entry.get_response_time_percentile(0.95):.0f}ms")
        print(f"    p99: {entry.get_response_time_percentile(0.99):.0f}ms")
        print(f"    RPS: {entry.current_rps:.2f}")
    print("=" * 80)
