"""Drop orphaned email_otps columns that don't exist on the EmailOTP model.

`email_otps` predates the migration chain (created directly by
`Base.metadata.create_all()`, like `order_attachments` in 004) from an
earlier iteration of the model that apparently supported multiple OTP
delivery channels. The current `EmailOTP` model is email-only and has no
`channel`/`phone` fields, but the live table still carries both columns —
`channel` is NOT NULL with no default, so every `INSERT` from
`EmailOTPRepository.create_otp()` fails with a NotNullViolation, which is
why approving a registration request (which sends an OTP) currently 500s.
Neither column is referenced anywhere in the codebase; dropping them brings
the table back in line with the model instead of inventing a channel concept
the app doesn't use.

Revision ID: 005_drop_otp_channel
Revises: 004_gr_shipment_fields
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '005_drop_otp_channel'
down_revision: Union[str, Sequence[str], None] = '004_gr_shipment_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('email_otps', 'channel')
    op.drop_column('email_otps', 'phone')


def downgrade() -> None:
    op.add_column('email_otps', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('email_otps', sa.Column('channel', sa.String(length=20), nullable=False, server_default='email'))
