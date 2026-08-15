"""Add devices and licenses tables (centralized control data).

Revision ID: 009
Revises: 008
Create Date: 2026-08-14 00:00:00.000000

These tables belong to the Neon control plane: a device is registered after
account activation, and a license is bound to it. Business data lives in
device-local SQLite, never here.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '009_devices_licenses'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'devices',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('userId', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('deviceId', sa.String(length=128), nullable=False),
        sa.Column('deviceName', sa.String(length=120), nullable=False),
        sa.Column('platform', sa.String(length=16), nullable=False),
        sa.Column('appVersion', sa.String(length=32), nullable=True),
        sa.Column('osVersion', sa.String(length=32), nullable=True),
        sa.Column('pushToken', sa.String(length=512), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('lastSeenAt', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activatedAt', sa.DateTime(timezone=True), nullable=False),
        sa.Column('createdAt', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updatedAt', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('deviceId', name='uq_devices_device_id'),
    )
    op.create_index('ix_devices_status', 'devices', ['status'])

    op.create_table(
        'licenses',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('userId', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('deviceId', sa.Uuid(), sa.ForeignKey('devices.id'), nullable=True, index=True),
        sa.Column('licenseKeyHash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('issuedAt', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expiresAt', sa.DateTime(timezone=True), nullable=True),
        sa.Column('createdAt', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updatedAt', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('licenseKeyHash', name='uq_licenses_license_key_hash'),
    )
    op.create_index('ix_licenses_status', 'licenses', ['status'])


def downgrade() -> None:
    op.drop_index('ix_licenses_status', table_name='licenses')
    op.drop_table('licenses')
    op.drop_index('ix_devices_status', table_name='devices')
    op.drop_table('devices')