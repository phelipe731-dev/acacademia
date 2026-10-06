#!/bin/sh
set -eu
umask 077

mkdir -p /backups
file="/backups/ac_academia_$(date -u +%Y%m%d_%H%M%S)_$$.dump"
trap 'rm -f "$file.tmp"' EXIT HUP INT TERM

# Sem pipeline: um pg_dump com falha nunca e anunciado como backup valido.
pg_dump --format=custom --no-owner --no-acl --file="$file.tmp"
pg_restore --list "$file.tmp" > /dev/null
mv "$file.tmp" "$file"
printf 'Backup criado: %s\n' "$file"
