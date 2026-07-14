#!/bin/sh
# Backup automatico do PostgreSQL em loop. Roda dentro de um container que tem
# acesso ao servico `db`. Gera dumps comprimidos e remove os antigos.
set -eu

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_USER:=ac_academia}"
: "${POSTGRES_DB:=ac_academia}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_KEEP_DAYS:=14}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"

mkdir -p "$BACKUP_DIR"
echo "[backup] iniciado (intervalo=${BACKUP_INTERVAL_SECONDS}s, retencao=${BACKUP_KEEP_DAYS} dias)"

while true; do
  STAMP=$(date +%Y%m%d_%H%M%S)
  FILE="${BACKUP_DIR}/${POSTGRES_DB}_${STAMP}.sql.gz"
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "${FILE}.tmp"; then
    mv "${FILE}.tmp" "$FILE"
    echo "[backup] gerado: $FILE"
  else
    echo "[backup] FALHA ao gerar backup em ${STAMP}" >&2
    rm -f "${FILE}.tmp"
  fi
  # Remove backups mais antigos que a retencao configurada.
  find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime +"$BACKUP_KEEP_DAYS" -delete 2>/dev/null || true
  sleep "$BACKUP_INTERVAL_SECONDS"
done
