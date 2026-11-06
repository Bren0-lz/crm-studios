# CRM Studios Aryana

Monorepo npm: React/Vite em `apps/web`, Fastify em `apps/api`, Zod/tipos em `packages/contracts`.
Interface em pt-BR; no produto, `patient` significa **cliente**. Node 22+; Windows usa `npm.cmd` se o PowerShell bloquear `npm`.

## Localizar uma mudança

- Tela/fluxo: `apps/web/src/features/<domínio>`; composição e navegação: `src/app`.
- Rotas: `apps/api/src/modules/<domínio>/routes.ts`; armazenamento: `src/storage/{memory,mysql}/<domínio>.ts`.
- Schemas/tipos: `packages/contracts/src/<domínio>/{model,types}.ts`; imports públicos também existem em `@crm/contracts/<domínio>`.
- Leia primeiro o AGENTS.md do workspace e os arquivos/testes do domínio. Consulte o Status no PLAN.md para o estado das tarefas e, para descobertas, os arquivos das tarefas relacionadas em `diario/` (STATE.md guarda o histórico até 06/11/2026); não carregue todo o histórico por padrão.

## Verificar

- `npm run check`: tipos, arquitetura/lint, testes, build e auditoria visual estática.
- `tsconfig.json` na raiz cobre Playwright e configurações de testes; os workspaces mantêm seus próprios tsconfigs. ESLint define `tsconfigRootDir` por workspace para também funcionar no editor e em execuções conjuntas.
- `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`.
- Cobertura completa usa `TEST_DATABASE_URL` de banco exclusivo de testes para incluir memória e MySQL; CI mede no job MySQL, mantendo as metas existentes.
- Teste focado: `npm exec -w @crm/web -- vitest run src/features/.../arquivo.integration.test.tsx` (também API/contracts).
- `npm run test:e2e`: compila e testa desktop/celular contra API nova em memória por cenário.
- `npm run test:mysql`: somente com TEST_DATABASE_URL de testes; CI exige a variável.

## Invariantes

- Banco é MySQL 8/MariaDB 10.6+ (o Postgres saiu em 30/10/2026): migração nova e SQL seguem a seção "Banco de dados: MySQL/MariaDB" do CLAUDE.md; `storage/mysql/mysql-dialect.unit.test.ts` reprova sintaxe do Postgres. Branch ou PR de antes da troca: porte para `storage/mysql` e renumere a migração antes de abrir/atualizar o PR.

- Preserve URLs, formatos HTTP, permissões, aliases antigos e textos da interface.
- Toda operação de repositório deve existir em memória e MySQL; escrituras relacionadas mantêm a mesma transação e filtro clinic_id.
- Shared não importa funcionalidades; funcionalidades usam entradas públicas de outras. Não introduza ciclos de execução.
- Testes unitários: `*.unit.test.*`; integração: `*.integration.test.*`; navegador: `e2e/*.spec.ts`. Timeout Vitest: 20s.
- Não altere migrações existentes, .env ou compose.yaml nem faça deploy sem autorização específica.
- Ao terminar uma tarefa, sempre abra um PR: commit, `git push` do branch da tarefa e pull request para o branch padrão (nunca push direto nele nem force-push). Fora disso, não faça push sem autorização.

As orientações detalhadas de design continuam em CLAUDE.md. Estas instruções e os AGENTS.md dos workspaces são o mapa atual do código.
