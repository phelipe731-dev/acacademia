# Infraestrutura

Este MVP usa Docker Compose com os servicos:

- `db`: PostgreSQL 16
- `backend`: FastAPI + Alembic
- `frontend`: Next.js
- `backup`: backup automatico do PostgreSQL

## Backup automatico

O servico `backup` roda em loop e gera dumps comprimidos do banco em `./backups`
(no host), removendo automaticamente os mais antigos que a retencao configurada.

Configuravel por variaveis de ambiente (com valores padrao):

- `BACKUP_INTERVAL_SECONDS` (padrao `86400` = 24h) — intervalo entre backups.
- `BACKUP_KEEP_DAYS` (padrao `14`) — por quantos dias manter os backups.

Os arquivos ficam como `backups/ac_academia_AAAAMMDD_HHMMSS.sql.gz` e a pasta
`backups/` esta no `.gitignore` (nao vai para o repositorio).

### Restaurar um backup

Com o `db` no ar, rode a partir de dentro do container de backup (que tem `psql`):

```bash
docker compose exec backup sh /... # ou:
docker compose run --rm -v "$PWD/backups:/backups" backup sh -c "gunzip -c /backups/ARQUIVO.sql.gz | psql -h db -U ac_academia -d ac_academia"
```

Ou use o script auxiliar `infra/restore.sh` dentro de um container com acesso ao `db`:

```bash
sh infra/restore.sh backups/ac_academia_AAAAMMDD_HHMMSS.sql.gz
```

> Atencao: a restauracao sobrescreve os dados atuais. Faca um backup antes.

## Recomendacoes de producao

- Copie a pasta `backups/` para um armazenamento externo (outra maquina, nuvem)
  periodicamente — backup no mesmo servidor nao protege contra perda do servidor.
- Rode atras de HTTPS (o cookie de sessao usa `Secure` quando `ENVIRONMENT` != local).
