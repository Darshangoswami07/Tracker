import os
import sys
sys.path.insert(0, r'D:\DeliveryHub\backend')

# Set required environment variables
os.environ['ENV'] = 'test'
os.environ['DEBUG'] = 'false'
os.environ['SECRET_KEY'] = 'test-only-secret-key-0123456789abcdef-9876543210'
os.environ['EXPOSE_RESET_TOKEN_IN_RESPONSE'] = 'true'
os.environ['RATE_LIMIT_ENABLED'] = 'false'
os.environ['TEST_DATABASE_URL'] = 'postgresql+psycopg://neondb_owner:npg_LoCy9suZSJ5b@ep-gentle-moon-azwg35o6.c-3.ap-southeast-1.aws.neon.tech/deliveryhub_test?sslmode=require&channel_binding=require'
os.environ['SMTP_HOST'] = ''

from dotenv import load_dotenv
from pathlib import Path
dotenv_path = Path(__file__).resolve().parents[1] / '.env'
load_dotenv(dotenv_path=dotenv_path, override=False)

from main import app as _app
from httpx import ASGITransport, AsyncClient
import pytest_asyncio

# Override DATABASE_URL for test
if os.environ.get('TEST_DATABASE_URL'):
    os.environ['DATABASE_URL'] = os.environ['TEST_DATABASE_URL']

if os.environ.get('ENV') == 'test':
    os.environ['SMTP_HOST'] = ''

import pytest
from httpx import ASGITransport, AsyncClient

import asyncio

async def run_tests():
    # Import after env setup
    from app.database.db import drop_database, init_database
    
    # Drop and init database
    await drop_database()
    await init_database()
    
    from fastapi.testclient import TestClient
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test 1: Customer login
        print("Test 1: Customer login")
        resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "pass123", "role": "customer"})
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json() if resp.status_code != 404 else 'not found'}")
        
        # Test 2: Staff login with same email
        print("Test 2: Staff login with same email")
        resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "pass123", "role": "employee"})
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json() if resp.status_code != 404 else 'not found'}")
    
    await drop_database()
    await close_database()

asyncio.run(run_tests())
print("Tests completed!")