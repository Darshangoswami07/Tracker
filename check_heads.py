import sys
sys.path.insert(0, r'D:\DeliveryHub\backend')
from alembic.command import heads
from alembic.config import Config
config = Config('alembic.ini')
h = heads(config)
print('Heads:', h)