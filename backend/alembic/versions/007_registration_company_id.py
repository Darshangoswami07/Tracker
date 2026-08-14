"""Link registration requests to companies and harden company name uniqueness.

Adds a nullable `companyId` FK (-> companies.id) on `registration_requests`
so staff/driver requests can reference the exact company a user will join,
and admin requests can be back-filled to the company created/found from the
typed company name. Also widens `companyName` to match `companies.name`
(String(160)) since it is now populated from the resolved company, and adds a
case-insensitive partial unique index on `companies.name` so find-or-create
of an admin company cannot race into duplicates.

Revision ID: 007_registration_company_id
Revises: 006_user_company_id
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '007_registration_company_id'
down_revision: Union[str, Sequence[str], None] = '006_user_company_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("registration_requests")}

    if "companyId" not in columns:
        op.add_column("registration_requests", sa.Column("companyId", sa.Uuid(), nullable=True))

    op.create_index("ix_registration_requests_companyId", "registration_requests", ["companyId"])
    op.create_foreign_key(
        "fk_registration_requests_companyId_companies",
        "registration_requests",
        "companies",
        ["companyId"],
        ["id"],
    )

    op.alter_column(
        "registration_requests",
        "companyName",
        existing_type=sa.String(120),
        type_=sa.String(160),
        existing_nullable=False,
    )

    op.execute(
        'CREATE UNIQUE INDEX uq_companies_name_lower '
        'ON companies (lower(name)) '
        'WHERE "deletedAt" IS NULL'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS uq_companies_name_lower')
    op.drop_constraint("fk_registration_requests_companyId_companies", "registration_requests", type_="foreignkey")
    op.drop_index("ix_registration_requests_companyId", table_name="registration_requests")
    op.drop_column("registration_requests", "companyId")
    op.alter_column(
        "registration_requests",
        "companyName",
        existing_type=sa.String(160),
        type_=sa.String(120),
        existing_nullable=False,
    )
