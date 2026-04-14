"""add_playbook_rule_fields

Revision ID: 76ee9ca90623
Revises: 405018fc6a7e
Create Date: 2026-03-16 11:39:04.363556

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '76ee9ca90623'
down_revision: Union[str, None] = '405018fc6a7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('playbook_rules', sa.Column('clauseRef', sa.String(), nullable=True))
    op.add_column('playbook_rules', sa.Column('acceptableDeviation', sa.Text(), nullable=True))
    op.add_column('playbook_rules', sa.Column('approvalLevel', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('playbook_rules', 'approvalLevel')
    op.drop_column('playbook_rules', 'acceptableDeviation')
    op.drop_column('playbook_rules', 'clauseRef')
