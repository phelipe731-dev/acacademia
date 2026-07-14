#!/bin/sh
# Restaura um backup gerado por backup.sh.
# Uso: sh infra/restore.sh <caminho-do-arquivo.sql.gz>
# Executar com o servico db no ar. ATENCAO: sobrescreve os dados atuais.
set -eu

if [ $# -lt 1 ]; then
  echo "Uso: sh infra/restore.sh <arquivo.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
: "${POSTGRES_HOST:=db}"
: "${POSTGRES_USER:=ac_academia}"
: "${POSTGRES_DB:=ac_academia}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Arquivo nao encontrado: $BACKUP_FILE" >&2
  exit 1
fi

echo "Restaurando $BACKUP_FILE para o banco $POSTGRES_DB..."
gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restauracao concluida."
