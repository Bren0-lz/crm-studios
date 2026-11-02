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

## Rodada 9 — B2-02: turma cheia entra na lista de espera (reunião de 02/11/2026)

Origem: item B2-02 da reunião de 02/11/2026 (Breno, cobrado duas vezes): "A turma está cheia, aí
a gente consegue cadastrar, mas ele já entra automático na lista de espera." IDs com prefixo `TW`.
Um PR por tarefa (fluxo do `CLAUDE.md`); ordem TW1 → TW6, empilhando TW2–TW4/TW6 (mexem em
`route-access.ts` e `groups/routes.ts`). Sem migração nova (os status já existem); tarefas com SQL
rodam também `npm run test:mysql`.

### Triagem no código (02/11/2026, `main` 75d3190)

- Matrícula em turma sem vaga **não dá erro, não bloqueia e não passa da capacidade** nas três
  entradas: cadastro guiado (`GuidedGroupField` → `POST /patients/guided` → `insertGroupEnrollment`),
  turma (`POST /group-enrollments` → `createGroupEnrollment`) e venda de plano
  (`storage/*/plan-purchases.ts`). Regra `activeCount < capacity ? "active" : "waitlisted"`
  (memory/agenda.ts `createGroupEnrollment`; mysql/context.ts `insertGroupEnrollment`); cliente e
  plano são salvos na mesma transação.
- MySQL: `SELECT capacity … FROM group_classes … FOR UPDATE` antes do `COUNT`, sessão READ
  COMMITTED (`infrastructure/mysql-client.ts`), duplicidade barrada por
  `UNIQUE group_enrollment_current_idx`. Não há teste de última vaga nem de matrículas simultâneas.
- Avisos: `groupEnrollmentToast` (turma) e `PlanGroupPicker` (venda) já avisam; `guidedNotice`
  diz "A turma X está cheia: o cliente entrou…" (sem nome) e o `GuidedGroupField` só marca
  "turma cheia (lista de espera)" no texto da opção.
- **Promoção automática:** cancelar matrícula ativa ou aumentar a capacidade promove sozinho o 1º
  da fila (`promote` em memory/agenda.ts; mysql/agenda.ts `cancelGroupEnrollment` e
  `updateGroupClass`). Não há tela de "oferecer vaga".
- Duas filas sem ligação: a da turma (`group_enrollments.status='waitlisted'`, "Espera N" em Turmas)
  e a página Lista de espera (`features/waitlist`, por serviço/produto, status manual).
- Plano × espera: validade pelo `validFrom` escolhido na venda e parcelas criadas na venda; nada
  olha o status da matrícula. Matrícula em espera não entra em presença
  (`groupEnrollmentCoversSession`), então não consome sessão.

### Decisões (Breno, 02/11/2026)

- **D1:** nunca matrícula acima da capacidade e **nunca promoção automática**: vaga aberta gera
  notificação, a equipe liga e confirma com a pessoa ("Confirmar matrícula").
- **D2:** fila não é furada: matrícula nova só fica ativa com vaga livre **e fila vazia**; havendo
  fila, vai para a espera (guiado, turma, venda e API externa).
- **D3:** qualquer posição da fila pode ser confirmada; confirmação sob a mesma trava da turma,
  409 `GROUP_FULL` "A turma não tem vaga livre." se a vaga já foi tomada; início = hoje.
- **D4:** notificação derivada (sem tabela): turmas ativas com `activeEnrollments < capacity` e
  `waitlistCount > 0` no `GET /notifications`, só para quem tem `groups.enroll`.
- **D5 (pergunta ao dono, aberta):** o código não decide a política comercial. "Cliente que compra
  plano e cai na lista de espera da turma: (a) validade e cobrança começam na data escolhida, como
  hoje; (b) o plano fica pausado até confirmar a vaga; ou (c) a venda fica para depois da vaga?"
  Até a resposta, nada muda na validade nem na cobrança (TW5 só deixa isso explícito na tela). Se
  a resposta for (b) ou (c), vira TW7.
- A fila da turma aparece também na página Lista de espera (TW6).

| ID | Título | Status |
|---|---|---|
| TW1 | Regra única de vaga (sem furar fila) + testes de última vaga e concorrência | TODO |
| TW2 | Fim da promoção automática + `POST /group-enrollments/:id/confirm` | TODO |
| TW3 | Web: vaga aberta e "Confirmar matrícula" na turma | TODO |
| TW4 | Notificação de vaga aberta com fila | TODO |
| TW5 | Aviso "Turma cheia: Fulana entrou na lista de espera de <turma>" nas três entradas | TODO |
| TW6 | Filas das turmas na página Lista de espera | TODO |

### TW1 — Regra única de vaga + testes de última vaga e concorrência

- **Escopo:** contracts/agenda `groupEnrollmentStatusFor({ capacity, activeCount, waitlistCount })`
  (D2), usada em memory/agenda.ts `createGroupEnrollment` e mysql/context.ts
  `insertGroupEnrollment` (contar `waitlisted` no mesmo `SELECT`, sob a trava da turma).
- **Testes:** contrato em `contracts.unit.test.ts`. API (memória,
  `modules/groups/group-capacity.integration.test.ts`): última vaga → `active`; a seguinte →
  `waitlisted` posição 1; fila com vaga livre → `waitlisted`; mesmos casos pelo cadastro guiado
  (cliente e plano salvos) e pela compra de plano. MySQL
  (`storage/mysql/tests/group-capacity.integration.test.ts`, molde `nav-tabs`): turma com 1 vaga,
  `Promise.all` de duas matrículas e de dois cadastros guiados → 1 `active`, 1 `waitlisted`
  posição 1, ativos ≤ capacidade.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** TODO

### TW2 — Fim da promoção automática + confirmar matrícula (API)

- **Escopo:** remover `promote` de `cancelGroupEnrollment` e `updateGroupClass` (memória e MySQL),
  só renumerar a fila; no MySQL, `cancelGroupEnrollment` trava `group_classes … FOR UPDATE` antes da
  matrícula (mesma ordem do insert). Novo `confirmGroupEnrollment(clinicId, enrollmentId)` em
  `ClinicRepository`, memória e MySQL (D3; a lógica do `promote` vira a da confirmação). Rota
  `POST /group-enrollments/:id/confirm` junto do cancel, guarda `groups.enroll` no bloco de turmas
  do `route-access.ts`, entrada em `domainsForMutation`.
- **Testes:** cancelar ativa e aumentar capacidade não mudam ninguém de status; confirmar com vaga
  → ativa e fila renumerada; sem vaga → 409 `GROUP_FULL`; fora da 1ª posição permitido. MySQL: duas
  confirmações simultâneas na última vaga → 1 sucesso, 1 409. Atualizar testes que esperavam
  promoção (`crm-api-patients`, `external-api`, testes de turmas).
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** TW1
- **Status:** TODO

### TW3 — Web: vaga aberta e confirmação na turma

- **Escopo:** em Turmas (`GroupsPage`/`GroupOperationsPanel`), participante em espera ganha
  "Confirmar matrícula" (só com `groups.enroll` e vaga livre): `ActionModal` "Confirme que a
  Fulana aceitou a vaga antes de matricular.", `busy` no salvamento, toast
  `groupEnrollmentToast`. `GroupDetails` mostra "1 vaga aberta · 2 na espera".
  `api.confirmGroupEnrollment` em `shared/api/domains`.
- **Testes:** botão só com vaga e permissão; sucesso atualiza a lista; 409 vira `error-banner` no
  modal.
- **Depende de:** TW2
- **Status:** TODO

### TW4 — Notificação de vaga aberta com fila

- **Escopo:** `groupVacanciesWithWaitlist` no `GET /notifications` (modules/dashboard/routes.ts) e
  no contrato; item em `app/notification-center.tsx` ("Pilates 18h: 1 vaga aberta e 2 na espera —
  ligar e confirmar") com link para Turmas.
- **Testes:** API (só turmas ativas com vaga e fila; some após confirmar; ausente sem
  `groups.enroll`) e web (item e link).
- **Depende de:** TW3
- **Status:** TODO

### TW5 — Aviso claro ao cair na espera

- **Escopo:** `guidedNotice`, aviso da venda e `groupEnrollmentToast`: "Turma cheia: Fulana entrou
  na lista de espera de <turma> (posição N)." (primeiro nome). `GuidedGroupField` com turma cheia
  selecionada mostra o aviso do `PlanGroupPicker` + "O plano vale a partir do início escolhido
  mesmo durante a espera." (D5); o mesmo complemento no `PlanGroupPicker`.
- **Testes:** web (cadastro guiado e venda): resposta `waitlisted` → `success-banner` com o texto,
  cliente e plano salvos; última vaga → "Matrícula feita…".
- **Depende de:** TW4
- **Status:** TODO

### TW6 — Filas das turmas na página Lista de espera

- **Escopo:** `GET /waitlist/groups` (permissão de ver a lista de espera): turmas com fila, horário
  (`describeGroupSchedule`), vagas livres e pessoas em ordem com "desde". `WaitlistPage` ganha a
  seção "Turmas" (`panel`/`panel-head`, `LoadingBlock`/`EmptyState`/`ErrorBanner`), selo "vaga
  aberta" e "Confirmar matrícula" com `groups.enroll` (ação da TW3). A fila manual por
  serviço/produto não muda.
- **Testes:** API (só `waitlisted`, ordem, escopo de filial) e web (seção, vazio, erro, confirmar).
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** TW5
- **Status:** TODO
