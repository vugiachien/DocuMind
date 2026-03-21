"""add_comment_position_columns

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a6
Create Date: 2026-03-05

Adds paragraph_index, offset_start, offset_end to contract_comments
for accurate text positioning when duplicate quotes exist.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contract_comments', sa.Column('paragraph_index', sa.Integer(), nullable=True))
    op.add_column('contract_comments', sa.Column('offset_start', sa.Integer(), nullable=True))
    op.add_column('contract_comments', sa.Column('offset_end', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('contract_comments', 'offset_end')
    op.drop_column('contract_comments', 'offset_start')
    op.drop_column('contract_comments', 'paragraph_index')
