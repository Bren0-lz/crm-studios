# HANDOFF — Studios Aryana (continuar em nova sessão do Claude Code)

Atualizado em 04/10/2026. Este arquivo só passa o bastão entre sessões. O estado vivo do trabalho
está em `PLAN.md` e `STATE.md` (o diário no fim do `STATE.md` tem os detalhes técnicos de cada
tarefa), e as regras permanentes em `CLAUDE.md`.

## Primeira coisa a fazer na nova sessão

1. Ler `CLAUDE.md`, o cabeçalho e as últimas ~20 linhas do diário de `STATE.md`, e o `PLAN.md`
   (rodadas 5 e 6 no fim do arquivo).
2. `git status` e `git log --oneline -3`: a árvore deve estar limpa. Último commit local: o que
   atualizou este HANDOFF; antes dele, `bcdd713` (T060). Tudo até `bcdd713` já está publicado.
3. O loop está parado na **V5** (revisão visual manual da rodada 5). Só seguir com `/loop /next`
   depois que o dono aprovar a V5 no chat (aí marcar V5 `DONE` no `PLAN.md` e registrar no
   `STATE.md`). Depois vem a rodada 6 (T061–T065 + V6).

## O que é o projeto

CRM web da clínica/estúdio **Studios Aryana** (Pilates, dançaterapia, depilação), usado só pela
equipe. Monorepo npm: `packages/contracts` (zod + tipos), `apps/api` (Fastify, repositório em
memória **e** PostgreSQL), `apps/web` (React + Vite). Interface em pt-BR; "paciente" aparece como
**cliente**. O `CLAUDE.md` ainda tem o título antigo "Movimenta CRM". Login demo:
`admin@movimenta.local` / `Admin@123` (usuária "Aryana Dutra", tipo **admin**).

## Como o trabalho está organizado (loop autodev)

- `PLAN.md` = tarefas com escopo, gate e dependências; `STATE.md` = tarefa atual + diário.
- `/next` executa **uma** tarefa: implementer → verifier independente → commit local. Modo usado:
  `/loop /next` (ritmo dinâmico; para sozinho em tarefa manual ou BLOCKED).
- Agentes: `.claude/agents/implementer.md` e `verifier.md` (ferramentas incluem Bash e PowerShell);
  comando `.claude/commands/next.md`.
- Tarefas `**Tipo:** manual` (V5, V6) param o loop: ficam `BLOCKED` até o dono aprovar no chat.
- 3 reprovações seguidas do verifier = tarefa `BLOCKED`, parar e chamar o dono.
- **Push:** o Claude não faz `git push`. Quem publica é o dono, rodando `! git push`. Commits sem
  `Co-Authored-By` e sem "Generated with Claude".
- Pedidos novos do dono entram no `PLAN.md` como tarefas (com as decisões registradas no próprio
  plano) antes de qualquer código.

### Gate completo nesta máquina

```
npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs
```

- **Esta máquina não tem `.env`**: a integração com PostgreSQL fica em SKIP (autorizado pelo dono).
  Os testes PG são escritos mesmo assim, e o SQL é revisado por leitura. Numa máquina com `.env`,
  usar `node scripts/with-direct-db.cjs npm test` (troca o pooler pela conexão direta do Supabase).
- `audit-panels.cjs` tem 6 checagens: respiro lateral dos filhos de `.panel`, grid sem regra de
  celular, cartão encostado na borda, tamanho de fonte fora da escala `--text-*` (mínimo 12px),
  `<button>` sem classe de variante e `window.prompt/confirm/alert`. Variável `AUDIT_APP_TSX` aponta
  para outro `.tsx` (testes sintéticos). Ampliar o audit só quando a tarefa autorizar.

## Onde paramos

- **Rodadas 1 a 4:** concluídas e publicadas (feriados, experimentais, caixa do dia, previsão,
  contratos, exportação, retenção/rankings/faixa etária, comunicado segmentado, cargo e permissões
  por módulo, comissão por usuário). Documentação até a rodada 4 em `docs/STATUS_IMPLEMENTACAO.md`.
- **Fora do plano, publicado:** o build da Vercel aplica as migrações pendentes antes de publicar
  (`npm run db:migrate`, só em produção). Se uma migração falhar, o build cai e o site anterior
  continua no ar.
- **Rodada 5 (estética, usabilidade e pedidos do dono) — publicada até `bcdd713`, falta a V5:**
  - D06 escala tipográfica (`--text-*`, nada abaixo de 12px); D07 botões padronizados
    (`primary/secondary/text/danger-button` + `button-sm`).
  - D08/D12 Financeiro revisado (linhas legíveis, caixa de seleção 18px, filtros, forma de
    pagamento escolhida na baixa, caixa do dia agrupado, previsão com legenda).
  - D09 telas sem elementos soltos (`ActionMenu` "Mais ações" em Prontuários, CRM vazio etc.).
  - D10 todas as janelas `prompt/confirm` viraram modais próprios (`ActionModal`).
  - D11 telas funcionam com permissões personalizadas (`GET /patients/options`, `{ anyOf }` no
    `ROUTE_ACCESS`).
  - T055/T056 permissões 100% livres: tipo **admin** (tudo) ou **usuário comum** (só o que for
    marcado; começa sem nada); "Copiar permissões de…"; último admin protegido (409 `LAST_ADMIN`).
    Migração 0042 (já aplicada em produção; conferido: login devolve `role: "admin"`).
  - T057/T058/T060 comissão direto no usuário (no formulário de criar/editar; ligação com
    profissional da agenda só para atribuir atendimentos; corrigir no mesmo dia substitui o
    percentual se ainda não houve lançamento). Migração 0043 (já aplicada em produção).
  - T059 Configurações em gavetas (`CollapsibleSection`, começam fechadas).
- **Pontos para o dono decidir na V5** (registrados no `STATE.md`): valores de Contas a receber
  sem sinal/cor (as outras abas usam vermelho com "-"); regra nova no Financeiro para profissional
  ligado a usuário só vale onde o usuário não tem regra própria; fechar a gaveta "Dados da clínica"
  descarta edição não salva; X/clique fora fecham modal durante o salvamento e modais antigos não
  fecham com Esc.
- **Rodada 6 planejada (pedido do dono de 04/10/2026), T061–T065 + V6:** botões de WhatsApp
  estilizados; etiquetas configuráveis com cor em Configurações (cliente só escolhe entre as
  configuradas; filtros usam as configuradas; migração 0044 importa as etiquetas existentes);
  cadastro guiado do cliente (aula de demonstração / plano com turma opcional do mesmo serviço /
  serviço avulso / só cadastrar) e filtro "Assinantes sem turma vinculada". As decisões tomadas
  pelo orquestrador estão no topo da seção "Rodada 6" do `PLAN.md`.
- **Próxima migração livre: 0044.**

## Infraestrutura

### Supabase (PostgreSQL — banco do site)
- O `.env` local do dono (não versionado) aponta `DATABASE_URL`/`TEST_DATABASE_URL` para o Supabase;
  nesta máquina ele não existe. Nunca editar o `.env` nem pedir senha no chat.
- O banco **não tem categorias financeiras nem centros de custo** por padrão; os testes criam os
  seus. Diagnóstico de conexões: `pg_stat_activity`, nunca imprimir a URL.
- O tipo ENUM `user_role` da 0001 ficou sem uso depois da 0042 (não foi apagado de propósito).

### Vercel (site + API no mesmo domínio: https://crm-studios.vercel.app)
- `npm run vercel-build`: em produção (`VERCEL_ENV=production` e `STORAGE_MODE=postgres`) roda
  `npm run db:migrate` primeiro (`apps/api/src/migrate-cli.ts`; troca a porta 6543 pela 5432 só
  para migrar); depois gera `.vercel/output` (site com `VITE_API_URL=/api` + função `api.func` em
  `gru1`). Previews não migram.
- Variáveis (painel, Production): `STORAGE_MODE=postgres`, `DATABASE_URL`, `JWT_SECRET`,
  `NODE_ENV`, `WEB_ORIGIN`.
- Conferir um deploy sem o painel: login pela API (`POST /api/auth/login` com o acesso demo) e uma
  rota nova; `/api/health` responde 200.

## Pendências e avisos para o dono

- **Testes PG nunca executados num banco real** desde a T037 (esta máquina não tem `.env`): T037,
  T039, T047, T048, T050, T055, T057, T060. As migrações 0039–0043 já rodaram em produção pelo
  deploy, mas vale rodar `npm run test:postgres` numa máquina com `.env`.
- **Banco de teste = banco do site.** Recomendado: projeto Supabase separado para testes.
- A tela de login mostra o acesso demo; quem tiver o link entra como admin. Considerar Deployment
  Protection na Vercel.
- Exportação CSV não neutraliza valores que começam com `=`, `+`, `-`, `@` (injeção de fórmula).
- "Vendido líquido" negativo no demo (cancelamentos > vendas): regra de negócio não decidida.
- A varredura visual da rodada 5 foi feita só a 1440px (a extensão do Chrome não redimensionou
  para 390px); o celular fica para a V5.

## Armadilhas do ambiente (economizam tempo)

- **Shell:** o PowerShell pode estar desativado na sessão; usar o Bash (Git Bash). O Node não está
  no PATH do Bash: começar cada comando com `export PATH="/c/Program Files/nodejs:$PATH";`.
  O Git está em `C:\Program Files\Git\cmd`.
- Repositório no OneDrive, máquina lenta: `testTimeout` de 20 s (não mexer). Se o vitest cair com
  exit 134 ("semi space"), repetir com `NODE_OPTIONS=--max-semi-space-size=2` só no comando.
  `app.test.ts` leva ~30 s (bcrypt; testes de perfil usam usuários reais via `seedRoleUsers`/`roleSub`).
- Heredoc com aspas e crases no Bash pode quebrar: para blocos grandes, escrever o texto num
  arquivo do scratchpad com Write e anexar com `cat`.
- Subagentes podem ser cortados quando a sessão fecha: conferir `git status` e o diário, e relançar
  o implementer só com o que faltava.
- Lint `react-hooks/set-state-in-effect`: zerar estado no handler; buscas em função de módulo com
  setters no `.then`. Diálogos usam `Modal`/`ActionModal` (o audit reprova `prompt/confirm`).
- Ver o app localmente sem tocar no Supabase: em `apps/api`,
  `STORAGE_MODE=memory API_PORT=3344 WEB_ORIGIN=http://localhost:5190 npx tsx src/server.ts`; em
  `apps/web`, `VITE_API_URL=http://localhost:3344 npx vite --port 5190 --strictPort`. Encerrar
  depois (`taskkill //PID <pid> //T //F` pelo `netstat -ano` da porta).
- Navegador: Chrome conectado do notebook; abrir aba nova e fechar ao terminar. Login de teste só
  em `localhost`; no site publicado, testar pela API com curl.
- Avisos "LF will be replaced by CRLF" no git são normais nesta máquina.
- **Sem documentação desnecessária** (pedido do dono, 04/10/2026): nada de tarefas de documentação
  (T054 e T066 removidas); `docs/STATUS_IMPLEMENTACAO.md` e `README.md` não são mais atualizados.
  Escrever documento só quando for essencial para o desenvolvimento.
- Prioridade do dono: funcionalidades e usabilidade primeiro; infraestrutura e segurança só quando
  ele pedir.
