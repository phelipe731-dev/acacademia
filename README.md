# AC Academia

MVP web operacional para uma academia pequena, com foco em rotina diaria: alunos, mensalidades, estoque de suplementos, vendas no balcao e relatorios basicos.

## Stack

- Backend: FastAPI, SQLAlchemy 2, Alembic, JWT
- Banco: PostgreSQL
- Frontend: Next.js, TypeScript, Tailwind
- Infra local: Docker Compose

## Como rodar com Docker

1. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

2. Suba os servicos:

```bash
docker compose up --build
```

3. Acesse:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs

O container do backend roda `alembic upgrade head` antes de iniciar a API.

## Usuario administrador inicial

Por padrao, o backend cria um ADMIN no primeiro start quando `AUTO_CREATE_ADMIN=true`:

- E-mail: `admin@acacademia.com.br`
- Senha: `admin123`

Altere `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD` e `SECRET_KEY` no `.env` antes de usar fora do ambiente local.

Para fichas de treino, configure tambem:

- `FRONTEND_PUBLIC_URL`: base usada nos links publicos, por exemplo `https://app.suaacademia.com.br`
- `UPLOAD_DIR`: pasta de imagens locais das fichas
- `TRAINING_MEDIA_MAX_BYTES`: limite por upload de imagem

Tambem existe a rota `POST /auth/register-admin`, usada pela tela de primeiro acesso, que so funciona enquanto nao houver usuarios cadastrados.

## Rodar backend localmente

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Use uma `DATABASE_URL` apontando para PostgreSQL. Para subir apenas o banco:

```bash
docker compose up db
```

## Rodar frontend localmente

```bash
cd frontend
npm install
npm run dev
```

Se a API estiver em outro host, ajuste `NEXT_PUBLIC_API_URL`.

## Deploy do backend no Render

O arquivo `render.yaml` na raiz cria:

- Web Service `acacademia-api`
- Postgres `acacademia-db`
- Migrations Alembic antes do start
- CORS liberado para `https://acacademia.netlify.app`

Fluxo recomendado:

1. No Render, escolha **New + > Blueprint**.
2. Conecte o repo `phelipe731-dev/acacademia`.
3. Confirme o arquivo `render.yaml`.
4. Quando o Render pedir `FIRST_ADMIN_PASSWORD`, informe uma senha forte para o admin inicial.
5. Aguarde o deploy e teste `/health` na URL gerada pelo Render.
6. No Netlify, configure `NEXT_PUBLIC_API_URL` com a URL do backend, por exemplo:

```text
https://acacademia-api.onrender.com
```

Observacao: no plano gratis do Render, o servico pode dormir quando fica sem acesso. O primeiro login depois de um tempo parado pode demorar alguns segundos. Uploads locais em `uploads/` tambem nao devem ser tratados como armazenamento permanente no plano gratis.

## Migrations

```bash
cd backend
alembic upgrade head
```

Criar nova migration futuramente:

```bash
alembic revision --autogenerate -m "descricao"
```

## Testes e validacoes

Backend:

```bash
cd backend
pytest
```

Massa demo para validar telas:

```bash
cd backend
python scripts/seed_demo.py
```

O script cria/atualiza 10 alunos ficticios, mensalidades pagas/pendentes/atrasadas, produtos, entradas de estoque, vendas com baixa automatica e frequencia. Ele e idempotente e usa marcadores `DEMO_MOCKUP_VALIDADO`.

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

Docker Compose:

```bash
docker compose config
docker compose up --build
```

## Escopo do MVP

Incluido:

- Login com JWT e senha com hash seguro
- ADMIN, RECEPCAO e PROFESSOR com permissoes aplicadas no backend
- Cadastro, busca, detalhe e historico financeiro de alunos
- Registro de mensalidades e pagamentos
- Inadimplencia calculada por pagamentos vencidos
- Cadastro de produtos e controle de estoque
- Entrada, ajuste e historico de movimentacoes
- Venda de suplementos com multiplos itens
- Baixa automatica de estoque e bloqueio de venda sem saldo
- Dashboard com indicadores reais
- Graficos simples no dashboard
- Relatorios simples por periodo
- Exportacao CSV autenticada em todos os relatorios
- Importacao de alunos por CSV/XLSX
- Geracao automatica mensal de mensalidades para alunos ativos
- Auditoria basica de alteracoes sensiveis
- Fichas de treino digitais vinculadas ao aluno
- Exercicios por ficha com series, repeticoes, carga, descanso e observacoes
- Midias por exercicio: upload local de imagem e links externos de imagem/video
- Link publico seguro por token para o aluno abrir a ficha no celular, sem login
- Revogacao de link publico e envio manual pelo WhatsApp

Fora do escopo neste MVP:

- Catraca
- Reconhecimento facial
- Aplicativo mobile de treino com login do aluno
- Boletos automaticos
- Cobranca recorrente por cartao
- WhatsApp automatico
- Financeiro avancado, contas a pagar e DRE
- Aplicativos Android/iOS
- Integracoes com hardware externo
- Migracao automatica complexa de dados antigos
- Upload local pesado de videos; neste MVP videos entram por link externo

Mais detalhes em [docs/ESCOPO_MVP.md](docs/ESCOPO_MVP.md).
