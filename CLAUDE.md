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

Gate completo: `npm run typecheck && npm run lint && npm test && npm run build` (~2 min).
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
