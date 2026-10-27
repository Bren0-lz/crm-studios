# HANDOFF — unificação dos PRs abertos (rodada de 25–27/10/2026)

Este arquivo passa o bastão desta frente de trabalho para outra sessão. Ele não substitui o
`HANDOFF.md` (loop `/next`). O plano completo, com as decisões do dono, está em
`UNIFICACAO_PRS.md` (mesmo branch: `claude/handoff-unificacao-prs`).

## 1. Contexto

- Havia 16 PRs abertos (#126 a #141), cada um com uma tarefa do quadro **CRM Aryana** do Trello
  (https://trello.com/b/x6iyIw1F/crm-aryana, lista "Fazendo"). Vários se sobrepunham ou se
  contradiziam.
- O dono pediu para **unir os PRs parecidos mantendo a ideia dos dois** em PRs novos, um por
  grupo. Os PRs originais **continuam abertos**: nada foi mergeado nem fechado. Fechar os
  originais depois do merge de cada grupo é decisão do dono.
- O dono autorizou criar **um branch novo por grupo** (`claude/grupo-<x>-...`) e abrir PR para a
  `main`. O CLAUDE.md pede commit sem `Co-Authored-By` e PR com descrição em pt-BR.

## 2. Decisões do dono (valem para o que falta)

1. **Desconto do cliente** é aplicado de verdade, com alcance: só no próximo pagamento, nas
   próximas N cobranças ou permanente. Tem que constar nos relatórios. (Feito no #145.)
2. **Despesa fixa variável** só pode ser paga pelo valor real. (Feito no #142.)
3. **Página antiga de Relacionamento** fica por enquanto e será apagada depois, num PR próprio.
4. **Comissão retroativa:** recalcular **todas**, considerando a data. Se o início da nova regra
   não cobre nenhuma venda/atendimento, só grava. Se cobre, recalcula; as já pagas viram
   **ajuste de comissão** (crédito/débito) no próximo pagamento. (**Não feito.**)
5. **Folha de pagamento** vai num PR separado. (**Não feito.**)

## 3. PRs de grupo abertos nesta rodada

Todos saem da `main` `a8e69e8` e são independentes entre si.

| PR | Branch | Une | Resumo |
|---|---|---|---|
| #142 | `claude/zen-bardeen-22lqk1` | #141 + #137 | Despesa fixa fixa/variável, aviso de vencimento no sino (inclui vencidas), "Avisos de vencimento" na seção, "Informar valor" só em conta variável (`PAYABLE_NOT_VARIABLE`), auditoria `payable.amount_informed`, trocar o tipo sincroniza as contas abertas. **Sem a folha de pagamento.** |
| #143 | `claude/grupo-b-estoque-tamanhos` | #126 + #127 | Sem estoque mínimo + tamanhos e estoque por tamanho. Migrações `0101_drop_product_minimum_stock`, `0102_product_sizes`, `0103_product_size_stock`. Lista de estoque mostra "Esgotado: G". |
| #144 | `claude/grupo-c-relatorio-financeiro` | #138 + #133 | Uma permissão por planilha + aba Financeiro dos relatórios. Permissão nova `reports.financial_export`. CSV do extrato gerado pela API (`GET /reports/financial/export`). Período até 12 meses. Corrigido o teste PG de backfill de permissões que o #138 quebrava. |
| #145 | `claude/grupo-d-venda-de-planos` | #136 → #131 → #130 → #129 | Parcelas por forma/plano em todos os itens do cadastro; 1º pagamento proporcional **calculado no servidor** pela turma; desconto do cliente aplicado (migração `0103_receivable_customer_discount`), visível em contas a receber, recibo, Pix, ficha, DRE, vendas e relatório de clientes. |
| #146 | `claude/grupo-e-campanhas` | #128 + #139 | Campanhas automáticas com o editor de etiquetas verdes; auditoria `auto_campaign.created/updated/deleted`. |

**O documento `UNIFICACAO_PRS.md`** estava no branch do #142 e foi retirado do diff dele; a
cópia viva está neste branch.

### Conflitos esperados entre os PRs de grupo (ao mergear um, atualizar os outros com a `main`)
- #142 × #145: contas a pagar/receber (`apps/api/src/storage/*/finance.ts`, `FinancePage`,
  `09-finance.css`, `packages/contracts/src/finance/*`).
- #143 × #144: `apps/web/src/styles/*` e relatórios.
- **Números de migração:** #142 usa `0101`; #143 usa `0101–0103`; #144 usa `0101`
  (`spreadsheet_export_permissions` e `pro_labore`); #145 usa `0102` e `0103`. O runner aplica por
  **nome de arquivo** (tabela `schema_migrations`), então números repetidos não quebram, mas a
  ordem é alfabética. Se dois PRs criarem o mesmo número com nomes que dependem de ordem,
  **renumerar** antes do merge (só migração ainda não aplicada na `main`).

## 4. O que falta

1. **Grupo F — #134 (comprovantes) + #136 (parcelas na baixa):** o #136 já está no #145, então o F
   deve partir do branch do #145 (ou esperar o #145 entrar na `main`). Unificar o `SettleModal`:
   forma de pagamento → parcelamento na forma → valores → **Comprovantes** no fim. Na lista de
   pagos: "Pago: Cartão · 3x" + botão "Comprovantes". Ajustes pendentes do #134: filtrar
   comprovantes por filial (hoje um usuário de uma filial vê os de outra pelo id), permitir
   excluir comprovante enviado por engano (com auditoria), decidir o que acontece no estorno.
2. **Recálculo de comissão retroativa** (decisão 4): PR próprio. Já existe
   `selectCommissionRule` (`apps/api/src/modules/finance/commission-calculation.ts`), que escolhe a
   regra pela data, e `commissionAdjustments`. Falta: ao gravar regra com `effectiveFrom` no
   passado, recalcular as comissões do período (abertas: atualiza; pagas: ajuste), prévia na tela
   ("recalcula N comissões, diferença R$ X") com confirmação, transação + auditoria, testes
   memória e PostgreSQL.
3. **Folha de pagamento** (decisão 5): PR próprio, a partir do #137 (`claude/amazing-gauss-nquqqo`):
   `packages/contracts/src/finance/payroll.ts`, `PayrollSection.tsx`, `PayrollEmployeeModal.tsx`,
   rotas `/finance/payroll*`, permissões `finance.payroll_view/manage`, tabela `payroll_employees`
   (migração própria). Ajustes: filtrar por filial e somar os ajustes de comissão do mês. Melhor
   depois do item 2. Ideia seguinte (Trello #70): vale para funcionário.
4. **PRs que seguem sozinhos, com correções pedidas na revisão:**
   - #140 (contrato por WhatsApp com assinatura): ligar `trustProxy` no Fastify (o IP gravado como
     prova hoje é o do proxy), validar dígitos do CPF (`isValidCpf`), expiração do link, limite de
     requisições na rota pública.
   - #132 (fornecedores): validar CPF/CNPJ também na API.
   - #135 (modelos de avaliação): ok; ele edita `STATE.md`.
5. **Pendências dos grupos já abertos** (anotadas nas descrições dos PRs):
   - #145: a linha de descontos no **relatório financeiro** (#144) entra quando os dois estiverem na
     `main`; a **prévia** da mensagem Pix no formulário não mostra o desconto (a mensagem final
     mostra); o desconto vale só para cobranças de plano.
   - #143: ação "Distribuir estoque sem tamanho" (hoje é preciso saída + entrada).
   - Remover a página antiga de Relacionamento (decisão 3), num PR próprio, quando o dono pedir.

## 5. Estado dos testes (igual em todos os PRs de grupo)

- **CI do GitHub Actions quebrado em todos os PRs:** os jobs `checks`, `postgres` e `browser`
  falham em ~2 s sem log (infraestrutura: cota/cobrança/config das Actions). Nenhum PR tem CI de
  verdade; os resultados vêm do gate rodado localmente.
- **Falha que já existe na `main`:** `apps/api/src/modules/agenda/auto-finalization.integration.test.ts`
  › "runs on regular requests once enabled" (`O profissional ou a sala está ocupado ou bloqueado
  nesse horário.`). Confirmado num worktree limpo da `main`. Por causa dela o gate nunca fecha
  em exit 0. Corrigir num PR à parte (conflito com dado de demonstração).
- **4 falhas do `npm run test:postgres` que já existem na `main`:** `repository-parity` ×3 (vendas
  por período, profissional da turma, renomear turma) e `user-agenda` ×1 (CRM duplicado).

## 6. Como rodar e validar nesta base (container da sessão na nuvem)

- `npm ci` na raiz. Rodar com `TZ=America/Sao_Paulo` (sem isso, testes de turmas falham em UTC).
- Gate: `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`.
  Como a API tem a falha da `main`, rodei contracts/api/web separados para ver os números.
- Teste focado: `npm exec -w @crm/api -- vitest run src/<arquivo>.test.ts` (idem `@crm/web`).
- **PostgreSQL local** (há o PostgreSQL 16 instalado; o diretório `/tmp/claude-0` é `700` e
  precisa de `o+x` temporário para o usuário `postgres`):
  ```bash
  S=<scratchpad>/pg; mkdir -p $S && chown postgres $S && chmod o+x /tmp/claude-0
  su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/initdb -D $S/data -A trust -U postgres >/dev/null && /usr/lib/postgresql/16/bin/pg_ctl -D $S/data -l $S/log -o '-p 55432 -k $S' -w start"
  psql -h 127.0.0.1 -p 55432 -U postgres -c "create database crm_test"
  TZ=America/Sao_Paulo TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/crm_test npm run test:postgres
  su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D $S/data -m fast stop"; chmod o-x /tmp/claude-0; rm -rf $S
  ```
- **Comparar com a `main`:** `git worktree add <scratchpad>/main-wt origin/main` e criar links
  simbólicos dos `node_modules` (raiz, `apps/api`, `apps/web`, `packages/contracts`).
- **Formatação:** `npm run format:check` já falha em arquivos antigos. Formatei só os arquivos
  que eu tirei do padrão (comparando com a versão da `main`), para não mexer no resto.
- **GitHub:** usar as ferramentas `mcp__github__*` (sem `gh`). Repositório `Bren0-lz/crm-studios`.
- **Trello:** ferramentas `mcp__Trello__*`; quadro "CRM Aryana".

## 7. Próximo passo sugerido

Perguntar ao dono qual destes seguir: Grupo F, recálculo de comissão retroativa ou folha de
pagamento. Antes de começar, conferir se algum PR de grupo já foi mergeado
(`mcp__github__list_pull_requests`) e, se foi, partir da `main` atualizada.
