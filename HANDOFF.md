# HANDOFF — Movimenta CRM (continuar em nova sessão do Claude Code)

Atualizado em 30/09/2026. Este arquivo existe só para passar o bastão entre sessões; o estado vivo
do trabalho está em `PLAN.md` e `STATE.md`, e as regras permanentes em `CLAUDE.md`.

## Primeira coisa a fazer na nova sessão

1. Ler `CLAUDE.md`, `STATE.md` (cabeçalho + últimas linhas do diário) e `PLAN.md`.
2. Rodar `git status` e `git log --oneline -5`: a árvore deve estar limpa e a `main` igual à do
   GitHub (último commit enviado: `488968e`).
3. Resolver a pendência da **V1** (abaixo) antes de chamar `/next`.

## O que é o projeto

CRM web para uma clínica de fisioterapia/estúdio (Pilates, dançaterapia, depilação), usado só
pela equipe. Monorepo npm: `packages/contracts` (zod + tipos), `apps/api` (Fastify, repositório
em memória **e** PostgreSQL), `apps/web` (React + Vite). Interface em pt-BR; "paciente" aparece
como **cliente** para o usuário. Visão geral e funcionalidades: `README.md`;
histórico por incremento: `docs/STATUS_IMPLEMENTACAO.md`.

## Como o trabalho está organizado (loop autodev)

- `PLAN.md` = tarefas com escopo, gate e dependências; `STATE.md` = tarefa atual + diário.
- `/next` executa **uma** tarefa: implementer → verifier independente → commit (sem push).
- Agentes: `.claude/agents/implementer.md`, `.claude/agents/verifier.md`; comando:
  `.claude/commands/next.md`; permissões: `.claude/settings.json` (push bloqueado).
- Tarefas `**Tipo:** manual` (V1, V2, V3) param o loop: o `/next` marca `BLOCKED` e chama o dono.
- Loop sem supervisão (PowerShell, para sozinho em BLOCKED ou sem TODO):
  ```powershell
  while ((Select-String PLAN.md -Pattern '\*\*Status:\*\* TODO' -Quiet) -and -not (Select-String PLAN.md -Pattern '\*\*Status:\*\* BLOCKED' -Quiet)) { claude -p "/next" --permission-mode acceptEdits }
  ```
- Gate completo (todas as tarefas):
  `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`

## Onde paramos

- **Rodada 1 (T001–T018):** concluída — Central de relacionamento, aniversários, CREFITO, NPS,
  histórico do cliente, importação de clientes, renovação de planos.
- **Rodada 2 — design (D01–D05):** concluída — espaçamento de painéis, tokens `--space-*`/
  `--radius-*`, regras de celular, regras de design no `CLAUDE.md`, correções da revisão.
  `apps/web/scripts/audit-panels.cjs` faz 3 checagens de layout e é gate.
- **V1 (revisão visual manual): pendente de decisão do dono.** A revisão de 30/09 (Chrome do
  notebook, 1440px e 390px) confirmou todas as correções. Sobrou **um** item: em Relatórios, o
  texto `.sales-help` ("A planilha traz cada venda…") encosta na borda **inferior** do painel
  `.sales-report` (1px). Opções já apresentadas ao dono: (a) criar uma tarefa **D06** só com a
  margem inferior e refazer a V1; (b) aprovar a V1 agora e levar o item para a V2.
  O `audit-panels` também acusa os `<summary>` dos `details.report-disclosure` — é falso positivo
  (o texto tem 18px de respiro interno).
- **Depois da V1:** T019–T041 (feriados, experimental de lead sem converter, declaração de
  comparecimento, SOS, despesas recorrentes, caixa do dia, previsão, exportação, retenção,
  rankings, comunicado segmentado), com revisões manuais V2 e V3. Próxima migração livre: **0031**.
  A T022 é a mais arriscada (`Appointment.patientId` passa a ser opcional).

## Infraestrutura já montada (fora do plano, a pedido do dono)

### Supabase (PostgreSQL)
- Projeto **de teste** do dono. `.env` local (não versionado) usa o **Session pooler** (porta
  5432) em `DATABASE_URL` **e** `TEST_DATABASE_URL`, `STORAGE_MODE=postgres`, `DATABASE_SSL=auto`.
- `apps/api/src/database-connection.ts`: TLS automático em hosts do Supabase, remove `sslmode`
  da URL, e as migrações recusam o **Transaction pooler** (porta 6543).
- `npm run db:setup` aplicou as migrações 0001–0030 + seed demo. `npm run test:postgres`
  roda 12 testes de integração (todos passando) — primeira execução achou e corrigiu um bug
  real (planos sem `cancelled_at` no PostgreSQL).
- **Consequência:** com `TEST_DATABASE_URL` preenchido, todo `npm test` (e o gate do loop) roda
  também os testes de integração no Supabase — precisa de internet (~11s na API). Para desligar,
  esvaziar `TEST_DATABASE_URL`.

### Vercel (site + API no mesmo domínio) — **no ar e funcionando**
- `npm run vercel-build` (`scripts/vercel-build.mjs`) gera `.vercel/output` (Build Output API):
  site com `VITE_API_URL=/api` + função `api.func` (esbuild de `apps/api/src/serverless.ts`) +
  rotas (`/api/*` → função; demais → `index.html`). `vercel.json` define install/build.
- `apps/api/src/serverless.ts` responde JSON `SERVER_START_FAILED` com o motivo quando a API não
  inicia; `serverless-app.ts` monta o Fastify sem migrações/seed, pool `max: 3`, testa o banco na
  partida e recusa `STORAGE_MODE≠postgres` e o `JWT_SECRET` padrão.
- Painel da Vercel: Root Directory = raiz do repo; Framework = Other; sem overrides de build.
  Variáveis (cadastradas pelo dono, ambiente Production): `STORAGE_MODE=postgres`,
  `DATABASE_URL` (**Transaction pooler, 6543**), `JWT_SECRET`, `NODE_ENV=production`,
  `WEB_ORIGIN`. Variáveis só valem para deploys novos — sempre Redeploy após alterar.
- Migrações **não** rodam na Vercel: antes de publicar uma versão com migração nova (T019 em
  diante criam 0031+), rodar `npm run db:setup` localmente pelo Session pooler.

## Pendências e avisos para o dono

- **Site do cliente usa o banco de teste.** Os testes de integração criam/apagam registros nele,
  e o que o cliente fizer fica misturado. Recomendado: um projeto Supabase só para o site.
- A tela de login mostra `admin@movimenta.local / Admin@123` — quem tiver o link entra como
  gestora. Considerar Deployment Protection na Vercel.
- No demo, "Vendido líquido" aparece **negativo** (cancelamentos > vendas do mês) — questão de
  regra de negócio, não de layout; não decidido.
- Build web avisa bundle > 500 kB (já existia).
- Aviso do npm na Vercel sobre install script do `esbuild` não aprovado: inofensivo até agora.

## Armadilhas do ambiente (economizam tempo)

- Máquina lenta (repositório no OneDrive): `testTimeout` de 20s na API e na web — não mexer.
- **Navegador:** há dois Chrome conectados. Use o do **notebook** ("Browser 1", deviceId
  `e612acac-073d-4d29-8ad1-5be147ca1a75`) — o outro (PC) não alcança os servidores locais.
  Se as ferramentas pedirem, liste com `list_connected_browsers` e confirme com o dono.
- A janela do Chrome costuma ficar minimizada (largura 0, capturas falham). Para medir layout
  mesmo assim: carregar a rota num `iframe` de largura fixa (1440/390) dentro da página e medir.
- O app do dono costuma estar rodando em `localhost:5173` (web) e `:3333` (API); não matar esses
  processos. Para subir outra cópia, use outras portas (`API_PORT`, `WEB_ORIGIN`, `VITE_API_URL`).
- `.env` é do dono: nunca editar; pedir que ele edite. Nunca pedir a senha no chat.
- Commits em pt-BR, **sem** `Co-Authored-By`/"Generated with Claude". Push só quando o dono pedir
  (ele costuma rodar `! git push`). Prioridade do dono: funcionalidades primeiro; infraestrutura e
  segurança só quando ele pedir (como fez com Supabase e Vercel).
