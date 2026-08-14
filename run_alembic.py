import sys
sys.path.insert(0, r'D:\DeliveryHub\backend')
from alembic import command
from alembic.config import Config

config = Config(r'D:\DeliveryHub\backend\alembic.ini')
command.heads(config)