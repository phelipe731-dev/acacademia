# Escopo do MVP

## Incluido

### Autenticacao e usuarios

- Login com e-mail e senha
- JWT para autenticacao
- Criacao do administrador inicial
- Logout no frontend
- Gerenciamento de usuarios restrito ao perfil ADMIN

### Perfis

- ADMIN: acesso total
- RECEPCAO: cadastro e consulta de alunos, registro de pagamentos, vendas no balcao e consulta de estoque
- PROFESSOR: cria e edita fichas de treino, exercicios, midias e links publicos; sem acesso a financeiro, vendas, estoque, relatorios ou usuarios
- Restricoes aplicadas no backend

### Alunos

- Cadastro de aluno
- Edicao e exclusao por ADMIN
- Listagem com busca por nome/telefone
- Filtro por status
- Detalhe do aluno com historico financeiro
- Importacao de alunos por arquivo `.csv` ou `.xlsx`, restrita ao ADMIN
- Retorno da importacao com total importado e erros por linha

### Mensalidades e pagamentos

- Registro manual de mensalidade/pagamento
- Vinculo com aluno
- Status PENDENTE, PAGO, ATRASADO e CANCELADO
- Forma de pagamento DINHEIRO, PIX, CARTAO e OUTRO
- Listagem por status
- Inadimplentes
- Vencimentos proximos
- Geracao automatica mensal para alunos ativos
- Geracao idempotente, sem duplicar mensalidade ja existente no mesmo vencimento

### Produtos e estoque

- Cadastro de produto por ADMIN
- Consulta de produtos por ADMIN e RECEPCAO
- Alerta visual para estoque baixo
- Produto inativo fica fora da venda
- Entrada e ajuste de estoque
- Historico de movimentacoes

### Vendas no balcao

- Venda com um ou mais itens
- Total calculado automaticamente
- Baixa automatica de estoque
- Movimentacao SAIDA_VENDA criada automaticamente
- Bloqueio de venda sem estoque suficiente
- Historico de vendas

### Dashboard

- Alunos ativos
- Alunos inadimplentes
- Mensalidades recebidas no mes
- Mensalidades em atraso
- Vendas de suplementos no mes
- Receita total do mes
- Produtos com estoque baixo
- Produtos mais vendidos
- Grafico simples de receita diaria do mes
- Barras simples de produtos mais vendidos

### Relatorios

- Mensalidades recebidas
- Inadimplentes
- Vendas de suplementos
- Produtos mais vendidos
- Estoque baixo
- Receita geral
- Exportacao CSV autenticada em todos os relatorios

### Auditoria

- Listagem de eventos de auditoria restrita ao ADMIN
- Registro de criacao, edicao, exclusao/desativacao, importacao, geracao mensal, pagamentos, vendas e movimentacoes de estoque
- Snapshots de alteracao sem expor hash de senha

### Fichas de treino digitais

- Fichas vinculadas ao aluno
- Criacao e edicao por ADMIN e PROFESSOR
- Visualizacao por ADMIN, PROFESSOR e RECEPCAO
- Exercicios com grupo muscular, series, repeticoes, carga, descanso, ordem e observacoes
- Midias por exercicio
- Upload local de imagem nos formatos JPG, PNG e WEBP
- Links externos de imagem ou video
- Link publico unico por token seguro para o aluno abrir no celular sem login
- Link publico somente leitura e sem dados financeiros, estoque, vendas, relatorios, usuarios ou permissoes
- Revogacao de link publico por ADMIN ou PROFESSOR
- Botao no frontend para copiar link e enviar mensagem manual pelo WhatsApp

## Fora do escopo

- Catraca
- Reconhecimento facial
- Aplicativo mobile de treino com login do aluno
- Emissao automatica de boletos
- Cobranca recorrente por cartao
- WhatsApp automatico
- Financeiro avancado
- Contas a pagar
- DRE
- Aplicativo Android/iOS
- Integracao com balanca, catraca ou hardware externo
- Migracao automatica complexa de dados antigos
- Agendador em background para mensalidades recorrentes
- Auditoria avancada com IP, dispositivo e diff por campo
- Login de aluno
- Chat com aluno
- Avaliacao fisica completa
- Historico de evolucao corporal
- Prescricao automatica por IA
- Biblioteca avancada de exercicios
- Integracao com YouTube API
- Controle de execucao/conclusao pelo aluno
- Comentarios do aluno
- Notificacoes push
- Upload local pesado de videos; no MVP videos entram por link externo

## Evolucoes futuras

- Edicao avancada de produtos e pagamentos no frontend
- Agendamento automatico da geracao de mensalidades
- Auditoria detalhada por campo, IP e dispositivo
- Importacao de produtos por planilha
- Importacao assistida de saldos financeiros antigos
- Configuracoes de planos e vencimentos padronizados
- Biblioteca de exercicios reutilizavel
- Upload e processamento de videos com armazenamento dedicado
- Historico de evolucao do aluno e avaliacoes fisicas
