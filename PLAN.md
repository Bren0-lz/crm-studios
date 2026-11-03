# Plano — Studios Aryana CRM

Plano vivo do loop autodev (`/next`, `/loop /next`). Rodadas 1–7 concluídas; o detalhe delas
está no histórico do git (este arquivo antes do commit "chore: handoff da rodada 8").

## Definição de pronto (global)

- Cada tarefa `DONE` com commit próprio e verifier PASS.
- Tarefas `**Tipo:** manual` são revisadas pelo dono.
- `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`
  retorna 0 na `main`.

## Fora de escopo

- O que depende de provedor externo: pagamentos, NFSe, envio real de WhatsApp ou e-mail.
- Portal ou app do cliente.
- Dependências npm novas, `git push`, edição de migrações existentes, `.env` e `compose.yaml`
  sem autorização do dono.

## Rodada 9 — Reunião de 02/11/2026: assinatura no iPhone (B2-04) e cadastro com contrato (B2-03)

Origem: reunião de 02/11/2026. A página pública de assinatura abriu "tudo bugado" no iPhone
(iOS 18): é o único impeditivo para o estúdio começar a usar o sistema e a única tela que o
cliente final vê. **Prioridade sobre o restante da rodada 8** (QM16 em diante). Commits
`fix(CT2): …` em pt-BR, um PR por tarefa, pelas regras de "PRs sem conflito" do `CLAUDE.md`.

### Diagnóstico (lido no código, ainda não reproduzido no aparelho)

Arquivos: `apps/web/src/features/contracts/PublicSignaturePage.tsx` (página + `SignaturePad`),
`DocumentPaper.tsx`, CSS em `apps/web/src/styles/10-commercial-communications.css`
(`.document-paper` ~l.1099, mobile ~l.1441, `.public-signature-*`/`.signature-pad` ~l.1836),
`01-base.css` (campos), `06-modals.css`/`11-responsive.css` (`.form-grid`, `.modal-actions`).

Causas prováveis, em ordem:

1. **Folha A4 com altura travada** — `.document-paper { aspect-ratio: 210/297 }` vale também no
   celular (o bloco mobile só troca o padding). Em 390 px a folha fica com ~310 px de largura e
   ~440 px de altura; um contrato real tem várias "páginas" de texto. Se o motor não estender a
   altura pelo conteúdo (o WebKit tem histórico de divergência no mínimo automático de caixas com
   `aspect-ratio`), o texto vaza da folha e é pintado **por cima** do formulário de assinatura —
   exatamente "uma coisa trepada na outra". No desktop a folha tem ~1240 px e o bug não aparece
   com contratos curtos. Só `@media print` remove o `aspect-ratio`.
2. **Zoom automático do iOS nos campos** — `input/select/textarea` usam `--text-md` (14 px).
   O Safari do iOS dá zoom em qualquer campo < 16 px ao focar e não desfaz: a página fica
   ampliada, com rolagem horizontal e o `.panel` (`overflow: hidden`) cortando conteúdo.
   Específico do iOS; não aparece no Chromium.
3. **Canvas dimensionado uma vez só** — `SignaturePad` lê `clientWidth × devicePixelRatio` só no
   `useEffect` de montagem. Girar o aparelho (ou montar antes do layout final) muda a largura
   CSS sem mudar a interna: traço esticado e deslocado do dedo. DPR 3 sem teto também infla o PNG
   (limite do contrato: 700 000 caracteres em `publicDocumentSignInputSchema`).
4. **Toque** — `touch-action: none` existe (bom), mas falta `onPointerCancel` (gesto do sistema
   cancela o ponteiro → `drawing` fica preso e `onChange` não roda → botão "Assinar" segue
   desativado) e falta `-webkit-user-select: none`/`-webkit-touch-callout: none` (pressionar
   longo seleciona texto/abre menu em vez de desenhar).
5. **`min-height: 100vh`** em `.public-signature-page` — no iOS inclui a área da barra do Safari;
   sobra rolagem extra (menor; trocar por `100dvh` com fallback).
6. Descartados: **PDF em iframe** (`DocumentPdfPreview` não é usado na página pública — só em
   `DocumentsPage`, `DocumentWizard`, `SignatureLinkRecord`); **position fixed/sticky** (nenhum
   na página; o `sticky` é do `.template-studio`); **larguras fixas** (`.form-grid` já vira 1
   coluna em ≤ 700 px; `.panel` tem `max-width: 880px`); **fontes** (DM Sans, sem tamanho < 12 px).

### Ambiente de teste

`playwright.config.ts` tem projetos `desktop` (Desktop Chrome) e `mobile` (Pixel 7, Chromium).
Só há Chromium instalado (`/opt/pw-browsers`), sem WebKit; instalar WebKit = dependência nova →
fora. O teste usa **Chromium com emulação de iPhone** (`devices["iPhone 13"]` sem
`defaultBrowserType`) via `test.use` no próprio arquivo, sem projeto novo. Como o Chromium não
reproduz o zoom do iOS, a causa 2 é verificada pelo estilo computado (≥ 16 px).


### CT1 — Teste E2E da assinatura pública no iPhone (reprodução)

- **Origem:** reunião 02/11/2026, B2-04 ("tudo bugado" no iPhone/iOS 18).
- **Escopo:** `e2e/public-signature-mobile.spec.ts` (novo). Só teste, sem mudar produção.
  Monta pela API do fixture (`api` de `e2e/fixtures.ts`): `seedPatient`, `POST /document-templates`
  com corpo longo (≥ 40 parágrafos, uma palavra de 60 caracteres sem espaço, logo e
  identificação da empresa como em `e2e/contracts.spec.ts`), emite o documento e
  `POST /documents/:id/signature-link`; abre `/assinar-contrato/<token>` **sem login** com
  `test.use({ ...iPhone13SemDefaultBrowserType })`; roda só no projeto `mobile`
  (`test.skip(testInfo.project.name !== "mobile")`). Asserções:
  1. sem rolagem horizontal: `documentElement.scrollWidth <= innerWidth`;
  2. sem sobreposição: `.document-paper` com `scrollHeight <= clientHeight + 1` e o topo do
     formulário (`h3` "Assinatura") abaixo do fim da folha (`boundingBox`);
  3. campos de texto (Nome completo, CPF) com `font-size` computado ≥ 16 px;
  4. canvas: `canvas.width === round(clientWidth × min(dpr, 2))`, também depois de
     `page.setViewportSize` para paisagem (844×390);
  5. desenhar com `page.mouse` (down/move/up) sobre o canvas não muda `scrollY` e, preenchido o
     aceite, "Assinar documento" fica ativo; assinar mostra o `success-banner`.
  Sem `test.fail()`/`skip` para esconder: o spec entra vermelho de propósito (o e2e não faz parte
  do gate completo, então o gate segue verde); a saída vermelha vai na descrição do PR e no STATE,
  e a CT2/CT3 a deixam verde.
- **Gate:** `npm run test:e2e -- e2e/public-signature-mobile.spec.ts --project=mobile --workers=1`
  falha hoje em pelo menos as asserções 3 e 4 (e 2, se a causa 1 se confirmar no Chromium);
  saída real anotada no STATE. Gate completo verde (o e2e não está no gate completo).
- **Depende de:** —
- **Status:** DONE

### CT2 — Layout da página pública no celular

- **Origem:** B2-04.
- **Escopo:** CSS em `10-commercial-communications.css`, junto do bloco
  `/* Página pública… */` (não no fim do arquivo):
  - `.public-signature-document .document-paper { aspect-ratio: auto; }` (a folha cresce com o
    texto; nos outros lugares o A4 continua como está) — e, se a CT1 mostrar o mesmo vazamento em
    outros usos do `DocumentPaper` fora do `.document-paper-canvas`, aplicar `min-height` A4 em vez
    de `aspect-ratio` no `.document-paper` geral;
  - `.public-signature-page { min-height: 100vh; min-height: 100dvh; }`;
  - no `@media (max-width: 700px)` existente do arquivo: `.public-signature-page` com padding
    `var(--space-4) var(--space-3)`, `.public-signature-document`/`.public-signature-form` com
    padding lateral `var(--space-4)`, e `input, select, textarea` dentro de
    `.public-signature-page` com `font-size: var(--text-lg)` (16 px — evita o zoom do iOS; regra
    só da página pública, sem mudar o resto do sistema);
  - `.document-rich-content` já tem `overflow-wrap: anywhere`; garantir `min-width: 0` na
    `.public-signature-document`.
  Só tokens (`--space-*`, `--text-*`), nada de px solto nem `style={{}}`, nenhuma fonte < 12 px,
  sem grid novo de 2+ colunas.
- **Gate:** gate completo + `audit-panels.cjs` + o spec da CT1 verde no projeto `mobile` e
  `npm run test:e2e -- e2e/contracts.spec.ts --workers=1` (regressão da folha no desktop).
- **Aceite:** asserções 1–3 da CT1 passam; captura de tela anexada ao PR (Playwright, 390×844).
- **Depende de:** CT1
- **Status:** DONE

### CT3 — Assinatura por toque utilizável

- **Origem:** B2-04.
- **Escopo:** `SignaturePad` em `PublicSignaturePage.tsx` (pode ir para
  `features/contracts/SignaturePad.tsx`) e CSS `.signature-pad canvas`:
  - dimensionar o canvas com `ResizeObserver` (largura CSS × `min(devicePixelRatio, 2)`),
    reaplicando `scale`/estilo do traço; ao mudar de tamanho, redesenhar a assinatura já feita
    (guardar os pontos) ou limpá-la e chamar `onChange("")` — escolher redesenhar;
  - `onPointerCancel` = `end`; ignorar ponteiros extras enquanto um desenha (`pointerId`);
    `event.preventDefault()` no `pointerdown`;
  - CSS: `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`
    (mantendo `touch-action: none`);
  - teste web novo em `features/contracts/signature-link.integration.test.tsx`: `pointercancel`
    no meio do traço ainda libera "Assinar documento"; redimensionar (mock de `ResizeObserver`)
    mantém a assinatura e ajusta `canvas.width`.
- **Gate:** gate completo + spec da CT1 inteiro verde (asserções 4 e 5) no projeto `mobile`
  e no `desktop`.
- **Aceite:** PNG enviado ≤ 700 000 caracteres com o canvas em paisagem (verificado no e2e pelo
  corpo do `POST /public/document-signatures/:token`).
- **Depende de:** CT2
- **Status:** DONE

### CT4 — Validação no iPhone real (manual)

- **Tipo:** manual
- **Escopo:** dono abre um link real em produção no iPhone (Safari e WhatsApp in-app), contrato
  longo: lê sem sobreposição, sem zoom ao tocar nos campos, assina em retrato e paisagem, vê a
  confirmação. Registrar o resultado no STATE.
- **Depende de:** CT3
- **Status:** TODO

### CT5 — Investigar falha do cadastro com contrato (B2-03)

- **Origem:** reunião 02/11/2026, B2-03 ("acho que ele caducou, porque eu coloquei muita coisa").
- **Fato do código:** o cadastro guiado (`features/patients/PatientModal.tsx` + `Guided*`) **não**
  tem campo de contrato; "Documento para o cliente assinar" (`SignatureTemplateField`) está em
  `PatientPlanModal`, `PlanModal`, `AppointmentModal` e `SupplierModal`, e o documento é emitido
  depois de salvar (`SignatureSendStep`, `features/contracts/SignatureRequest.tsx`).
- **Escopo (timebox: uma sessão, sem código de produção):** tentar reproduzir, com a API em
  memória e com o build de produção:
  1. cadastro guiado com o máximo de itens (`maxGuidedPlans = 10` planos com turma + avulsos +
     produtos) e, em seguida, plano/atendimento com contrato pela ficha;
  2. "caducou" = sessão expirada: JWT de `8h` (`modules/auth/routes.ts`); com token vencido o
     `transport.ts` limpa a sessão no 401 (`crm:session-ended`) — verificar se o formulário longo
     se perde e qual mensagem aparece;
  3. limites: `bodyLimit` padrão 8 MB (`route-context.ts`), 1 MB na assinatura pública, contrato
     com modelo grande/logo; validação zod de `guidedPatientInputSchema` com itens no limite;
  4. pedir ao dono, se existir, o horário da demo para cruzar com o log da API em produção.
  Registrar no STATE: passos, resultado e mensagem exata.
- **Saída:** se reproduzir → criar **CT6 — Correção** no PLAN.md com causa, arquivos e teste que
  falha antes (web ou API `*.integration.test.ts`). Se não reproduzir → registrar
  "B2-03 não reproduzido" com o que foi tentado e **não** criar correção.
- **Gate:** sem gate de código; entregável é a anotação no STATE (e, se for o caso, a CT6).
- **Depende de:** — (independente de CT1–CT4)
- **Resultado (02/11/2026):** reproduzida uma falha que combina com "coloquei muita coisa".
  Com a API em memória (teste temporário, não commitado): cadastro guiado com 10 planos (1 + 9
  adicionais, com turma) → 201; modelo de contrato com 19 754 caracteres e todas as variáveis →
  emissão, status "issued" e link de assinatura → 200. **Falha:** observações do cliente com mais
  de 2 000 caracteres → 400 "Observações: Use no máximo 2000 caracteres." O `textarea`
  "Observações" do cadastro (`PatientModal.tsx`) não tem `maxLength`, então a tela aceita o texto
  e só recusa ao salvar; o mesmo vale para "Observação" da aula experimental
  (`GuidedDemonstrationFields.tsx`, limite 1 000 na API). Não dá para afirmar que foi esse o erro
  da demo (o trecho da reunião é ininteligível), nem a sessão de 8 h: a CT4 (no iPhone) e o log
  de produção no horário da demo confirmam. Correção na CT6.
- **Status:** DONE


### CT6 — Limite das observações no cadastro guiado

- **Origem:** CT5 (B2-03).
- **Escopo:** `patientNotesMaxLength` (2 000) e `leadAppointmentNotesMaxLength` (1 000)
  exportados de contracts (`patients/model.ts`, `agenda/model.ts`) e usados no schema e no
  `maxLength` dos `textarea` de `PatientModal.tsx` (Observações) e
  `GuidedDemonstrationFields.tsx` (Observação). Teste web em
  `guided-client-registration.integration.test.tsx`.
- **Gate:** gate completo
- **Aceite:** os dois campos têm `maxLength` igual ao limite da API (teste web).
- **Depende de:** CT5
## Pedidos avulsos do dono

### V1 — Vales para colaboradores

- **Pedido (02/11/2026):** vale com valor configurável, colaborador que recebe e mês em que é
  descontado do salário; aparece no Financeiro e na Folha. Decisões do dono: despesa **já paga**
  na entrega; criado e consultado **dentro da aba Folha**; desconto em **um mês só**.
- **Escopo:** lançamento da folha `kind: "advance"` (`payroll_entries.advance_payable_id`,
  migração `0040`) ligado a uma despesa paga em "Folha de pagamento" (DRE no mês do desconto);
  `POST`/`DELETE /finance/payroll/advances` (`finance.payroll_manage`); remover o vale a lançar
  estorna e cancela a despesa; estorno pelo Financeiro recusado (`PAYROLL_ADVANCE_PAYABLE`).
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

## Rodada 8 — Correções do QA ponta a ponta (pedido do dono, 17/10/2026)

Origem: QA em produção (modo Demonstração, admin) de 17/10/2026. IDs com prefixo `Q` para não
colidir com a rodada 7 (QC1 = C1 do relatório do QA, QM = M, QV = V). Branch `main`
(push só com autorização do dono). Commits `fix(QC6): …` em pt-BR. Próxima migração livre: calcule pela regra de "PRs sem conflito" do `CLAUDE.md` (desde 30/10/2026 o banco é MySQL/MariaDB e as migrações recomeçaram em `0001`; a numeração antiga do Postgres não vale mais).

Ordem da Fase 1 (métricas depois dos dados): QC6 → QC2 → QC3 → QC4 → QC5 → QC8 → QC1 → QC7 →
QC9 → QC10. Depois Fase 2 (QM), Fase 3 (QV) e regressão (QR).

### Decisões do dono (18/10/2026)

- **QC8/QC3 comanda:** mantém o crédito pré-pago preso ao atendimento (pré-venda de atendimento
  futuro continua permitida); corrigir só exibição e prioridade de consumo.
- **QC3 tolerância:** realizado/falta a partir de **15 min antes** do início (constante, sem
  configuração).
- **QC7 "Pagamento atrasado":** vira etiqueta **automática** (parcela vencida e em aberto), não
  editável à mão.
- **QM9 estoque:** aba "Estoque" no Financeiro (sem item novo no menu lateral).
- Fora desta rodada: job diário de lembrete (QC2 item 5, infraestrutura) e remoção dos dados de
  teste do QA em produção (Anexo A — feita pelo dono).

### Triagem no código (18/10/2026)

- QC1 confirmado: `sales-report.ts` divide por `previousComparable.netSalesInCents` negativo.
- QC3 confirmado: `PATCH /appointments/:id/status` não compara com a hora atual.
- QC4: `group_enrollments.enrolled_at` já existe; falta usá-lo nos participantes e gravar o fim.
- QC5 confirmado: `bookReplacement` não exige sessão futura.
- QC6: web sem React Query/SWR; cada tela recarrega pelo próprio `useEffect`.
- QC7 confirmado: card conta `status === "active"` (inclui esgotados); filtros sem Expirado/Cancelado.
- QC8: não é cobrança dupla — `tab-service-credits.ts` cria plano `single` com 1 sessão e
  `sourceAppointmentId`, consumido quando o atendimento é realizado. Problemas reais: rótulo
  "Plano contratado"/"1 de 1 sessões", nome com código ("Comanda E2CD5FDF") e `consumeSession`
  ordena por validade, então outro plano pode ser consumido antes do crédito da comanda.
- QC9 confirmado: texto fixo em `AppointmentRescheduleHistoryModal.tsx`.
- QC10 confirmado: `inline-validation.ts` só limpa o erro em `input`/`change`; escolher na lista
  não dispara nenhum dos dois. Sem texto digitado, a lista mostra os `patients` pré-carregados.
- QM15: ainda há "movimenta" em 8 arquivos de src (login demo, inventário, DRE, conciliação…).
- QV1: `html { scrollbar-gutter: stable }` + `useBodyScrollLock` somando `padding-right` no body
  — suspeita de compensação dupla.

### Fase 1 — Críticos

### QC6 — Dados atualizados sem recarregar após mutações

- **Escopo:** mapear mutações → telas afetadas (fechar comanda → aba Financeiro do cliente,
  contas a receber, estoque, planos, histórico; criar plano → planos, contas a receber, ficha;
  baixa/estorno → financeiro, dashboard, caixa do dia; status do atendimento → agenda, dashboard,
  ficha). Sem dependência nova: um mecanismo único em `shared` (ex.: versão de dados por domínio
  que as telas assinam e que as mutações em `shared/api` incrementam). Contadores das abas (ex.:
  "Contas a receber (N)") vêm da mesma consulta da lista ou recarregam junto. Testes web: fechar
  comanda atualiza a aba Financeiro da ficha sem remontar; contador atualiza.
- **Gate:** gate completo
- **Depende de:** —
- **Status:** DONE

### QC2 — Atendimentos passados "Pendente de finalização"

- **Escopo:** estado derivado em contracts/agenda (`scheduled`/`confirmed` com fim < agora, fuso
  da clínica). Dashboard: card "Atendimentos a finalizar (N)" com link para lista filtrada. Agenda:
  selo nos blocos pendentes (Dia, Semana, Mês, lista). Lista filtrada com seleção e ação em lote
  "Marcar como realizados" / "Marcar falta" (rota em lote nova ou chamadas existentes, respeitando
  `agenda.attendance`). "Clientes atendidos no mês" e "sem retorno" seguem contando só realizados,
  com `HelpTip` explicando. Testes contracts, API (lote, se houver) e web.
- **Gate:** gate completo
- **Depende de:** QC6
- **Status:** DONE

### QC3 — Bloquear ações clínicas em atendimento futuro

- **Escopo:** API: `completed` e `no_show` só com `startsAt − 15 min <= agora`, senão
  `DomainError("APPOINTMENT_NOT_STARTED", "Disponível a partir de <data hora>.", 409)`; mesma
  regra no lote da QC2. Evolução clínica: listar e aceitar só atendimentos iniciados (API recusa).
  Comanda continua aceitando atendimento futuro (decisão do dono). Web: botões desativados com
  dica "Disponível a partir de 19/10 às 10:00". Constante compartilhada em contracts. Testes API
  (memória; PG se tocar SQL) e web.
- **Gate:** gate completo
- **Depende de:** QC2
- **Status:** DONE

### QC4 — Matrícula não aparece em sessões anteriores

- **Escopo:** `enrolled_at` (data da clínica) vira o início; a matrícula ganha data de início
  editável (padrão hoje) e o cancelamento grava o fim (migração nova 0081: `ended_at`, preenchida
  nas canceladas com `updated_at`). Participantes da sessão = início ≤ data da sessão e (sem fim
  ou fim ≥ data). Vale também para lotação e presença. Memória + PG; teste PG opt-in.
- **Gate:** gate completo
- **Depende de:** QC3
- **Status:** DONE

### QC5 — Reposição só em sessão futura, com vagas e retorno

- **Escopo:** API `bookReplacement` recusa sessão já iniciada e a sessão de origem. Web: opções
  só futuras, com vaga e diferentes da origem, rótulo "20/10 · 18:00 · 3 vagas"; sem crédito,
  estado vazio "Nenhum crédito de reposição disponível"; sucesso/erro por toast (U1) e resultado
  "Bruna reservada em 20/10". Testes API e web.
- **Gate:** gate completo
- **Depende de:** QC4
- **Status:** DONE

### QC8 — Crédito da comanda com rótulo e consumo corretos

- **Escopo:** mantém o modelo (decisão do dono). `consumeSession` (memória e PG) prioriza o plano
  com `sourceAppointmentId === appointment.id`. Exibição: nome sem código ("Pilates individual ·
  pago na comanda"), selo "Aguarda atendimento" enquanto não consumido; histórico e linha do tempo
  usam "Serviço avulso na comanda" em vez de "Plano contratado"; créditos de comanda fora do card
  "planos ativos" e do saldo da tela Planos. Sem migração de dados (saldo 1 está certo até o
  atendimento). Testes API (prioridade de consumo, rótulo) e web.
- **Gate:** gate completo
- **Depende de:** QC5
- **Status:** DONE

### QC1 — Variação de vendas sem percentual impossível

- **Escopo:** `changePercent` nulo quando a base anterior ≤ 0, num helper único em contracts
  usado pela API e pelo Excel. `TrendBadge`: seta e cor pelo sinal de `changeInCents`; sem base,
  mostra "Sem base de comparação" e a diferença em R$. Dashboard e Relatórios (Comparação mensal)
  usam o mesmo. Mantém "Vendido líquido" e mostra "Estornos" à parte quando houver. Teste:
  anterior −R$ 7.000 e atual R$ 490 → sem % e sem seta vermelha.
- **Gate:** gate completo
- **Depende de:** QC8
- **Status:** DONE

### QC7 — Contadores consistentes e "Pagamento atrasado" automático

- **Escopo:** Planos: card "ativos" usa `planDisplayStatus` (= filtro Ativo); filtros ganham
  "Expirado" e "Cancelado" para a soma bater com "Todos" ("Vencendo" fica como subconjunto de
  Ativo, sinalizado na interface). "Pagamento atrasado" vira etiqueta automática = cliente com
  parcela vencida e em aberto (mesma regra de `overdue_payment`), calculada na API nos dois
  repositórios, exibida como selo e no filtro de etiquetas, sem edição manual; migração nova
  remove a etiqueta manual dos clientes; demo atualizado. Clientes e Contatos sugeridos dão o
  mesmo número. Testes contracts, API e web.
- **Gate:** gate completo
- **Depende de:** QC1
- **Status:** DONE

### QC9 — Histórico de reagendamentos sem texto do Financeiro

- **Escopo:** remover o parágrafo "Receitas e despesas pela baixa…" de
  `AppointmentRescheduleHistoryModal.tsx`; teste web confere a ausência.
- **Gate:** gate completo
- **Depende de:** QC7
- **Status:** DONE

### QC10 — Busca de cliente sem erro preso

- **Escopo:** `PatientPicker` limpa o erro inline (`aria-invalid`/`.inline-field-error`) ao
  escolher; a seleção é desfeita se o texto for editado; validação só no blur/envio; a lista só
  abre com texto digitado e filtrada por ele (inclusive ao voltar do cadastro rápido). Vale para
  todos os usos (agendamento, matrícula, prontuário, contratos, plano, SOS). Testes web.
- **Gate:** gate completo
- **Depende de:** QC9
- **Status:** DONE

### QF1 — Testes da API independentes da hora do dia (pedido do dono, 19/10/2026)

- **Origem:** bloqueio da QM9. Desde a QC3 (realizado/evolução só a partir de 15 min antes do
  início), 4 testes falham quando a suíte roda antes do 1º atendimento demo do dia:
  crm-api-agenda "saves a SOAP draft…", "versions and finalizes…", "records satisfaction
  surveys…" e crm-api-patients "creates installments and consumes a session exactly once".
- **Escopo:** só testes (API e web, sem mudar regra de produção): concluir o atendimento com o
  relógio depois do início (`test-support/clock.ts`) ou usar atendimento já iniciado; varrer as
  suítes com o relógio cedo e tarde e corrigir juntos os que dependem da hora (ex.: web
  clinical-appointment-picker "lists the latest appointments first…", que falha antes das 09:45).
- **Gate:** gate completo; os arquivos corrigidos passam com o relógio fixo cedo (ex.: 05:00 de
  São Paulo) e tarde (ex.: 23:00).
- **Status:** DONE

### QF2 — Cadastro guiado continua nos próximos passos (feito pelo dono, 19/10/2026)

- **Origem:** commit `fbd690b`, fora do loop.
- **Escopo:** depois do cadastro guiado (demonstração, plano, serviço avulso, matrícula ou lista
  de espera), o modal "Cliente cadastrado" abre já preenchido com o que foi criado, sem repetir
  as operações. Testes web em patients/PatientNextSteps e guided-client-registration.
- **Gate:** gate completo
- **Status:** DONE

### Fase 2 — Usabilidade

Cada item: confirmar no código antes; se já resolvido na rodada 7, marcar DONE com evidência.
Gate completo em todos, na ordem da tabela.

| ID | Item | Status |
|----|------|--------|
| QM1 | "Novo atendimento" do Dashboard abre o modal (`/agenda?novo=1`) | DONE |
| QM2 | Após agendar, a agenda vai para a data salva e destaca o bloco por 2 s | DONE |
| QM3 | Serviço↔profissional↔sala (U10): vínculos no demo e conferir filtro; `*` em Cliente quando obrigatório | DONE |
| QM4 | Seletor de data fecha ao escolher, nunca cortado, dias passados com estilo próprio | DONE |
| QM5 | Comanda sem layout pulando; destrutivo à esquerda e separado; confirmar "Cancelar comanda" | DONE |
| QM6 | Detalhes do atendimento: rodapé fixo com ações e "Editar" (serviço, sala, observação) | DONE |
| QM7 | "⋯" vira menu (Editar, Remarcar, Histórico, Cancelar) | DONE |
| QM8 | Turmas: turma no topo, sessões próximas/anteriores (4+4) colapsáveis, "Marcar todos presentes", "8 matriculados · 4 vagas livres" | DONE |
| QM9 | Estoque/produtos em aba "Estoque" do Financeiro; ficha mantém só "Comandas" | DONE |
| QM10 | Lead com telefone/e-mail/CPF de cliente existente avisa antes de salvar | DONE |
| QM11 | `useDirtyGuard`: Esc/X em formulário alterado pergunta "Descartar alterações?" | DONE |
| QM12 | "Serviço avulso" lista os serviços avulsos ou orienta onde cadastrar | DONE |
| QM13 | Toast em toda mutação (matrícula, reposição, NPS); sino com aniversários, parcelas vencidas e atendimentos a finalizar, com skeleton | DONE |
| QM14 | "Confirmar" desativado listando etapas faltantes; erro do SOAP uma vez só | DONE |
| QM15 | Sem "movimenta", UUID ou código de seed na interface ("Comanda nº 12") | DONE |
| QM16 | Histórico: um evento por ação, resumo com cliente, valor e objeto | TODO |
| QM17 | Linha de profissionais da agenda fixa ao rolar; botão "Hoje" em todas as visões | TODO |

### Fase 3 — Visual

| ID | Item | Status |
|----|------|--------|
| QV1 | Barra lateral não pula ao abrir modal (compensação dupla gutter + padding?) | TODO |
| QV2 | Abas da ficha com o estilo das abas de Configurações (pílula ativa) | TODO |
| QV3 | Reset de fieldset, `summary` com chevron, tabelas e links do design system | TODO |
| QV4 | Comanda: grade de 3 colunas com `min-width: 0`, valores à direita, botões com gap | TODO |
| QV5 | Textos duplicados ("Sala Sala de Dança", "Cliente / Cliente") | TODO |
| QV6 | Barra de progresso do plano com semântica definida e legenda "0 de 8 usadas" | TODO |
| QV7 | Espaço entre seções em Turmas | TODO |
| QV8 | `PageHeader` igual em Configurações; botões `button-sm` em Serviços e salas, com preço e duração | TODO |
| QV9 | Legenda da agenda em uma linha/popover; colunas do kanban com `min-width` e indicação de rolagem | TODO |
| QV10 | Sem borda/faixa lateral colorida em nenhum lugar do sistema, inclusive a agenda (pedido do dono, 19/10) — ver abaixo | TODO |

**QV10 — detalhe.** Remover toda faixa lateral colorida (`border-left` colorido ou `box-shadow: inset Npx 0 0`).
Triagem de 19/10: `.month-group` (05-agenda.css:300), `.day-event.group` (05-agenda.css:386),
`.day-grid-event[style*="--pro-color"]` (05-agenda.css:1548), `.patient-row:hover`
(04-dashboard-clients.css:395) e `.clinical-timeline article` (07-clinical.css:400). Conferir se
há outras regras (inclusive em `::before`) e remover também. Decisão do dono: vale também para
a agenda, então a cor do profissional deixa de aparecer como faixa no evento. Não colocar outro
destaque no lugar sem perguntar. Os divisores neutros de 1px entre colunas (ex.:
08-settings.css:1456) não são faixa colorida e ficam. Teste: nenhuma dessas regras sobra no CSS.

### Fase 4 — Regressão

### QR1 — E2E dos críticos

- **Escopo:** Playwright (`e2e/`): QC1 base negativa, QC3 realizado no futuro recusado, QC4
  matrícula fora de sessão passada, QC5 reposição só futura, QC6 financeiro sem recarregar, QC8
  crédito da comanda consumido uma vez.
- **Gate:** gate completo e `npm run test:e2e -- --workers=1`
- **Depende de:** QV10
- **Status:** TODO

### QR2 — Fluxo do dia a dia e itens não testados (manual)

- **Tipo:** manual
- **Escopo:** agendar → confirmar → realizar → evolução → comanda → baixa → Dashboard,
  Relatórios, Caixa do dia, Histórico; exportar/importar, Excel, PDF/impressão de contrato,
  WhatsApp, logout/sair de todos, mesclar, recorrência, pausar/renovar; celular ≤ 400 px.
- **Depende de:** QR1
- **Status:** TODO

## Rodada 9 — B6-05: importar clientes sem CPF (reunião de 02/11/2026)

Origem: decisão do estúdio na reunião de 02/11/2026 (item B6-05). A planilha do estúdio e o
sistema anterior não têm CPF; hoje a importação recusa a linha ("CPF é obrigatório.") e a base
não entra. Regra do estúdio: **"se subir planilha não precisa, mas pra cadastrar manualmente
precisa"**. IDs com prefixo `CP`. Ordem: CP1 → CP2 → CP3 → CP4 → CP5 → CP6. CP1 e CP2 saíram num commit
só: a etiqueta calculada nos contratos muda a resposta da API na hora, e o gate não fecha com
uma sem a outra. Arquivos quentes:
nenhum (patients não está na lista do `CLAUDE.md`). **Sem migração** (ver "Banco").

### Mapa no código (triagem de 02/11/2026)

| Onde | Hoje | Depois |
|---|---|---|
| `contracts/patients/model.ts` `patientInputSchema.cpf` (l. 140) | obrigatório e válido | **inalterado** (cadastro manual, PUT com CPF, lead) |
| `contracts/patients/model.ts` `patientImportRequiredFields` (l. 555) | nome, CPF, telefone | nome e telefone |
| `contracts/patients/types.ts` `Patient.cpf` (l. 89) | já opcional ("cadastros antigos e mesclados") | inalterado |
| `contracts/commercial/model.ts` conversão de lead (l. 47) | CPF obrigatório | inalterado (é cadastro manual) |
| `contracts/patients/model.ts` `guidedPatientInputSchema` (l. 405) | usa `patientInputSchema` | inalterado (cadastro guiado exige) |
| API `modules/patients/patient-import.ts` (l. 467–485, 506–544) | `patientInputSchema` → erro "CPF é obrigatório." | schema de importação com CPF opcional; CPF presente continua validado |
| API `POST /patients/import` + `importPatients` (memória `storage/memory/patients.ts:210`, MySQL `storage/mysql/patients.ts:313`) | duplicidade por CPF **ou** telefone; já pula CPF vazio | só muda o tipo do parâmetro |
| API `POST /patients`, `POST /patients/guided` (`routes.ts:212`, `:236`) | exige | inalterado |
| API `PUT /patients/:id` (`routes.ts:395`) | exige (`patientInputSchema`) | ver CP3 |
| API externa `POST /external/v1/patients` → `/patients` (`external/endpoints.ts:212`) | exige | inalterado (cadastro manual por integração); `GET` já devolve `cpf` ausente quando falta |
| Exportação `patient-export.ts:113` | `String(patient.cpf ?? "")` | inalterado (célula vazia; exportar → reimportar passa a funcionar) |
| Web `PatientModal.tsx` (cadastro rápido, guiado e edição: l. 444, 604, 962) | `required` + `isValidCpf` sempre | novo: exige; edição: ver CP3 |
| Web `PatientImportModal.tsx:141`, `features/patients/model.ts:125/383` | texto "nome, CPF e telefone são obrigatórios" | ver CP4 |
| Web `LeadConvertModal.tsx` | exige | inalterado |
| Contrato: `contracts/contracts/model.ts:302` `paciente_cpf` | sem CPF sai "não informado" e entra em `missingFields`; `DocumentWizard.tsx:378` e `SendForSignatureModal.tsx:342` mostram "Confira os dados que faltam" — **não bloqueia** | ver P1 |
| Recibo (`finance/types.ts:671`, `ReceiptModal.tsx`) | não usa CPF do cliente (só CNPJ/CPF da clínica) | sem impacto |
| Ficha/agenda (`PatientRecordTabs.tsx:127`, `AppointmentDetailsModal.tsx:391`) | já tratam ausência ("Não informado") | sem impacto |

### Banco

- `apps/api/migrations/0001_schema.sql:1058`: `` `cpf` VARCHAR(191) `` **aceita nulo**, com
  `UNIQUE KEY patients_clinic_id_cpf_key (clinic_id, cpf)`. No InnoDB (MySQL 8 e MariaDB) a chave
  única aceita vários `NULL`, mas **não** vários `''`. Todas as gravações já usam `cpf || null`
  (`storage/mysql/context.ts:488`, `patients.ts:373`, `patient-management.ts:170`,
  `commercial.ts:441`); o teste MySQL da CP2 trava isso (dois importados sem CPF na mesma clínica).
- **Nenhuma migração.** Se alguma tarefa precisar de uma, o número segue a regra do `CLAUDE.md`
  ("nunca `01xx`"; hoje a maior em `origin/main` é `0039`). Atenção: branches remotos antigos da
  era Postgres ainda têm `0119`/`0120`; o comando de `for-each-ref` do `CLAUDE.md` devolve esses
  números — ignore os `01xx` e use o maior abaixo de `0100` (hoje `0099`, em branch remoto) + 1.

### Efeitos colaterais avaliados

- **Duplicidade:** sem CPF, o telefone é a única chave na importação (já é assim:
  `patient-import.ts:507–530`, `importPatients` nos dois repositórios). Risco conhecido e
  anterior: familiares com o mesmo telefone saem como "duplicado" — fora do escopo, sem mudança.
  Leads (`findLeadDuplicates`) e conversão de lead (`storage/*/commercial.ts`) casam por telefone
  ou e-mail também; converter um lead com o telefone de um cliente importado sem CPF reaproveita
  o cadastro e grava o CPF do lead — e a etiqueta sai sozinha (teste na CP2).
- **Busca por CPF:** memória (`item.cpf?.…`) e MySQL (`coalesce(cpf, '')`) já toleram ausência.
- **Mesclar:** a mescla grava `cpf = NULL` no cliente de origem (`storage/mysql/patient-management.ts:160`);
  por isso a etiqueta **não** vale para cliente mesclado (`mergedIntoPatientId`).
- **Contrato sem CPF:** hoje já permite, com aviso. Ver P1.
- **Recibo:** não usa o CPF do cliente. NFS-e (fora de escopo) vai exigir CPF quando existir.

### Decisões

- **Etiqueta "Falta CPF" automática**, no molde da `OVERDUE_PAYMENT_TAG`
  (`contracts/patients/automatic-tags.ts`): calculada na leitura (`!cpf && !mergedIntoPatientId`),
  nunca gravada, sai sozinha quando o CPF é preenchido, não pode ser criada/editada à mão
  (mesmo 400 `PATIENT_TAG_AUTOMATIC`). Motivo: gravar a etiqueta exigiria lembrar de tirá-la em
  todo caminho que preenche CPF (edição, conversão de lead, mescla); calculada, isso é automático
  e também cobre cadastros antigos sem CPF. Diferença para "Pagamento atrasado": visível para
  **todos os perfis** (não depende do Financeiro) e categoria `status` (roxo), não `financial`.
- **Edição de cliente sem CPF (decidido pelo código, CP3): permitir salvar sem CPF, mantendo a
  etiqueta.** Motivos: `PatientModal` é o único caminho de edição (telefone, etiquetas, desconto,
  apelido, motivo da alteração — `api.updatePatient` só é chamado em `PatientModal.tsx:614`);
  exigir CPF ali travaria qualquer ajuste em quase toda a base logo no início do uso, que é
  exatamente o problema da B6-05. A regra do estúdio fala em *cadastrar* manualmente, não em
  editar. Limites: CPF digitado continua validado; **CPF já gravado não pode ser apagado**
  (400 `PATIENT_CPF_REQUIRED`, "O CPF já cadastrado não pode ser apagado."), então um cliente
  com CPF nunca volta a "Falta CPF" pela edição. O dono pode vetar; se vetar, a CP3 vira "exigir
  CPF na edição" e o resto do plano não muda.

### Pergunta ao dono

- **P1 — Contrato de cliente sem CPF:** hoje o contrato é emitido com "inscrito(a) no CPF sob o
  nº **não informado**" e a tela avisa "Confira os dados que faltam" (lista "CPF do cliente").
  Recomendação: **manter permitido** (não bloqueia a operação; o aviso já existe) e só deixar o
  aviso explícito na CP5. Alternativa: bloquear a emissão/envio para assinatura quando o modelo
  usa `{{paciente_cpf}}` e o cliente não tem CPF (409 `DOCUMENT_PATIENT_CPF_MISSING`, "Informe o
  CPF do cliente antes de emitir este contrato."). A CP5 só começa com a resposta; CP1–CP4 não
  dependem dela.

### CP1 — Contratos: CPF opcional na importação e etiqueta "Falta CPF"

- **Escopo:** `contracts/patients/model.ts`: `optionalCpfSchema` (vazio → `undefined`, preenchido
  → dígitos válidos, mesma mensagem "Informe um CPF válido."), `patientImportInputSchema =
  patientInputSchema.extend({ cpf: optionalCpfSchema })`, tipo `PatientImportInput`;
  `patientImportRequiredFields` = nome e telefone; `PatientImportRow.input` passa a
  `PatientImportInput`. `automatic-tags.ts`: `MISSING_CPF_TAG = "Falta CPF"` em
  `automaticPatientTagNames`; categoria por etiqueta (`automaticPatientTagCategoryOf(name)`,
  substitui a constante única `automaticPatientTagCategory`, usada em `shared/lib/formatting.ts:213`
  e `PatientsPage.tsx:389`); `needsCpf(patient)` (sem CPF e não mesclado); `withAutomaticPatientTags`
  ganha a regra do CPF independente do conjunto de inadimplentes. `patientInputSchema` não muda.
- **Testes:** `contracts.unit.test.ts` (schema de importação com/sem/inválido; `needsCpf` com
  mesclado; etiqueta entra e sai; `isAutomaticPatientTag("falta cpf")`).
- **Gate:** gate completo
- **Status:** DONE

### CP2 — API: importar sem CPF e aplicar a etiqueta

- **Escopo:** `patient-import.ts` usa `patientImportInputSchema`; mensagem "CPF é obrigatório."
  sai; CPF inválido continua erro; duplicidade por CPF só quando há CPF. `ClinicRepository.importPatients`
  e as duas implementações recebem `PatientImportInput[]` (o `createPatient` interno aceita CPF
  ausente; gravar `NULL`, nunca `''`). `automaticPatientTagger` (`modules/patients/automatic-tags.ts`):
  "Falta CPF" para todos os perfis; "Pagamento atrasado" continua só com módulo finance. Filtro
  por etiqueta em `GET /patients` passa a aceitar "Falta CPF" (já filtra depois do tagger).
  `POST/PATCH /patient-tags` com "Falta CPF" → 400 `PATIENT_TAG_AUTOMATIC` (mensagem genérica
  para as duas etiquetas). Etiqueta "Falta CPF" vinda na planilha é ignorada (como hoje).
- **Testes (memória):** reescrever a parte de importação de `patient-required-cpf.integration.test.ts`
  (planilha sem coluna CPF e com CPF vazio → `created: 1`, cliente com `tags` contendo "Falta
  CPF", `cpf` ausente); `POST /patients` e `/leads/:id/convert` sem CPF continuam 400; dois
  importados sem CPF não colidem; mesmo telefone → `duplicate`; CPF inválido → erro; conversão de
  lead com o telefone do importado preenche o CPF e tira a etiqueta; perfil sem Financeiro vê
  "Falta CPF" e não vê "Pagamento atrasado"; mesclado não recebe a etiqueta.
  `patient-import.unit.test.ts` atualizado.
- **Testes (MySQL opt-in):** `storage/mysql/tests/patient-without-cpf.integration.test.ts`
  (molde `nav-tabs.integration.test.ts`, laço memory/mysql): importar dois sem CPF na mesma
  clínica (prova o `NULL` × chave única), busca por nome/telefone/CPF, `cpf` nulo no banco.
- **Gate:** gate completo + `npm run test:mysql` (com `TEST_DATABASE_URL`)
- **Depende de:** CP1
- **Status:** DONE

### CP3 — API: editar cliente sem CPF

- **Escopo:** `patientUpdateInputSchema = patientInputSchema.extend({ cpf: optionalCpfSchema })`
  no `PUT /patients/:id`; se o cadastro anterior tem CPF e o novo vem vazio → 400
  `PATIENT_CPF_REQUIRED` "O CPF já cadastrado não pode ser apagado."; `updatePatient` (memória:
  apagar a chave em vez de gravar `undefined`/`''`; MySQL já grava `NULL`). CPF duplicado na
  edição continua 409 `PATIENT_DUPLICATE`. Histórico registra "CPF: — → 529…".
- **Testes (memória):** editar telefone de importado sem CPF → 200 e etiqueta mantida; preencher
  CPF → etiqueta some em `GET /patients/:id` e na lista; tentar apagar CPF existente → 400; CPF
  de outro cliente → 409. **MySQL opt-in:** acrescentar ao arquivo da CP2 (preencher CPF depois,
  apagar recusado, duplicado → 409).
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** CP2
- **Status:** DONE

### CP4 — Web: importação, edição e etiqueta

- **Escopo:** `PatientImportModal.tsx`: dica "nome e telefone são obrigatórios; quem vier sem CPF
  recebe a etiqueta “Falta CPF”"; mapeamento sem asterisco no CPF; na prévia, resumo "N sem CPF"
  (contado das linhas válidas sem `input.cpf`, sem contrato novo). `PatientModal.tsx`: cadastro
  novo (rápido e guiado) **continua exigindo** CPF; edição de cliente sem CPF: campo sem
  `required`, fora de `useMissingFields`, `isValidCpf` só se preenchido, dica "Cliente sem CPF:
  preencha quando tiver. A etiqueta “Falta CPF” sai sozinha."; edição de cliente com CPF segue
  obrigatória. Lista de clientes: "Falta CPF" nas opções de etiqueta automática para todos os
  perfis (`PatientsPage.tsx:139`), com a cor da categoria `status`. Textos neutros em gênero.
- **Testes (web):** importação com planilha sem CPF mostra "1 sem CPF" e importa;
  `patient-quick-registration` e `guided-client-registration` seguem barrando sem CPF; editar
  cliente sem CPF salva sem CPF; editar cliente com CPF e apagar o campo é barrado; filtro "Falta
  CPF" disponível sem permissão do Financeiro.
- **Gate:** gate completo
- **Depende de:** CP3
- **Status:** DONE

### CP5 — Contrato de cliente sem CPF (conforme P1)

- **Escopo (recomendado, se o dono mantiver permitido):** no `DocumentWizard` e no
  `SendForSignatureModal`, quando faltar `paciente_cpf`, aviso específico "O cliente não tem CPF:
  o contrato vai sair com “não informado” no lugar do CPF." com o atalho existente "Atualizar
  dados do cadastro". **Se o dono escolher bloquear:** regra na API de emissão e de link de
  assinatura (memória e MySQL, mesma checagem em `contracts/contracts/model.ts` só quando o
  modelo usa `{{paciente_cpf}}`), botão desativado com a mesma mensagem na web.
- **Testes:** web (aviso/bloqueio) e, no caso de bloqueio, API memória + MySQL opt-in.
- **Gate:** gate completo
- **Depende de:** CP4 e resposta da P1
- **Status:** BLOCKED (aguarda P1)

### CP6 — Conferência manual com a planilha do estúdio

- **Tipo:** manual
- **Escopo:** importar a planilha real (sem CPF) em homologação; conferir duplicados por
  telefone, etiqueta "Falta CPF" na lista e no filtro, edição sem CPF e preenchimento posterior
  (etiqueta some), contrato de um importado.
- **Depende de:** CP4
- **Status:** TODO
