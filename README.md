# Studios Aryana — CRM para clínica de fisioterapia e estúdio

[![CRM checks](https://github.com/Bren0-lz/crm-studios/actions/workflows/ci.yml/badge.svg)](https://github.com/Bren0-lz/crm-studios/actions/workflows/ci.yml)

Sistema web completo (CRM + ERP leve) feito para um negócio real, o **Studios Aryana**:
fisioterapia, Pilates, dançaterapia e depilação. A equipe usa o sistema para agenda, prontuário
clínico, planos e pacotes, financeiro, vendas, relacionamento com clientes e relatórios
gerenciais. Toda a interface é em português e pensada para o dia a dia da recepção, dos
profissionais e da gestão — no computador, no tablet e no celular.

**Autor:** Breno Luiz · **Período:** setembro de 2026 até hoje · **Situação:** em uso e em
evolução contínua, publicado na Hostinger (Node.js + MySQL).

---

## Resumo em números

| Indicador                          | Valor                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| Commits / pull requests integrados | ~1.000 commits, 260+ PRs revisados e integrados na `main`  |
| Código de produção em TypeScript   | ~150 mil linhas (front-end, back-end e contratos)          |
| Testes automatizados               | ~2.100 casos em ~400 arquivos (unitários, integração, E2E) |
| Domínios de negócio                | 19 (agenda, clínico, financeiro, comercial, planos…)       |
| Migrações de banco                 | 39 arquivos SQL versionados, aplicados automaticamente     |
| Pipeline de CI                     | 3 jobs no GitHub Actions a cada PR                         |

---

## Como este projeto atende aos critérios da bolsa

| Critério                                     | Onde ver no projeto                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GitHub**                                   | Fluxo com branch por tarefa, pull request, revisão e CI obrigatório antes do merge; histórico com 1.000+ commits; [workflow de CI](.github/workflows/ci.yml); regras de PR sem conflito em [CLAUDE.md](CLAUDE.md). |
| **Banco de dados**                           | MySQL 8 / MariaDB com 39 [migrações versionadas](apps/api/migrations), transações, isolamento por clínica (`clinic_id`), travas para evitar conflito de agenda e testes de integração contra banco real.           |
| **TypeScript**                               | 100% TypeScript em modo estrito, do banco à tela; tipos e validações compartilhados entre front e back no pacote [`packages/contracts`](packages/contracts).                                                       |
| **React**                                    | SPA em React 19 com react-router, componentes reutilizáveis ([`apps/web/src/shared`](apps/web/src/shared)) e telas organizadas por funcionalidade ([`apps/web/src/features`](apps/web/src/features)).              |
| **Next.js**                                  | Não usado neste projeto: optei por React + Vite (SPA) com API própria em Fastify, porque o sistema é interno, autenticado e não precisa de SSR/SEO. Os conceitos (roteamento, componentes, build) são os mesmos.   |
| **Testes automatizados**                     | Vitest (unitário e integração), Testing Library (telas), Playwright (E2E em desktop e celular), testes contra MySQL real, metas de cobertura e auditoria automática de layout.                                     |
| **Outros frameworks de desenvolvimento web** | Fastify, Zod, Vite, TipTap (editor de contratos), React PDF, ExcelJS (importação/exportação de planilhas), JWT, bcrypt, ESLint, Prettier, esbuild.                                                                 |
| **Design e prototipagem de interfaces**      | Design system próprio com tokens de espaço, raio e tipografia ([`apps/web/src/styles`](apps/web/src/styles)), regras de design documentadas, layout responsivo e um script que reprova violações visuais no CI.    |

---

## O problema e a solução

O estúdio controlava agenda, pacotes de sessões, pagamentos e prontuários em planilhas, papel e
WhatsApp. Isso gerava sessões esquecidas, pacotes vencidos sem cobrança, conflitos de horário e
pouca visão do faturamento.

O CRM centraliza a operação:

- **Agenda** diária e semanal, com recorrência, bloqueios, feriados, reagendamento com histórico
  e **prevenção de conflitos** de profissional e sala.
- **Clientes**: cadastro, busca, etiquetas, importação de planilha CSV/XLSX com detecção de
  duplicados, exportação, histórico completo e botão **SOS** com o contato de emergência.
- **Prontuário clínico** (SOAP), avaliações configuráveis, objetivos, medições, anexos protegidos
  e bloqueio para perfis sem acesso clínico.
- **Planos e pacotes**: catálogo, saldo e extrato de sessões, consumo automático ao finalizar o
  atendimento, estorno ao reabrir e renovação manual ou automática.
- **Financeiro**: contas a receber e a pagar, despesas fixas recorrentes, caixa do dia, fluxo de
  caixa, previsão de 3/6/12 meses, renegociação parcelada, recibos e comissões por profissional.
- **Comercial**: funil Kanban de leads, aulas experimentais, tarefas e conversão de lead em cliente.
- **Relacionamento**: contatos sugeridos (sem retorno, aniversário, plano vencendo), comunicados
  segmentados, pesquisa de satisfação com **NPS**.
- **Contratos**: modelos versionados, emissão com cópia imutável e impressão.
- **Relatórios gerenciais**: DRE básica, rentabilidade, retenção, cancelamentos, rankings e
  livro mensal de vendas exportado em Excel.
- **Permissões** por usuário e por operação, conferidas pela API a cada requisição
  ([mapa de permissões](docs/permissoes.md)).

Decisão de escopo: não existe app nem portal do cliente — o sistema é usado só pela equipe,
o que simplifica segurança e LGPD.

---

## Arquitetura

```text
┌──────────────────────────┐   HTTP/JSON   ┌───────────────────────────┐        ┌──────────────┐
│ apps/web                 │ ────────────▶ │ apps/api                  │ ─────▶ │ MySQL 8 /    │
│ React 19 + Vite          │               │ Fastify 5 + JWT           │        │ MariaDB      │
│ react-router, TipTap     │               │ rotas por domínio         │        └──────────────┘
└────────────┬─────────────┘               │ repositório memória/MySQL │
             │                             └────────────┬──────────────┘
             └──────────── packages/contracts ──────────┘
                     (schemas Zod + tipos compartilhados)
```

Pontos que gosto de destacar:

- **Contratos primeiro**: cada domínio tem seus schemas Zod em `packages/contracts`. O mesmo
  schema valida o formulário na tela e a requisição na API, e o TypeScript acusa qualquer
  divergência entre os dois lados.
- **Repositório duplo**: a interface `ClinicRepository` tem duas implementações — em memória
  (testes rápidos e demonstração) e MySQL (produção). Os mesmos testes rodam contra as duas.
- **Monorepo com npm workspaces** e **checagem de arquitetura** própria
  ([`scripts/check-architecture.mjs`](scripts/check-architecture.mjs)) que impede ciclos de
  importação e que código compartilhado dependa de uma funcionalidade específica.
- **Regras no código, não no banco**: sem gatilhos ou procedures, o que permite rodar em
  hospedagem compartilhada; operações com várias tabelas usam transação.
- **Migração de banco em produção**: o projeto começou em PostgreSQL e foi migrado para
  MySQL/MariaDB para caber na hospedagem. Um teste automatizado
  (`mysql-dialect.unit.test.ts`) reprova qualquer SQL no dialeto antigo.
- **Deploy** em um único processo Node na Hostinger (site + API no mesmo domínio), gerado por
  [`scripts/hostinger-build.mjs`](scripts/hostinger-build.mjs) com esbuild.

```text
apps/api/src/modules     rotas, serviços e testes por domínio
apps/api/src/storage     armazenamento em memória e MySQL, por domínio
apps/api/migrations      migrações SQL versionadas
apps/web/src/app         composição, navegação e layout
apps/web/src/features    telas, formulários e testes por funcionalidade
apps/web/src/shared      componentes, hooks, autenticação e cliente HTTP
apps/web/src/styles      design system (tokens e estilos por módulo)
packages/contracts/src   schemas, tipos e helpers por domínio
e2e                      fluxos reais no navegador (desktop e celular)
```

---

## Testes automatizados

| Camada              | Ferramenta                          | O que cobre                                                       |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Unitários           | Vitest                              | regras de negócio, cálculos financeiros, schemas e helpers        |
| Integração da API   | Vitest + `app.inject` (Fastify)     | rotas reais com autenticação, permissões e repositório em memória |
| Integração do banco | Vitest + MySQL/MariaDB real         | 42 arquivos que criam e apagam o próprio banco de teste           |
| Interface           | Testing Library + jsdom             | telas e formulários com `fetch` simulado                          |
| Ponta a ponta (E2E) | Playwright (Chromium)               | 14 fluxos completos em desktop e celular                          |
| Layout              | script próprio (`audit-panels.cjs`) | espaçamento, responsividade e escala tipográfica                  |
| Cobertura           | `@vitest/coverage-v8`               | metas mínimas por workspace, que não podem cair                   |

O CI no GitHub Actions roda três jobs em todo pull request: **checks** (tipos, lint, testes,
build e auditoria visual), **browser** (Playwright) e **mysql** (testes contra MariaDB real +
cobertura).

```bash
npm run check             # gate completo: typecheck, lint, testes, build e auditoria
npm run test:unit
npm run test:integration
npm run test:coverage
npx playwright install chromium && npm run test:e2e
```

---

## Design e prototipagem de interface

- **Design system com tokens**: espaçamento (`--space-1` a `--space-8`, escala de 4 a 64px),
  raios, sombras e uma escala tipográfica fechada. Nenhum texto abaixo de 12px.
- **Diretrizes escritas** (seção "Design de páginas" do [CLAUDE.md](CLAUDE.md)): estrutura de
  páginas, tom visual sóbrio, estados de carregando/vazio/erro em toda tela, comportamento de
  modais, alinhamento de valores em tabelas.
- **Responsivo**: toda grade de várias colunas precisa de versão em uma coluna no celular.
- **Design verificado automaticamente**: [`audit-panels.cjs`](apps/web/scripts/audit-panels.cjs)
  analisa o CSS e o JSX e reprova o build se uma regra de design for violada.
- **Componentes reutilizáveis**: `PageHeader`, `Modal`, `EmptyState`, `LoadingBlock`,
  `ErrorBanner`, painéis, filtros e botões padronizados.
- Prototipagem iterativa: cada rodada de testes de uso (QA) virou uma lista
  de ajustes no [`PLAN.md`](PLAN.md), implementados e validados um a um.

---

## Processo de desenvolvimento

- Uma tarefa por branch, um pull request por tarefa, com descrição e saída dos testes.
- Nenhum merge sem o CI verde.
- Planejamento em [`PLAN.md`](PLAN.md) e acompanhamento em [`STATE.md`](STATE.md).
- Uso de IA como ferramenta de engenharia: configurei agentes do Claude Code
  ([`.claude/agents`](.claude/agents)) com papéis separados — um implementa, outro verifica do
  zero — e regras de qualidade obrigatórias (gates de teste, padrões de banco e de design). Eu
  defino requisitos, arquitetura e regras, reviso os PRs e valido com a cliente.

---

## Executar localmente

Requisitos: Node.js 22 ou mais recente e npm.

```bash
npm install
npm run dev
```

Interface em `http://localhost:5173` e API em `http://localhost:3333`. Por padrão os dados ficam
em memória, com uma base de demonstração fictícia (123 clientes, planos, atendimentos, turmas e
pagamentos).

Acesso de demonstração:

```text
admin@movimenta.local
Admin@123
```

### Cenários de demonstração

Busque estas etiquetas em **Clientes** para ver cada trajetória:

| Etiqueta                 | Cenário                                                |
| ------------------------ | ------------------------------------------------------ |
| Frequente / Dançaterapia | plano ativo de 24 aulas, com presença e próximas aulas |
| Frequente / Pilates      | sessões concluídas e retorno agendado                  |
| Em tratamento            | pacote de fisioterapia com saldo de sessões            |
| Serviço avulso           | compras de depilação                                   |
| Assinatura cancelada     | ex-alunos com pagamentos e parcelas canceladas         |
| Sem retorno              | pacote vencido e sessões restantes                     |
| Pagamento atrasado       | plano ativo com parcela vencida                        |

### Com banco MySQL/MariaDB

Copie `.env.example` para `.env` e configure:

```text
STORAGE_MODE=mysql
DATABASE_URL=mysql://<usuário>:<senha>@localhost:3306/crm
SEED_DEMO_DATA=true
```

```bash
npm run db:setup
npm run dev
```

As migrações rodam automaticamente e ficam registradas em `schema_migrations`. Para os testes
de banco, use um banco exclusivo de testes (nunca produção):

```bash
TEST_DATABASE_URL=mysql://<usuário>:<senha>@127.0.0.1:3306/crm_test npm run test:mysql
```

Mais detalhes para localizar código e rodar testes focados em [AGENTS.md](AGENTS.md).
