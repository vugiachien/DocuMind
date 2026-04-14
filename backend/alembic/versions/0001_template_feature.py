"""add_template_feature

Revision ID: 0001_template_feature
Revises: 
Create Date: 2026-02-25

Adds:
  - contract_types.templateUrl
  - contracts.isTemplateBased
  - contracts.templateSimilarity
  - contract_versions.versionType
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_template_feature'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS so migration is idempotent when DB was bootstrapped via create_all
    op.execute('ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS "templateUrl" VARCHAR')
    op.execute('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "isTemplateBased" BOOLEAN DEFAULT false')
    op.execute('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "templateSimilarity" FLOAT')
    op.execute('ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS "versionType" VARCHAR DEFAULT \'upload\'')


def downgrade() -> None:
    op.drop_column('contract_versions', 'versionType')
    op.drop_column('contracts', 'templateSimilarity')
    op.drop_column('contracts', 'isTemplateBased')
    op.drop_column('contract_types', 'templateUrl')
