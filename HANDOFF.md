# HANDOFF — Studios Aryana (continuar em nova sessão do Claude Code)

Atualizado em 02/10/2026. Este arquivo só passa o bastão entre sessões. O estado vivo do trabalho
está em `PLAN.md` e `STATE.md` (o diário no fim do `STATE.md` tem os detalhes técnicos de cada
tarefa), e as regras permanentes em `CLAUDE.md`.

## Primeira coisa a fazer na nova sessão

1. Ler `CLAUDE.md`, o cabeçalho e as últimas ~15 linhas do diário de `STATE.md`, e o `PLAN.md`.
2. `git status` e `git log --oneline -3`: a árvore deve estar limpa e a `main` igual à do GitHub
   (último commit enviado: o que adicionou este HANDOFF; antes dele, `2b76f48`).
3. Resolver a **V2** com o dono (abaixo) antes de chamar `/next`.

## O que é o projeto

CRM web da clínica/estúdio **Studios Aryana** (Pilates, dançaterapia, depilação), usado só pela
equipe. Monorepo npm: `packages/contracts` (zod + tipos), `apps/api` (Fastify, repositório em
memória **e** PostgreSQL), `apps/web` (React + Vite). Interface em pt-BR; "paciente" aparece como
**cliente**. O produto se chamava "Movimenta": `CLAUDE.md`, `README.md` e `docs/` ainda usam o nome
antigo (a T041 atualiza a documentação). O e-mail de login demo continua `admin@movimenta.local`
(senha `Admin@123`, gestora "Aryana Dutra").

## Como o trabalho está organizado (loop autodev)

- `PLAN.md` = tarefas com escopo, gate e dependências; `STATE.md` = tarefa atual + diário.
- `/next` executa **uma** tarefa: implementer → verifier independente → commit local.
- Agentes: `.claude/agents/implementer.md` e `verifier.md`; comando `.claude/commands/next.md`.
- Tarefas `**Tipo:** manual` (V2, V3) param o loop: ficam `BLOCKED` até o dono aprovar no chat.
- Modo automático usado nesta sessão: `/loop /next` (ritmo dinâmico; para sozinho em BLOCKED).
- **Push:** o `.claude/settings.json` bloqueia `git push` para o Claude. Quem publica é o dono,
  rodando `! git push`. Commits sem `Co-Authored-By` e sem "Generated with Claude".

### Gate completo (use este, não o do `CLAUDE.md`)

```
npm run typecheck && npm run lint && node scripts/with-direct-db.cjs npm test && npm run build && node apps/web/scripts/audit-panels.cjs
```

`scripts/with-direct-db.cjs` roda o comando com `TEST_DATABASE_URL` trocada pela **conexão direta**
do Supabase (`db.<ref>.supabase.co:5432`, sem pooler, até 60 conexões). Lê o `.env`, não imprime
credenciais e não altera o `.env`. Motivo: o pooler em modo sessão (limite de 15 clientes) vive
saturado e os testes de integração falhavam com `EMAXCONNSESSION`. Integração sozinha:
`node scripts/with-direct-db.cjs npm exec -w @crm/api -- vitest run src/postgres.integration.test.ts`
(hoje: 21 testes, todos passando). Os verifiers devem confirmar que a integração rodou sem skip.

## Onde paramos

- **Rodadas 1 e 2 (T001–T033):** concluídas, inclusive feriados, experimentais/leads,
  conversão, SOS, despesas fixas, caixa do dia e previsão.
- **Rodada 3 (pedido do dono, T042–T046 + T034/T035):** concluída e publicada.
  - T042 marca "Studios Aryana" e gestora "Aryana Dutra" (migração 0037).
  - T043/T044 aba **Contratos** de volta (`/contratos`; modelos versionados + emissão + impressão,
    sem declaração de comparecimento; tabelas recriadas vazias pela migração 0038).
  - T034/T035 exportação de clientes (só gestora; CSV/XLSX, colunas, filtros da tela, auditoria).
  - T045 paginação em Clientes (20 por página). T046 modais sem desfoque e sem rolar o fundo.
- **Ajustes pedidos depois, já publicados:** logo só com o texto "Studios Aryana" em Cormorant
  Garamond (24 px no menu do celular); ícones de Importar (seta para baixo) e Exportar (seta para
  cima) em Clientes.
- **Correções de produção, já publicadas:**
  - Planos e Prontuários davam 500: a web manda `patientId=` vazio e o PostgreSQL rejeitava `''`
    como uuid. Rotas usam `optionalPatientFilterSchema` (vazio = todos; inválido = 400).
  - Site fora do ar por `EMAXCONNSESSION`: a função da Vercel agora troca o pooler do Supabase da
    porta 5432 (sessão) para 6543 (transação) e usa 1 conexão por instância
    (`serverlessDatabaseUrl` em `apps/api/src/database-connection.ts`).
  - O site era compilado com o React de desenvolvimento (929 KB): `scripts/vercel-build.mjs` força
    `NODE_ENV=production` no build da web (agora 588 KB).
- **Próximo passo: V2 (revisão visual manual)**, status `BLOCKED` no `PLAN.md`. O dono revisa no
  site, em tela cheia e no celular: marca, Contratos, Exportar e paginação em Clientes, modais,
  agenda (feriado, selo Experimental, SOS), CRM (Agendar experimental), Financeiro (despesas fixas,
  caixa do dia, previsão) e o `.sales-help` colado na borda inferior em Relatórios (pendência da
  V1). Se aprovar: marcar V2 `DONE`, `Bloqueios: nenhum`, e o loop segue com T036–T040, V3 e T041.
  Se pedir correções: criar tarefas novas antes de T036.
- **Próxima migração livre: 0039.**

## Infraestrutura

### Supabase (PostgreSQL de teste, que **também é o banco do site**)
- `.env` local (não versionado, do dono): `DATABASE_URL` e `TEST_DATABASE_URL` no Session pooler
  (5432), `STORAGE_MODE=postgres`, `DATABASE_SSL=auto`. O `config.ts` carrega o `.env`, então
  `npm test` roda a integração PG de verdade.
- Os testes de integração aplicam as migrações pendentes no banco ao rodar; `npm run db:setup`
  também (migrações + seed idempotente). Migrações recusam o Transaction pooler (6543).
- O banco **não tem categorias financeiras nem centros de custo**: para cadastrar contas a pagar
  ou despesas fixas no site é preciso criá-los antes. Os testes criam os seus próprios.
- Diagnóstico de conexões: consultar `pg_stat_activity` pelo Transaction pooler (6543) ou pela
  conexão direta; nunca imprimir a URL.

### Vercel (site + API no mesmo domínio: https://crm-studios.vercel.app)
- `npm run vercel-build` gera `.vercel/output` (site com `VITE_API_URL=/api` + função `api.func`
  em `gru1`/São Paulo, mesma região do banco). Migrações **não** rodam na Vercel.
- Variáveis (painel, Production): `STORAGE_MODE=postgres`, `DATABASE_URL`, `JWT_SECRET`,
  `NODE_ENV`, `WEB_ORIGIN`. A `DATABASE_URL` está apontando para o **Session pooler (5432)**; o código
  contorna, mas o recomendado é o dono trocar pela do Transaction pooler (6543) e fazer Redeploy.
  Vale também conferir se `NODE_ENV` está como `production`.
- Para confirmar um deploy sem o painel: a página serve `assets/index-<hash>.js`; checar no bundle o
  que mudou (ex.: `grep jsxDEV` deve dar 0). A API responde em `/api/health`.

## Pendências e avisos para o dono

- **Banco de teste = banco do site.** Testes criam/apagam registros nele e disputam conexões com o
  site. Recomendado: projeto Supabase separado para testes (ou aumentar o Pool Size no Supabase).
- A tela de login mostra o acesso demo; quem tiver o link entra como gestora. Considerar Deployment
  Protection na Vercel.
- Exportação CSV não neutraliza valores que começam com `=`, `+`, `-`, `@` (injeção de fórmula no
  Excel). Não tratado porque mexeria em telefones com `+`.
- Telas antigas ainda usam `window.prompt/confirm` (leads, financeiro, usuários, feriados,
  bloqueios); as novas usam `Modal`.
- "Vendido líquido" negativo no demo (cancelamentos > vendas): regra de negócio não decidida.
- Avisos "LF will be replaced by CRLF" no git são normais nesta máquina.

## Armadilhas do ambiente (economizam tempo)

- Repositório no OneDrive, máquina lenta e com pouca memória: `testTimeout` de 20 s (não mexer).
  Se o vitest cair com exit 134 ("semi space"/"Zone Allocation"), repetir com
  `NODE_OPTIONS=--max-semi-space-size=2` só no comando.
- Subagentes às vezes travam (watchdog de 10 min) ou são cortados quando a sessão fecha: conferir
  `git status` e retomar o agente com SendMessage ou relançar o verifier do zero.
- Lint `react-hooks/set-state-in-effect` está ativo: zerar estado no handler, não no `useEffect`;
  buscas em função de módulo com setters no `.then`.
- Diálogo de tela cheia novo deve usar `useBodyScrollLock()` (ou o `Modal`), nunca mexer direto em
  `document.body.style.overflow`.
- Edit/Write/sed transformam `﻿` em BOM literal, que o ESLint reprova: escrever o escape.
- Para ver o app localmente sem tocar no Supabase: API com `STORAGE_MODE=memory API_PORT=3344
  WEB_ORIGIN=http://localhost:5190 npx tsx src/server.ts` (em `apps/api`) e web com
  `VITE_API_URL=http://localhost:3344 npx vite --port 5190 --strictPort` (em `apps/web`). Não usar
  as portas 3333/5173 do dono. Encerrar os processos depois (TaskStop + taskkill do PID da porta),
  porque uma API local ligada ao Supabase segura conexões do pooler.
- Navegador: usar o Chrome conectado do notebook; abrir aba nova e fechar ao terminar. Login de
  teste só em `localhost` (no site publicado, testar pela API com curl).
- `.env` é do dono: nunca editar; nunca pedir senha no chat.
- Prioridade do dono: funcionalidades primeiro; infraestrutura e segurança só quando ele pedir.
