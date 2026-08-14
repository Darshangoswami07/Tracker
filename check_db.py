import sys
sys.path.insert(0, r'D:\DeliveryHub\backend')
from app.core.config import settings
print(settings.DATABASE_URL)