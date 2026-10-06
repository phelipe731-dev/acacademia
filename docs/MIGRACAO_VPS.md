# Migracao da API e banco para VPS

## Situacao verificada em 06/10/2026

- Destino confirmado: ubuntu@18.228.39.12.
- A VPS tem 909 MB de RAM, aproximadamente 200 MB disponiveis na primeira
  medicao, swap em uso e outros sistemas em execucao (Clinserv e CampanhaHub).
- Banco Render: PostgreSQL 18, Basic-256mb, disponivel, aproximadamente 106 MB.
- gestaocontrole.duckdns.org aponta para esta VPS e possui configuracao HTTPS.
- O frontend permanece no Netlify. Nao alterar sua API antes da validacao final.
- Configuracao preparada para avaliacao. Isto NAO comprova capacidade suficiente
  nem significa que a migracao foi realizada.

## Resultado do ensaio em 06/10/2026

- Backup custom do Render criado, validado com `pg_restore --list` e copiado para
  `backups/render-20261006-evaluation.dump` localmente.
- Restauracao em PostgreSQL 18 concluida com 457 alunos, 646 mensalidades, 16
  produtos, 27 vendas, 2 fichas de treino e a revisao Alembic `202609080001`.
- Login, protecao sem autenticacao, mensalidades, pagamentos, dashboard,
  produtos, vendas, frequencia, relatorios e CSV responderam em 30 consultas,
  sem falhas. Mediana aproximada: 103 ms; pior resposta: 981 ms.
- API e banco usaram aproximadamente 111 MB na medicao, sem OOM ou restart; os
  demais servicos da VPS continuaram saudaveis.
- As 3 referencias de imagem local das fichas retornaram 404 no Render. O dump
  do PostgreSQL nao carrega arquivos; os uploads precisam ser recuperados de uma
  copia da hospedagem ou substituidos antes da troca definitiva.
- A instancia permanente foi ativada na VPS em `/home/ubuntu/ac-academia`, com a
  API em `https://gestaocontrole.duckdns.org/academia-api`. O frontend continua
  no Netlify e o Netlify foi publicado com essa nova URL.
- O Render foi mantido ativo durante a validacao. Nao suspender ou excluir o
  banco ate confirmar o uso diario, a restauracao do backup e a ausencia de
  referencias de midia faltantes.

## Configuracao isolada

Usar `docker-compose.vps.yml` sozinho, nunca como override do Compose local.
Ele usa projeto, redes e volumes proprios. O banco nao publica portas. A API
escuta apenas em 127.0.0.1:8020 e possui um worker. Os limites de memoria
protegem os outros servicos, mas precisam de validacao com carga realista.
Nao compilar o frontend nesta VPS. Nao reutilizar o PostgreSQL 16 do Clinserv:
o banco de origem esta na versao 18.

Criar `.env.vps` a partir de `.env.vps.example` e definir senhas fortes e
independentes. A senha do PostgreSQL deve ser hexadecimal, pois entra em uma URL.
Usar permissoes 600. Estes arquivos sao ignorados pelo Git.

```sh
docker compose --env-file .env.vps -f docker-compose.vps.yml config --quiet
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d db
```

## Ensaio de migracao

1. Fazer exportacao com pg_dump 18 do banco Render, sem owner/ACL, em formato
   custom. Guardar uma copia fora da VPS e confirmar `pg_restore --list`.
   Credenciais devem ficar em arquivo protegido, nunca em commits ou logs.
2. Restaurar primeiro numa instancia vazia do projeto ac-academia. Nao usar
   `--clean` contra bases existentes. `pg_restore` deve usar `--exit-on-error`,
   `--no-owner` e `--no-acl`. Confirmar locale/collation e extensoes da origem.
3. Copiar os arquivos de uploads ainda existentes no Render. Um dump do banco
   nao inclui imagens. Conferir todas as referencias de midia das fichas.
4. Conferir a revisao Alembic da origem antes de aplicar migracoes na copia.
5. Subir API em loopback e testar autenticacao, permissoes, listagem de alunos,
   mensalidades (incluindo historico de valor zero), pagamentos sem duplicacao,
   vendas/estoque, relatorios e fichas publicas com imagens. Testes que gravam
   dados devem ser executados apenas na copia de ensaio.
6. Medir memoria, latencia, swap e OOM durante acessos concorrentes e consultas
   de relatorios. Conferir tambem os servicos ja existentes. Se faltar memoria,
   nao trocar a producao. Os limites iniciais nao sao garantia de capacidade.

## HTTPS e mudanca de acesso

API proposta: https://gestaocontrole.duckdns.org/academia-api

Validar o certificado em uso antes da troca. Incluir
`infra/nginx-academia-api.conf` dentro do server HTTPS existente, preservando
as demais rotas e uma copia da configuracao anterior. Executar `nginx -t`
antes do reload. O proxy remove o prefixo e o Uvicorn recebe o mesmo root-path,
necessario para URLs de imagens e documentacao. Nao expor a porta 8020.

Na mudanca final, pausar gravacoes na origem, gerar e restaurar um dump final,
comparar contagens/saldos/revisao Alembic e conferir uploads. Impedir escrita
simultanea nos dois bancos. Somente entao configurar no Netlify:

```text
NEXT_PUBLIC_API_URL=https://gestaocontrole.duckdns.org/academia-api
```

Fazer novo build/deploy no Netlify, pois a variavel e incorporada ao frontend.
Validar CORS com a origem Netlify e testar tambem o carregamento de fichas pelo
servidor Next. Logins podem exigir nova autenticacao se o SECRET_KEY mudar.
Os links /t e /treino continuam no mesmo dominio do Netlify.

## Backups e retorno

```sh
docker compose --env-file .env.vps -f docker-compose.vps.yml run --rm backup
```

O backup termina com erro se a exportacao falhar. Agendar diariamente depois de
validar uma restauracao; manter uma copia externa e incluir o volume de uploads.
O script nao remove backups automaticamente. Definir retencao e monitorar disco.

Na VPS, instalar `infra/acacademia-backup.cron` em `/etc/cron.d/` depois de
confirmar a permissao do arquivo. O primeiro backup manual ja foi executado com
sucesso; a rotina deve ser acompanhada em `/var/log/acacademia-backup.log`.

Manter o Render durante a validacao. Se houver gravacoes na VPS, voltar para o
Render exige sincronizar os dados novos antes da troca; apenas trocar a URL pode
perder pagamentos/cadastros. Encerrar recursos cobrados somente depois de validar
dados, backups e a operacao no novo ambiente. Encerrar hospedagem nao cancela
faturas ja emitidas nem o uso acumulado ate o encerramento.

Referencias: [PostgreSQL Docker](https://github.com/docker-library/docs/tree/master/postgres)
e [FastAPI atras de proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/).
