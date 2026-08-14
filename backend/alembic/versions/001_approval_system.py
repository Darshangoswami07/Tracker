"""Add approval system tables: registration_requests, email_otps, approval_logs, audit_logs, and user status fields

Revision ID: 001_approval_system
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_approval_system'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create registration_status enum
    op.execute("CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected', 'active', 'suspended')")
    op.execute("CREATE TYPE otp_intent AS ENUM ('approval', 'password_reset', 'email_verification')")
    op.execute("CREATE TYPE user_role AS ENUM ('employee', 'admin', 'business', 'driver', 'dispatcher')")

    # Create registration_requests table
    op.create_table(
        'registration_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('first_name', sa.String(60), nullable=False),
        sa.Column('last_name', sa.String(60), nullable=False),
        sa.Column('company_name', sa.String(120), nullable=False),
        sa.Column('email', sa.String(320), nullable=False, unique=True),
        sa.Column('phone', sa.String(16), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(60), nullable=False),
        sa.Column('requested_role', sa.Enum('employee', 'admin', 'business', 'driver', 'dispatcher', name='user_role'), nullable=False, default='employee'),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', 'active', 'suspended', name='registration_status'), nullable=False, default='pending'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, default=False),
        sa.Column('is_approved', sa.Boolean(), nullable=False, default=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=False),
        sa.Column('otp_verified', sa.Boolean(), nullable=False, default=False),
        sa.Column('rejected_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.String(500), nullable=True),
        sa.Column('approved_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, default=sa.text('now()')),
    )
    op.create_index('ix_registration_requests_email', 'registration_requests', ['email'], unique=True)
    op.create_index('ix_registration_requests_phone', 'registration_requests', ['phone'], unique=True)
    op.create_index('ix_registration_requests_status', 'registration_requests', ['status'])

    # Create email_otps table
    op.create_table(
        'email_otps',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('otp_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('intent', sa.Enum('approval', 'password_reset', 'email_verification', name='otp_intent'), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, default=0),
        sa.Column('max_attempts', sa.Integer(), nullable=False, default=5),
        sa.Column('used', sa.Boolean(), nullable=False, default=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, default=sa.text('now()')),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('ix_email_otps_otp_hash', 'email_otps', ['otp_hash'], unique=True)
    op.create_index('ix_email_otps_user_id', 'email_otps', ['user_id'])
    op.create_index('ix_email_otps_email', 'email_otps', ['email'])

    # Create approval_logs table
    op.create_table(
        'approval_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('registration_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.Enum('pending', 'approved', 'rejected', 'active', 'suspended', name='registration_status'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, default=sa.text('now()')),
    )
    op.create_index('ix_approval_logs_registration_request_id', 'approval_logs', ['registration_request_id'])
    op.create_index('ix_approval_logs_admin_id', 'approval_logs', ['admin_id'])

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('old_values', sa.Text(), nullable=True),
        sa.Column('new_values', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, default=sa.text('now()')),
    )
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_admin_id', 'audit_logs', ['admin_id'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'])

    # Add new columns to users table
    op.execute("CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'active', 'suspended')")
    op.add_column('users', sa.Column('first_name', sa.String(60), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(60), nullable=True))
    op.add_column('users', sa.Column('status', sa.Enum('pending', 'approved', 'rejected', 'active', 'suspended', name='user_status'), nullable=False, default='pending'))
    op.add_column('users', sa.Column('is_verified', sa.Boolean(), nullable=False, default=False))
    op.add_column('users', sa.Column('is_approved', sa.Boolean(), nullable=False, default=False))
    op.add_column('users', sa.Column('otp_verified', sa.Boolean(), nullable=False, default=False))
    op.create_index('ix_users_status', 'users', ['status'])


def downgrade() -> None:
    # Remove indexes
    op.drop_index('ix_users_status', table_name='users')
    op.drop_index('ix_audit_logs_entity', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_index('ix_audit_logs_admin_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_id', table_name='audit_logs')
    op.drop_index('ix_approval_logs_admin_id', table_name='approval_logs')
    op.drop_index('ix_approval_logs_registration_request_id', table_name='approval_logs')
    op.drop_index('ix_email_otps_email', table_name='email_otps')
    op.drop_index('ix_email_otps_user_id', table_name='email_otps')
    op.drop_index('ix_email_otps_otp_hash', table_name='email_otps')
    op.drop_index('ix_registration_requests_status', table_name='registration_requests')
    op.drop_index('ix_registration_requests_phone', table_name='registration_requests')
    op.drop_index('ix_registration_requests_email', table_name='registration_requests')

    # Remove columns from users
    op.drop_column('users', 'otp_verified')
    op.drop_column('users', 'is_approved')
    op.drop_column('users', 'is_verified')
    op.drop_column('users', 'status')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')

    # Drop tables
    op.drop_table('audit_logs')
    op.drop_table('approval_logs')
    op.drop_table('email_otps')
    op.drop_table('registration_requests')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS user_status')
    op.execute('DROP TYPE IF EXISTS otp_intent')
    op.execute('DROP TYPE IF EXISTS registration_status')
    op.execute('DROP TYPE IF EXISTS user_role')