"""add_contract_comments_and_replies

Revision ID: b1c2d3e4f5a6
Revises: 41985ad81641
Create Date: 2026-03-04

Adds:
  - contract_comments table
  - comment_replies table
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '41985ad81641'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contract_comments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('contractId', sa.String(), sa.ForeignKey('contracts.id'), nullable=False),
        sa.Column('versionId', sa.String(), sa.ForeignKey('contract_versions.id'), nullable=True),
        sa.Column('authorId', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('quote', sa.Text(), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('createdAt', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_contract_comments_contract', 'contract_comments', ['contractId'])
    op.create_index('ix_contract_comments_version', 'contract_comments', ['versionId'])
    op.create_index('ix_contract_comments_created', 'contract_comments', ['createdAt'])

    op.create_table(
        'comment_replies',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('commentId', sa.String(), sa.ForeignKey('contract_comments.id'), nullable=False),
        sa.Column('authorId', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('createdAt', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_comment_replies_comment', 'comment_replies', ['commentId'])


def downgrade() -> None:
    op.drop_index('ix_comment_replies_comment', table_name='comment_replies')
    op.drop_table('comment_replies')
    op.drop_index('ix_contract_comments_created', table_name='contract_comments')
    op.drop_index('ix_contract_comments_version', table_name='contract_comments')
    op.drop_index('ix_contract_comments_contract', table_name='contract_comments')
    op.drop_table('contract_comments')
