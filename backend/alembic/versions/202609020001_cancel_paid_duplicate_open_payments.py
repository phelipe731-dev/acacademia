"""cancela mensalidades abertas duplicadas ja pagas

Revision ID: 202609020001
Revises: 202609010001
Create Date: 2026-09-02 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "202609020001"
down_revision: str | None = "202609010001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE payments
            SET
                status = 'CANCELADO',
                paid_at = NULL,
                notes = CASE
                    WHEN notes IS NULL OR notes = ''
                        THEN 'Cancelamento automatico: ja havia mensalidade paga para o mesmo aluno, vencimento e valor.'
                    ELSE notes || ' | Cancelamento automatico: ja havia mensalidade paga para o mesmo aluno, vencimento e valor.'
                END
            WHERE status IN ('PENDENTE', 'ATRASADO')
              AND EXISTS (
                SELECT 1
                FROM payments paid
                WHERE paid.student_id = payments.student_id
                  AND paid.due_date = payments.due_date
                  AND paid.amount = payments.amount
                  AND paid.status = 'PAGO'
                  AND paid.id <> payments.id
              )
            """
        )
    )


def downgrade() -> None:
    pass
