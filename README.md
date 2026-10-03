# Studios Aryana

CRM web do Studios Aryana (fisioterapia, Pilates, dançaterapia e depilação). Primeira versão executável de um CRM web para clínicas de fisioterapia, inspirada no fluxo operacional estudado no SeuFisio e construída sem aplicativo ou portal do cliente.

## O que já funciona

- autenticação com perfis de acesso;
- painel com indicadores operacionais;
- cadastro, edição e pesquisa de clientes, com lista paginada (20 por página);
- importação de clientes por planilha CSV ou XLSX, com prévia, detecção de duplicados e modelo para download;
- exportação da base de clientes em CSV ou Excel pela gestão, com escolha de colunas e os filtros da tela;
- histórico do cliente na ficha, reunindo atendimentos, planos, pagamentos, contatos, mensagens e pesquisas;
- botão SOS na ficha e no atendimento, com o contato de emergência do cliente para ligar ou chamar no WhatsApp;
- profissionais, salas e serviços, com o CREFITO do profissional exibido no prontuário, na impressão e nos contratos emitidos;
- agenda diária e semanal, recorrência, bloqueios e reagendamento individual com histórico e prevenção de conflitos;
- feriados da clínica cadastrados em Configurações, marcados na agenda e bloqueando novos agendamentos;
- aulas experimentais e avaliações agendadas para leads sem convertê-los, com taxa de conversão em Relatórios;
- alteração do status dos atendimentos;
- prontuário clínico SOAP, avaliações configuráveis, objetivos, medições seriadas, anexos protegidos, adendos e visão longitudinal;
- bloqueio de prontuários para perfis sem acesso clínico;
- planos, pacotes, validade, saldo e extrato de sessões;
- renovação de planos manual ou automática ao fim do período;
- consumo automático ao finalizar e estorno ao reabrir atendimentos;
- financeiro com contas a receber e pagar, categorias, centros de custo, ajustes, formas de pagamento, recibos e fluxo de caixa mensal;
- despesas fixas recorrentes, que lançam a conta a pagar de cada mês automaticamente;
- caixa do dia com entradas e saídas por forma de pagamento e previsão de receitas e despesas para 3, 6 ou 12 meses;
- renegociação parcelada e comissões profissionais por competência;
- CRM comercial com Kanban, tarefas, contatos e conversão segura de leads;
- central de comunicações com opt-out, outbox e lembretes idempotentes;
- comunicado segmentado por etiquetas, situação, plano ou aniversariantes, com prévia e enfileiramento na outbox (sem envio real);
- central de relacionamento com contatos sugeridos por situação, prazos e mensagens configuráveis, registro de contatos e aniversariantes, sem envio automático;
- pesquisa de satisfação por atendimento, com NPS em Relatórios e alerta de avaliação baixa na central de relacionamento;
- contratos em `/contratos`: modelos versionados, emissão com snapshot imutável e impressão;
- relatórios gerenciais por período, DRE básica e rentabilidade por serviço/produto com exportação CSV;
- retenção e cancelamentos mês a mês, rankings de clientes por sessões e por recebimentos e distribuição por faixa etária;
- livro mensal de vendas e cancelamentos, comparação com o mês anterior, clientes sem retorno e exportação Excel detalhada;
- trilha inicial de auditoria no modelo de dados;
- interface responsiva para desktop, tablet e celular, com escala de espaçamento padronizada e modais que não desfocam nem rolam a página de fundo.

O repositório inclui dois modos de armazenamento: memória, para avaliação imediata, e PostgreSQL, para manter os dados entre reinicializações. No modo PostgreSQL, as migrações são executadas automaticamente e o banco impede conflitos simultâneos de profissional ou sala.

## Executar localmente

Requisitos: Node.js 22 ou mais recente e npm.

```bash
npm install
npm run dev
```

A interface ficará em `http://localhost:5173` e a API em `http://localhost:3333`.

Credenciais de demonstração (conta da gestora Aryana Dutra; o e-mail mantém o domínio antigo):

```text
admin@movimenta.local
Admin@123
```

O ambiente de demonstração traz 123 clientes fictícios, incluindo 120 cadastros variados de fisioterapia, depilação, dançaterapia e outros serviços. Há clientes ativos e inativos, com e sem e-mail, além de contatos, datas de nascimento e etiquetas para avaliar listas, buscas e formulários. Os e-mails usam `example.com` e os dados adicionais têm identificadores fixos; no PostgreSQL, executar o seed novamente não duplica esses cadastros.

### Cenários de operação

Com `SEED_DEMO_DATA=true`, a demonstração também inclui 56 planos com preços e parcelas, 160 atendimentos individuais, uma turma de dançaterapia duas vezes por semana e seu histórico de aulas e presenças. Busque as etiquetas abaixo em **Clientes** para examinar cada trajetória:

| Etiqueta | Cenário | Valor simulado |
| --- | --- | --- |
| Frequente / Dançaterapia | 8 clientes em plano ativo de 24 aulas, com presença e próximas aulas | R$ 1.497 em 3 parcelas |
| Frequente / Pilates | 8 clientes com sessões concluídas e retorno agendado | R$ 1.200 em 2 parcelas |
| Em tratamento | 8 clientes com pacote de fisioterapia e saldo de sessões | R$ 1.500 em 2 parcelas |
| Serviço avulso | 8 compras de depilação de pernas ou axilas | R$ 120 ou R$ 55 |
| Assinatura cancelada | 8 ex-alunos de dançaterapia com pagamentos e parcelas canceladas | R$ 1.497 por plano |
| Sem retorno | 8 clientes com pacote vencido e sessões restantes | R$ 1.500 por pacote |
| Pagamento atrasado | 8 clientes de Pilates com plano ativo e parcela vencida | R$ 1.200 em 2 parcelas |

Os planos recorrentes representam períodos contratados com sessões e parcelas. Ao fim da validade, os que têm renovação automática ganham o período seguinte com as mesmas condições; qualquer plano também pode ser renovado manualmente em **Planos**, com valores ajustáveis. As datas são posicionadas em relação ao dia em que a base é carregada pela primeira vez; reiniciar a API preserva os registros e as alterações feitas neles.

## Verificações

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Relatório mensal de vendas

Perfis de gestão e financeiro veem no painel o valor vendido, o recebido e os clientes que compareceram no mês anterior sem atendimento concluído no mês atual. A página **Relatórios** permite escolher o mês e baixar um XLSX com resumo, movimentos de vendas e cancelamentos, pagamentos e estornos, clientes sem retorno e definições dos indicadores. O mês em andamento é comparado com os mesmos dias do mês anterior; vendas seguem a data da criação do plano ou do fechamento da comanda, enquanto recebimentos seguem a data do movimento financeiro.

## Banco de dados local

PostgreSQL e Redis podem ser iniciados com:

```bash
docker compose up -d
```

Copie `.env.example` para `.env` e configure:

```text
STORAGE_MODE=postgres
DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
SEED_DEMO_DATA=true
```

Se a porta 5432 já estiver ocupada, defina `CRM_POSTGRES_PORT` e use a mesma porta em `DATABASE_URL` nesse arquivo.

```bash
npm run db:setup
npm run dev
```

`SEED_DEMO_DATA=false` desativa os dados fictícios. As migrações aplicadas ficam registradas em `schema_migrations` e podem ser executadas novamente com segurança.

Para testar a implementação contra um banco exclusivo de testes:

```bash
TEST_DATABASE_URL=postgresql://crm:crm@localhost:5432/crm_test npm run test:postgres
```

Nunca aponte `TEST_DATABASE_URL` para um banco de produção: o teste cria e remove registros próprios.

## Banco no Supabase

O Supabase pode hospedar o PostgreSQL; a API continua a mesma. No painel do projeto, em
**Connect**, copie a URL do **Session pooler** (porta 5432, usuário `postgres.<ref-do-projeto>`).
A conexão direta (`db.<ref>.supabase.co`) também funciona, mas no plano gratuito só aceita IPv6.
Não use o **Transaction pooler** (porta 6543): as migrações usam trava de sessão e a API recusa
essa porta ao migrar.

```text
STORAGE_MODE=postgres
DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres
DATABASE_SSL=auto
```

Com `DATABASE_SSL=auto`, a conexão com hosts do Supabase usa TLS sem verificar a CA. Para
verificar o certificado, baixe a CA em **Settings › Database › SSL Configuration** e use
`DATABASE_SSL=verify` com `DATABASE_SSL_CA=<caminho do .crt>`. As extensões `pgcrypto` e
`btree_gist` usadas pelas migrações já estão disponíveis no Supabase.

Depois, `npm run db:setup` aplica as migrações (e o seed demo se `SEED_DEMO_DATA=true`). Para os
testes de integração, use um projeto **só de teste** em `TEST_DATABASE_URL` e rode
`npm run test:postgres`.

## Publicação na Vercel

O projeto publica site e API no mesmo domínio: `npm run vercel-build` gera `.vercel/output`
(Build Output API) com o site estático e a API Fastify como função em `/api/*`. O
`vercel.json` já define o comando de build; no painel, deixe **Framework Preset = Other** e não
preencha Output Directory.

Variáveis de ambiente no painel da Vercel (Settings › Environment Variables):

| Variável | Valor |
| --- | --- |
| `STORAGE_MODE` | `postgres` |
| `DATABASE_URL` | URL do **Transaction pooler** do Supabase (porta **6543**) |
| `JWT_SECRET` | 32+ caracteres aleatórios (a função não sobe com o valor padrão) |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | o endereço do site, ex. `https://seu-projeto.vercel.app` |

A função não roda migrações nem seed. Antes de publicar uma versão com migração nova, aplique-as
da sua máquina com a URL do **Session pooler** (porta 5432) no `.env` e `npm run db:setup`.
A Vercel publica o que está no GitHub: faça o push dos commits antes.

## Estrutura

```text
apps/api                 API Fastify e regras de negócio
apps/web                 aplicação React responsiva
packages/contracts       contratos e validações compartilhadas
docs                     levantamento funcional e plano do produto
```

## Escopo deliberadamente excluído

Não existe aplicativo, login, portal ou autoatendimento do cliente. Toda a operação é realizada pela equipe da clínica, conforme definido no plano do projeto.
