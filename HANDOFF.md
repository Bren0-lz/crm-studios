# HANDOFF — retomar o desenvolvimento em outra máquina

Atualizado em 19/10/2026. Este arquivo passa o bastão entre máquinas e sessões. O estado vivo
está em `PLAN.md` (tarefas) e `STATE.md` (tarefa atual + diário). As regras permanentes ficam em
`CLAUDE.md` e nos `AGENTS.md`.

## Onde parou

- **Rodada 8** (correções do QA de 17/10/2026), na branch `main`.
- **Concluído:** Fase 1 inteira (QC1–QC10), QF1, QF2 e Fase 2 até QM14. Gate da `main` verde.
- **Próxima tarefa:** QM15 (sem "movimenta", UUID ou código de seed na interface).
- **Faltam:** QM15–QM17, a Fase 3 (QV1–QV9), QR1 (e2e dos críticos) e QR2 (revisão manual).
- **Gates nesta máquina:** rode com `TEST_DATABASE_URL` vazia (`export TEST_DATABASE_URL=`). O
  `.env` local aponta para um banco que não responde, e as variáveis reais ficam na Vercel.

## Preparar a máquina nova

1. Node 22 ou mais novo. No Windows, use `npm.cmd` se o PowerShell bloquear `npm`.
2. `git clone` do repositório e `npm ci` na raiz.
3. Para o e2e: `npx playwright install chromium`.
4. `.env` não vai para o git. Copie da máquina antiga, ou monte a partir de `.env.example`. Sem `TEST_DATABASE_URL`, os testes de MySQL ficam `skip`. Com ela, `npm test`
   também roda esses testes contra o banco (use só um banco exclusivo de testes).
5. Conferir o gate antes de continuar:
   `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`.

## Como continuar o fluxo

- Abra o Claude Code na raiz do repositório e rode `/loop /next`, que executa uma tarefa por vez:
  1. o agente `implementer` implementa a tarefa;
  2. o agente `verifier` verifica do zero;
  3. o orquestrador faz o commit local e atualiza `PLAN.md` e `STATE.md`.
- Para uma tarefa só, sem loop: `/next`.
- O loop para sozinho em tarefa `BLOCKED`, em 3 reprovações seguidas ou em tarefa
  `**Tipo:** manual` (a QR2). O dono aprova e marca `DONE`.
- O loop nunca faz `git push`; os envios são feitos à mão pelo dono.

## Decisões e pendências que esperam o dono

- **Decisões tomadas pelos agentes, a confirmar:**
  - "Pagamento atrasado" só aparece para quem tem acesso ao Financeiro (QC7).
  - Filtro novo "Pago na comanda" em Planos (QC7).
  - O serviço de um atendimento ligado a comanda ou plano não pode ser trocado na edição (QM6).
  - Na ficha, o estoque saiu e ficaram só as "Comandas"; produtos e ajustes estão na aba
    "Estoque" do Financeiro (QM9).
  - "Abrir ficha" no aviso de lead duplicado aparece mesmo sem acesso ao módulo de clientes, e a
    conversão de lead ainda compara telefone/CPF sem normalizar (QM10).
  - "Serviço avulso" é cadastrado em Configurações › Planos, não em Serviços e salas (QM12).
- **Banco:** desde 30/10/2026 é MySQL/MariaDB e as migrações recomeçaram em `0001_schema.sql`.
  Número da próxima e regras de SQL: `CLAUDE.md` ("PRs sem conflito" e "Banco de dados:
  MySQL/MariaDB").
- **Seed:** um banco já semeado só recebe os vínculos de serviço, profissional e sala da demo
  (QM3) se o seed for rodado de novo. O SQL novo do seed também não foi testado num banco real.
- **API de presença em turma:** aceita presença em sessão futura; só a tela bloqueia (QM8).
- **e2e:** `e2e/client-workspace.spec.ts` teve datas trocadas na QC3 e não foi rodado; entra na QR1.

## Armadilhas conhecidas desta base

- **Testes que falham às vezes, porque clicam antes de a tela carregar.** Se um deles falhar
  sozinho, rode de novo:
  - finance/workspace-flows "classifies a supplier expense";
  - App.integration "opens the SOAP editor", "opens groups" e "puts 'Matricular cliente' in the
    page header";
  - groups/group-enrollment-period "sends the chosen start date in a new enrollment";
  - screens-without-the-patients-module "opens groups and lists clients in a new enrollment".
- O timeout dos testes é 20s, porque a máquina é lenta com OneDrive; não reduza.
- `npm test` leva de 10 a 15 min: rode em segundo plano. Se o `.env` tiver `TEST_DATABASE_URL` e o
  banco não responder, as suítes MySQL dão timeout no `beforeAll`, a API falha e os testes
  da web nem rodam.
- Nunca conclua ou registre atendimento "de hoje às X h" em teste sem fixar o relógio depois do
  início (`test-support/clock.ts`, QF1).
- Modal novo com formulário: `<Modal dirty={useFormDirty(form)}>` + `<ModalCancelButton>` (QM11).
- Toasts novos podem colidir com `getByRole("status")` em testes; o sino se acha por
  `/^Notificações/` (QM13).
- Teste de um arquivo só: `npm exec -w @crm/web -- vitest run src/<arquivo>` (idem `@crm/api`,
  `@crm/contracts`). Não use `npm test -w <pacote> -- <filtro>`.
- `AppRoutes.tsx` chaveia `<Routes>` por `pathname + search`: mudar a busca da URL remonta a
  página (veja a QM1 no diário).
- Para escolher cliente em teste, digite no combobox e use `findByRole("option")`: a lista não abre
  só com foco (QC10).
- Use as ferramentas de edição, não scripts que reescrevem arquivos inteiros; um script assim já
  corrompeu a `AgendaPage.tsx`. Os avisos "LF will be replaced by CRLF" nos commits são normais.
- Com o Session pooler do Supabase, `EMAXCONNSESSION` aparece quando há API local ou `tsx watch`
  segurando conexões. Encerre esses processos e espere uns 3 minutos antes de rodar o gate.
