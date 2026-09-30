# Movimenta CRM

CRM web para clínica de fisioterapia/estúdio (Pilates, dançaterapia, depilação), usado só pela
equipe — não existe app nem portal do cliente. Interface e textos em pt-BR; a entidade
"paciente" é chamada de **cliente** em tudo que o usuário vê (no código os nomes seguem `patient`).

## Desenvolvimento autônomo (autodev)

### Gates — comandos de verificação
- `npm run typecheck` — ~25s
- `npm run lint` — ~23s (`--max-warnings=0`)
- `npm test` — ~29s (contracts, API em memória, web)
- `npm run build` — ~30s

- `node apps/web/scripts/audit-panels.cjs` — ~2s (layout: filhos de `.panel` sem espaçamento
  lateral; a partir da D03, também grids de várias colunas sem regra para celular)

Gate completo: `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs` (~2 min).
Na rodada 2, o `audit-panels` só passa a valer depois da D01 (que zera os apontamentos atuais).
Nunca edite o `audit-panels.cjs` para esconder um apontamento — corrija o layout ou reporte BLOCKED.
Limite de tempo dos testes: 20s (máquina lenta com OneDrive); não altere.
Gate focado num arquivo de teste: `npm exec -w @crm/api -- vitest run src/<arquivo>.test.ts`
(idem `@crm/web`, `@crm/contracts`). Não use `npm test -w <pacote> -- <filtro>`: o script já
passa `src` como filtro, roda tudo e retorna 0 mesmo se o arquivo filtrado não existir.
Uma tarefa só está concluída quando todos retornam exit code 0.

Fora dos gates: `npm run format:check` (já falha em arquivos antigos) e `npm run test:postgres`
(exige `TEST_DATABASE_URL`; os testes ficam `skip` sem ele — escreva-os mesmo assim).

### Regras do loop
- O estado real está em `PLAN.md` e `STATE.md`. Nunca confie na memória da conversa.
- Uma tarefa por vez. Um commit por tarefa concluída, mensagem em pt-BR.
- Commits **sem** `Co-Authored-By` e sem "Generated with Claude".
- Nunca marque `DONE` sem a saída real do comando de gate.
- Ambiguidade não se resolve por chute: marque `BLOCKED` e pare.
- Nunca fazer sem me perguntar: `git push`; editar `.env` ou `compose.yaml`; adicionar ou
  atualizar dependências npm; editar `docs/PLANO_*.md`; editar migrações existentes
  (criar migração **nova** com o próximo número é permitido).

### Convenções do projeto
- **Monorepo npm workspaces**: `packages/contracts` (zod + tipos compartilhados, importado
  direto do `src`), `apps/api` (Fastify), `apps/web` (React + Vite, react-router, lucide-react).
- **Contratos primeiro**: esquemas de entrada (`xxxInputSchema`) e interfaces de saída ficam em
  `packages/contracts/src/index.ts`; helpers puros compartilhados também (ex.: `nextPlanPeriod`).
- **Repositório duplo**: todo método novo entra na interface `ClinicRepository`
  (`apps/api/src/repository.ts`) e é implementado **nos dois**:
  `memory-repository.ts` e `postgres-repository.ts`. Os testes da API usam o de memória;
  o PostgreSQL tem testes opt-in em `postgres.integration.test.ts`.
- **PostgreSQL**: operações com escrita em várias tabelas usam transação
  (`this.inTransaction(...)`); tudo filtrado por `clinic_id`. Migrações em
  `apps/api/migrations/00NN_nome.sql`, aplicadas em ordem automaticamente.
- **Rotas** em `apps/api/src/app.ts`: `preHandler: authenticate` + guardas de perfil
  (`requireCommercialAccess`, `requireFinanceAccess`…); erros de domínio com
  `DomainError(code, mensagem pt-BR, status)`.
- **Web**: páginas e modais em `apps/web/src/App.tsx`; cliente HTTP em `apps/web/src/api.ts`;
  estilos em `apps/web/src/styles.css` (reaproveitar classes existentes: `panel`, `form-grid`,
  `checkbox-field`, `status-pill`, `secondary-button`…). Datas exibidas com `shortDate`/
  `formatIsoDate` (formato "01 de out.").
- **Testes**: Vitest. API via `app.inject` com `MemoryClinicRepository`
  (`apps/api/src/app.test.ts`); web com Testing Library e `fetch` mockado
  (`apps/web/src/App.test.tsx`); contratos em `packages/contracts/src/contracts.test.ts`.
- **Dados demo**: `demo-patients.ts`, `demo-scenarios.ts` e `seed-demo-scenarios.ts` — se um
  tipo ganhar campo obrigatório, atualize-os também.
- **Documentação**: só edite `docs/STATUS_IMPLEMENTACAO.md` e `README.md` quando o escopo da
  tarefa pedir. O `PLAN.md` tem tarefas dedicadas de documentação; editar esses arquivos em outra
  tarefa é escopo além do pedido e o verifier reprova.

### Design de páginas
- **Estrutura**: página nova começa com `PageHeader`; conteúdo fica dentro de `.panel`. O
  `.panel` não tem padding: cada filho direto usa `panel-head` (`padding: 21px 23px`) ou um
  bloco com respiro lateral próprio (padrão 23px). Exceções: `.admin-grid > .panel` e
  `.groups-layout > .panel`, que já recebem padding.
- **Tokens**: CSS novo usa `--space-1`…`--space-8` (4, 8, 12, 16, 24, 32, 48, 64px) e
  `--radius-sm/md/lg` (8, 12, 18px); valor fora da escala via `calc(var(--space-N) ± Xpx)`.
  Nada de px soltos para espaçamento e nada de `style={{}}` no JSX.
- **Celular**: toda regra com `grid-template-columns` de 2+ trilhas precisa de regra no bloco
  `@media (max-width: 700px)` que reduza a 1 coluna (ou usar `auto-fit`/`auto-fill`). Exceção só
  com `/* audit: mobile-ok <motivo real> */` logo acima da regra.
- **Estados**: toda tela/lista com dados remotos trata carregando (`LoadingBlock`), vazio
  (`EmptyState`) e erro (`ErrorBanner`/`error-banner`; em formulário, `form-error`).
- **Tabelas**: valores numéricos e monetários alinhados à direita (`text-align: right`).
- **Reaproveitar** antes de criar: `panel`, `panel-head`, `list-toolbar`, `form-grid`,
  `clinical-form`, `plan-card`, `plans-grid`, `status-pill`, `success-banner`, `Modal`,
  `modal-actions`, `page-actions`, `tag-filter`, `table-row`, `primary-button`/`secondary-button`
  (já são `inline-flex` com `gap`: ícone + texto sem CSS extra).
