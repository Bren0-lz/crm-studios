# API

- `src/app.ts` compõe a aplicação; `infrastructure/route-context.ts` configura CORS, JWT, autenticação, acesso e auditoria antes de registrar rotas.
- `modules/<domínio>` contém rotas, serviços puros e testes. `route-utils.ts` reúne utilitários compartilhados de rotas.
- `ClinicRepository` é a interface pública. Fachadas memory/postgres delegam a `storage/<modo>/<domínio>.ts`.
- Cada fachada possui um contexto interno por instância: estado/conexão, helpers e acesso às operações compostas. Não crie estado global nem um pool por domínio.
- Métodos que escrevem várias tabelas preservam `inTransaction` e o mesmo PoolClient; não reinicie transações nas funções extraídas.
- Filiais (0086): `clinics` é a rede; profissionais, salas, agenda, turmas, planos vendidos, financeiro, estoque, comandas e leads têm `branch_id`. O `authenticate` grava o escopo do cabeçalho `X-Branch-Id` em `repository.branchScope` (sem cabeçalho ou `all` = filiais do usuário; `null` = toda a rede). Listas e relatórios filtram com `branchClause`/`branchReadIds()` (PostgreSQL) ou `inBranchScope`/`scoped` (memória); gravações usam `branchWriteId()`/`writeBranchId()` ou a filial do registro de origem. Consultas por cliente (ficha) não filtram. Clientes, serviços, modelos de plano, etiquetas e formulários são da rede.
- Toda consulta/escrita deve respeitar clinic_id. Rotas precisam estar no mapa ROUTE_ACCESS; erros de domínio usam DomainError.
- Integração usa Fastify inject com memória. Testes PostgreSQL e paridade usam exclusivamente TEST_DATABASE_URL e rodam sem paralelismo de arquivos.
- `test-support` reúne fixtures e a suíte compartilhada de paridade entre memória/PostgreSQL. Feche aplicações e pools mesmo quando uma asserção falha.
- Não altere migrações existentes; não conecte testes ao banco do site.
