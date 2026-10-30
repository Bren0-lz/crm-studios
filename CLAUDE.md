# Studios Aryana CRM

> O mapa atual do código e os comandos estão em AGENTS.md e nos AGENTS.md dos workspaces.
> As regras de design abaixo continuam válidas. Rotas/telas/testes são organizados por domínio.

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
Se a tarefa mexer em SQL (`storage/mysql`, migração), rode também `npm run test:mysql` com
`TEST_DATABASE_URL` (ver "Banco de dados: MySQL/MariaDB").
Nunca edite o `audit-panels.cjs` para esconder um apontamento — corrija o layout ou reporte BLOCKED.
Limite de tempo dos testes: 20s (máquina lenta com OneDrive); não altere.
Gate focado num arquivo de teste: `npm exec -w @crm/api -- vitest run src/<arquivo>.test.ts`
(idem `@crm/web`, `@crm/contracts`). Não use `npm test -w <pacote> -- <filtro>`: o script já
passa `src` como filtro, roda tudo e retorna 0 mesmo se o arquivo filtrado não existir.
Uma tarefa só está concluída quando todos retornam exit code 0.

Fora dos gates: `npm run format:check` (já falha em arquivos antigos) e `npm run test:mysql`
(exige `TEST_DATABASE_URL`; os testes ficam `skip` sem ele — escreva-os mesmo assim).

### Regras do loop

- O estado real está em `PLAN.md` e `STATE.md`. Nunca confie na memória da conversa.
- Uma tarefa por vez. Um commit por tarefa concluída, mensagem em pt-BR.
- Commits **sem** `Co-Authored-By` e sem "Generated with Claude".
- Nunca marque `DONE` sem a saída real do comando de gate.
- Ambiguidade não se resolve por chute: marque `BLOCKED` e pare.
- **Ao terminar uma tarefa, abra um PR**: depois do commit (gate verde), faça `git push` do
  branch da tarefa e abra um pull request para o branch padrão, com título `<ID>: <título>` e
  descrição em pt-BR (o que mudou e a saída do gate). Esse push é autorizado; tarefa sem PR
  aberto não está concluída. Nunca faça push direto no branch padrão nem force-push.
- Nunca fazer sem me perguntar: `git push` fora do fluxo de PR acima; editar `.env` ou `compose.yaml`; adicionar ou
  atualizar dependências npm; editar `docs/PLANO_*.md`; editar migrações existentes
  (criar migração **nova** com o próximo número é permitido).

### PRs sem conflito

Em 10/2026, 7 PRs abertos ao mesmo tempo a partir da mesma `main` antiga (`a8e69e8`) entraram
em conflito com a `main` e entre si, com números de migração repetidos. Para não repetir:

- **Comece da `main` atual**: `git fetch origin main` e crie o branch da tarefa a partir de
  `origin/main`, nunca de um branch antigo nem de outro PR aberto (exceto PR empilhado de
  propósito, dito na descrição: "depende do #N").
- **Antes de abrir o PR (e antes de cada push depois)**: `git fetch origin main && git merge
  origin/main` (merge, não rebase), resolva, rode o gate completo de novo e confirme que
  `git merge-tree --write-tree origin/main HEAD` sai com 0. PR que já nasce em conflito não
  está concluído.
- **Número de migração**: o próximo depois do maior número em `origin/main` **e** nos branches
  remotos (`git fetch origin` e depois
  `git for-each-ref --format='%(refname)' refs/remotes/origin | xargs -I{} git ls-tree --name-only {} apps/api/migrations/ | sort | tail -1`).
  Nunca repita um número (já houve três `0101` e vários `0102`). Lacunas na numeração não importam.
  Teste que lê migração pelo nome (`readFile(".../migrations/NNNN_...")`) acompanha a renumeração.
- **Arquivos quentes** (`storage/*/finance.ts`, `storage/*/context.ts`, `route-access.ts`,
  `features/finance/model.ts`, `09-finance.css`, `contracts/src/finance/*`): não deixe dois
  PRs abertos mexendo neles ao mesmo tempo sem empilhar um sobre o outro. CSS, rotas e campos
  novos entram **junto do bloco relacionado**, não sempre no fim do arquivo/objeto (o fim é onde todo PR
  escreve e onde todos conflitam).
- **Ao resolver conflito**: trecho por trecho. Nunca `git checkout --ours/--theirs` no arquivo
  inteiro (ele descarta também o que entrou sem conflito). Depois, confira que nada da `main`
  sumiu: `git diff origin/main -- <arquivo> | grep '^-'` deve mostrar só o que o PR removeu de
  propósito. Nunca use `git stash` no meio de um merge (ele desfaz o merge).
- **Mudança de infraestrutura** (trocar banco, mover pastas, renomear em massa) só com a fila
  de PRs vazia ou com o dono avisado: ela conflita com todo PR aberto.

### Banco de dados: MySQL/MariaDB (não é mais Postgres)

Desde 30/10/2026 o banco é **MySQL 8 / MariaDB 10.6+** (Hostinger). O Postgres saiu: não existem
mais `storage/postgres`, `postgres-repository.ts` nem o pacote `pg`, e as migrações recomeçaram
em `0001_schema.sql` (as antigas `0001`–`0120` do Postgres foram apagadas). Código, migração ou
teste escrito para o Postgres (de memória, de um branch antigo ou de um PR aberto antes da troca)
precisa ser portado antes do commit. O teste `storage/mysql/mysql-dialect.unit.test.ts` reprova
o que sobrar; nunca o afrouxe para passar — porte o SQL.

- **Onde fica**: fachada `apps/api/src/mysql-repository.ts` (`MysqlClinicRepository`),
  domínios em `apps/api/src/storage/mysql/<domínio>.ts`, cliente em
  `infrastructure/mysql-client.ts`, helpers SQL em `storage/mysql/sql.ts` e
  `storage/mysql/helpers.ts`. Testes opt-in em `storage/mysql/tests/*.integration.test.ts`, com
  `createTestDatabase("<prefixo>")`/`database.drop()` de `test-support/mysql-database.ts` (copie
  o molde de `nav-tabs.integration.test.ts`); o laço é `for (const storage of ["memory", "mysql"])`.
- **Migração nova** (`apps/api/migrations/NNNN_nome.sql`, 4 dígitos, número livre pelas regras
  acima — hoje a sequência está na casa de `0019`+, nunca `01xx`): nomes entre crases; ids e FKs
  `VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin` (id com `DEFAULT (UUID())`); datas
  `DATETIME(6)` com `DEFAULT CURRENT_TIMESTAMP(6)` (sempre UTC); booleano `TINYINT(1)`; listas e
  objetos em `JSON` (`DEFAULT ('[]')`), nunca `text[]`/`jsonb`; texto livre `LONGTEXT`, texto
  em chave/índice `VARCHAR(191)`; restrições nomeadas (`CONSTRAINT <tabela>_<col>_fkey FOREIGN
  KEY ... REFERENCES ...`, `CHECK (...)`). Sem `uuid`, `timestamptz`, `SERIAL`, extensões,
  gatilhos, funções, procedures ou blocos `$$`. Veja `0011_payment_proofs.sql` como modelo.
- **Consultas**: o cliente aceita `$1`, `$2`… (viram `?`) e serializa objetos/arrays como JSON.
  Equivalências: `RETURNING` → gravar e ler em seguida (`writeAndRead()` de `sql.ts`, ou
  `randomUUID()` na aplicação + `SELECT`); `ON CONFLICT DO UPDATE` → `ON DUPLICATE KEY UPDATE
  col = VALUES(col)`; `ON CONFLICT DO NOTHING` → `insertRows(client, tabela, linhas, { onDuplicate: "ignore" })`; `= ANY($n)` → `inJsonArray()`;
  `now()` → `NOW(6)`; `ILIKE` → `LIKE`; `x::tipo` → `CAST(x AS ...)`; `JOIN LATERAL`/`DISTINCT
  ON` → `LEFT JOIN` com subconsulta; `jsonb_set`/`->>'chave'` → `JSON_SET(col,'$.chave',...)`/
  `JSON_VALUE(col,'$.chave')`; trava consultiva → `client.lock(...)` (GET_LOCK); violação de
  única → `hasDatabaseCode(error, "23505")` (o cliente traduz o erro do MySQL).
- **Leitura de JSON**: coluna JSON montada na consulta (`JSON_OBJECT`, `JSON_ARRAYAGG`, `CASE`)
  volta como texto/binário no MariaDB — passe sempre por `json<T>(valor)` de `helpers.ts`, também
  nas linhas lidas com `FOR UPDATE` antes de reaproveitá-las.
- **Rodar os testes MySQL localmente** (não precisa de Docker): MariaDB local e
  `TEST_DATABASE_URL=mysql://<usuário>:<senha>@127.0.0.1:3306/crm_test npm run test:mysql`
  (o banco `crm_test` precisa existir; cada arquivo cria e apaga o próprio banco derivado).
  Ao mexer em SQL, rode-os; sem banco, eles ficam `skip` e o erro só aparece no CI.

### Convenções do projeto

- **Monorepo npm workspaces**: `packages/contracts` (zod + tipos compartilhados, importado
  direto do `src`), `apps/api` (Fastify), `apps/web` (React + Vite, react-router, lucide-react).
- **Contratos primeiro**: schemas, tipos e helpers ficam em
  `packages/contracts/src/<domínio>/{model,types}.ts`; index.ts mantém os exports públicos.
- **Repositório duplo**: todo método novo entra na interface `ClinicRepository`
  (`apps/api/src/repository.ts`) e é implementado **nos dois**:
  `memory-repository.ts` e `mysql-repository.ts`. Os testes da API usam o de memória;
  o MySQL tem testes opt-in em `storage/mysql/tests/*.integration.test.ts` (cada arquivo cria
  o próprio banco com `createTestDatabase`).
- **MySQL 8 / MariaDB 10.6+** (hospedagem compartilhada, ex.: Hostinger): operações com escrita em
  várias tabelas usam transação (`this.inTransaction(...)`); tudo filtrado por `clinic_id`. Sem
  gatilhos, funções ou procedures no banco — a regra fica na aplicação (filial padrão, conflito de
  agenda, histórico montado na leitura em `system-history.ts`). Datas em UTC; dia/mês da clínica via
  `localDate`/`localDayStart` de `storage/mysql/sql.ts`. Migrações em
  `apps/api/migrations/00NN_nome.sql`, aplicadas em ordem automaticamente.
- **Rotas** em `apps/api/src/modules/<domínio>/routes.ts`: `preHandler: authenticate` + guardas de perfil
  (`requireCommercialAccess`, `requireFinanceAccess`…); erros de domínio com
  `DomainError(code, mensagem pt-BR, status)`.
- **Web**: páginas e modais em `apps/web/src/features/<domínio>`; cliente HTTP compatível em `apps/web/src/api.ts`, implementação em shared/api;
  estilos em `apps/web/src/styles`, importados na ordem por styles.css (reaproveitar classes existentes: `panel`, `form-grid`,
  `checkbox-field`, `status-pill`, `secondary-button`…). Datas exibidas com `shortDate`/
  `formatIsoDate` (formato "01 de out.").
- **Testes**: Vitest. API via `app.inject` com `MemoryClinicRepository`
  (`apps/api/src/modules/<domínio>/*.integration.test.ts`); web com Testing Library e `fetch` mockado
  (`apps/web/src/features/<domínio>/*.integration.test.tsx`); contratos em `packages/contracts/src/contracts.unit.test.ts`.
- **Dados demo**: `demo-patients.ts`, `demo-scenarios.ts` e `seed-demo-scenarios.ts` — se um
  tipo ganhar campo obrigatório, atualize-os também.
- **Documentação**: não existem tarefas de documentação. Não edite `docs/STATUS_IMPLEMENTACAO.md`,
  `README.md` nem crie documentos novos — só quando for essencial para o desenvolvimento (ex.: regra
  nova em `CLAUDE.md` que os agentes precisam seguir). Fora disso o verifier reprova.

### Design de páginas

- **Estrutura**: página nova começa com `PageHeader`; conteúdo fica dentro de `.panel`. O
  `.panel` não tem padding: cada filho direto usa `panel-head` (`padding: 21px 23px`) ou um
  bloco com respiro lateral próprio (padrão 23px). Exceções: `.admin-grid > .panel` e
  `.groups-layout > .panel`, que já recebem padding.
- **Tom visual sóbrio**: sem sobretítulo (`eyebrow`) em `PageHeader` nem em `panel-head` — o título
  basta; contexto útil (período, data, progresso) vai num `panel-context` abaixo do `h2`. `.eyebrow` só
  no nome do módulo dos modais. Uma fonte (DM Sans); Cormorant só no nome da marca. Peso máximo 700
  (títulos em 600), sem `letter-spacing` negativo além de `-0.01em`, caixa alta só em cabeçalho de
  tabela e siglas. Sombras só via `--shadow`/`--shadow-sm`; raios só `--radius-*`. Nada de enfeites
  (círculos em `::after`, gradientes decorativos, `backdrop-filter`) nem frases de efeito na interface.
- **Tokens**: CSS novo usa `--space-1`…`--space-8` (4, 8, 12, 16, 24, 32, 48, 64px) e
  `--radius-sm/md/lg` (8, 12, 18px); valor fora da escala via `calc(var(--space-N) ± Xpx)`.
  Nada de px soltos para espaçamento e nada de `style={{}}` no JSX (exceção: cor escolhida pelo
  usuário, só via variável CSS — `tagColorStyle()` das etiquetas, cor do profissional).
- **Tipografia**: `font-size` só com a escala do `:root` — `--text-xs` 12px, `--text-sm` 13px,
  `--text-md` 14px, `--text-lg` 16px, `--text-xl` 18px, `--text-2xl` 22px, `--text-3xl` 30px,
  `--text-4xl` 42px e os fluidos `--text-fluid-lg`, `--text-fluid-xl`, `--text-display`. Nenhum
  texto abaixo de 12px; texto corrido e campos em `--text-md`; rótulos e legendas em
  `--text-xs`/`--text-sm`. Todo `var(--text-X)` usado precisa estar declarado no `:root`, e
  nenhum token fica abaixo de 12px. Fora do `:root` valem só: `var(--text-*)`; `calc()` com token,
  sem subtração nem divisão e multiplicando só por fator ≥ 1; `clamp()` com mínimo
  `var(--text-*)` e `max()` com algum `var(--text-*)`, sem unidade absoluta (px, pt…); `min()`
  não vale; `inherit`/`initial`/`unset`/`revert`; `em`/`rem` ≥ 1 ou `%` ≥ 100%; `0` (texto
  escondido de propósito). O `audit-panels.cjs` (4ª checagem) reprova o resto, inclusive
  `font:` com tamanho absoluto.
- **Celular**: toda regra com `grid-template-columns` de 2+ trilhas precisa de regra no bloco
  `@media (max-width: 700px)` que reduza a 1 coluna (ou usar `auto-fit`/`auto-fill`). Exceção só
  com `/* audit: mobile-ok <motivo real> */` logo acima da regra.
- **Estados**: toda tela/lista com dados remotos trata carregando (`LoadingBlock`), vazio
  (`EmptyState`) e erro (`ErrorBanner`/`error-banner`; em formulário, `form-error`).
- **Modais/gavetas**: clicar no fundo não fecha (o audit reprova handler de clique em `*backdrop`);
  Esc fecha só o de cima; durante o salvamento passe `busy` ao `Modal`/`Drawer` (trava X e Esc) e
  desative o "Voltar/Cancelar".
- **Tabelas**: valores numéricos e monetários alinhados à direita (`text-align: right`).
- **Reaproveitar** antes de criar: `panel`, `panel-head`, `list-toolbar`, `form-grid`,
  `clinical-form`, `plan-card`, `plans-grid`, `status-pill`, `success-banner`, `Modal`,
  `modal-actions`, `page-actions`, `tag-filter`, `table-row`, `primary-button`/`secondary-button`
  (já são `inline-flex` com `gap`: ícone + texto sem CSS extra).
