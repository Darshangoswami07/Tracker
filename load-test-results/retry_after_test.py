"""Focused test: verify Retry-After header on 429 responses."""
import urllib.request
import urllib.error
import http.client
import ssl

TARGET = "https://tracker-m0id.onrender.com"
ENDPOINT = "/api/v1/registration/companies"
URL = f"{TARGET}{ENDPOINT}"

print("Testing Retry-After header on 429 responses")
print("=" * 60)

# Use http.client directly to see ALL headers
from urllib.parse import urlparse
parsed = urlparse(URL)
ctx = ssl.create_default_context()

# Send 70 concurrent requests to trigger 429
from concurrent.futures import ThreadPoolExecutor, as_completed

def raw_request(idx):
    try:
        conn = http.client.HTTPSConnection(parsed.hostname, 443, context=ctx, timeout=15)
        conn.request("GET", parsed.path)
        resp = conn.getresponse()
        body = resp.read().decode()
        headers = dict(resp.getheaders())
        status = resp.status
        conn.close()
        return (idx, status, body, headers)
    except Exception as e:
        return (idx, 0, str(e), {})

results = []
with ThreadPoolExecutor(max_workers=20) as pool:
    futs = {pool.submit(raw_request, i): i for i in range(70)}
    for f in as_completed(futs):
        results.append(f.result())

# Find first 429
first_429 = None
for idx, status, body, headers in sorted(results, key=lambda x: x[0]):
    if status == 429:
        first_429 = (idx, status, body, headers)
        break

if first_429:
    idx, status, body, headers = first_429
    print(f"First 429 at request #{idx}")
    print(f"\nAll response headers:")
    for k, v in sorted(headers.items()):
        print(f"  {k}: {v}")
    
    # Check specific headers
    retry_after = headers.get("Retry-After") or headers.get("retry-after")
    content_type = headers.get("Content-Type") or headers.get("content-type")
    
    print(f"\nRetry-After: {retry_after}")
    print(f"Content-Type: {content_type}")
    
    if retry_after == "60":
        print("PASS: Retry-After header is correct (60)")
    elif retry_after:
        print(f"WARN: Retry-After={retry_after} (expected '60')")
    else:
        print("FAIL: Retry-After header missing")
    
    # Parse body
    import json
    try:
        data = json.loads(body)
        print(f"\nBody JSON:")
        print(json.dumps(data, indent=2))
    except:
        print(f"\nBody (raw): {body[:500]}")
else:
    print("No 429 received in this burst")

# Count totals
counts = {}
for _, status, _, _ in results:
    counts[status] = counts.get(status, 0) + 1
print(f"\nTotal: {dict(counts)}")
