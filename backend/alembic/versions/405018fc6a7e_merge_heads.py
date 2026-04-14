"""merge heads

Revision ID: 405018fc6a7e
Revises: 1d6aa4f2962e, d4e5f6a7b8c9
Create Date: 2026-03-12 15:07:55.889435

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '405018fc6a7e'
down_revision: Union[str, None] = ('1d6aa4f2962e', 'd4e5f6a7b8c9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
