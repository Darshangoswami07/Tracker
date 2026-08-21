"""
DeliveryHub Health-Only Load Test
=================================
Pure FastAPI overhead measurement — /health only (rate-limit whitelisted).
"""
from __future__ import annotations
import os
import json
from locust import HttpUser, between, events, task

TARGET_HOST = os.getenv("TARGET_HOST", "https://tracker-m0id.onrender.com")


class HealthUser(HttpUser):
    wait_time = between(0.05, 0.2)

    @task
    def health(self):
        self.client.get("/health", name="/health")


@events.quitting.add_listener
def on_quit(environment, **kwargs):
    stats = environment.runner.stats
    if stats is None:
        return
    print("\n" + "=" * 80)
    print("HEALTH-ONLY BASELINE RESULTS")
    print("=" * 80)
    print(f"Target: {TARGET_HOST}")
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Total failures: {stats.total.num_failures}")
    print(f"Median (ms): {stats.total.get_response_time_percentile(0.5):.0f}")
    print(f"p95 (ms): {stats.total.get_response_time_percentile(0.95):.0f}")
    print(f"p99 (ms): {stats.total.get_response_time_percentile(0.99):.0f}")
    print(f"Min (ms): {stats.total.min_response_time:.0f}")
    print(f"Max (ms): {stats.total.max_response_time:.0f}")
    print(f"Avg (ms): {stats.total.avg_response_time:.0f}")
    print(f"RPS (actual): {stats.total.current_rps:.2f}")

    for name, entry in stats.entries.items():
        method, path = name
        if "/health" in path:
            print(f"\n  /health specific:")
            print(f"    Requests: {entry.num_requests}")
            print(f"    Failures: {entry.num_failures}")
            print(f"    p50: {entry.get_response_time_percentile(0.5):.0f}ms")
            print(f"    p95: {entry.get_response_time_percentile(0.95):.0f}ms")
            print(f"    p99: {entry.get_response_time_percentile(0.99):.0f}ms")
            print(f"    RPS: {entry.current_rps:.2f}")
    print("=" * 80)
