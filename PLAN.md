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
  Exceção aberta pelo dono na reunião de 02/11/2026 (Rodada 9): integração com a Bot API do
  Telegram (TG1–TG6). Nenhum outro provedor externo entra.
- Portal ou app do cliente.
- Dependências npm novas, `git push`, edição de migrações existentes, `.env` e `compose.yaml`
  sem autorização do dono.

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
| QM16 | Histórico: um evento por ação, resumo com cliente, valor e objeto | BLOCKED (3 reprovações; ver `diario/2026-11-09-QM16.md`) |
| QM17 | Linha de profissionais da agenda fixa ao rolar; botão "Hoje" em todas as visões | DONE |

### Fase 3 — Visual

| ID | Item | Status |
|----|------|--------|
| QV1 | Barra lateral não pula ao abrir modal (compensação dupla gutter + padding?) | DONE |
| QV2 | Abas da ficha com o estilo das abas de Configurações (pílula ativa) | DONE |
| QV3 | Reset de fieldset, `summary` com chevron, tabelas e links do design system | DONE |
| QV4 | Comanda: grade de 3 colunas com `min-width: 0`, valores à direita, botões com gap | DONE |
| QV5 | Textos duplicados ("Sala Sala de Dança", "Cliente / Cliente") | DONE |
| QV6 | Barra de progresso do plano com semântica definida e legenda "0 de 8 usadas" | DONE |
| QV7 | Espaço entre seções em Turmas | DONE |
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

## Rodada 9 — Pedidos da reunião de 02/11/2026

Reunião com o estúdio em 02/11/2026 (ata com itens B1-01…B6-05). Prazo: sábado (07/11); o
painel de turmas, segunda (09/11). A Rodada 8 fica pausada em QM16 e volta depois desta rodada.
Itens marcados ⏸ dependem de resposta do estúdio: viram tarefa `BLOCKED` com a pergunta exata
em **Origem**, sem inventar a regra.

### Decisões do dono (reunião de 02/11)

- **Assinatura no celular (B2-04):** é o único impeditivo para o estúdio começar a usar o
  sistema. O registro de visualização mostrou "iPhone/iOS 18".
- **CPF (B6-05):** "se subir planilha não precisa, mas pra cadastrar manualmente precisa".
  Cliente importado sem CPF recebe a etiqueta "Falta CPF", que some quando o CPF é preenchido.
- **WhatsApp (B1-07)** e **contato de emergência (B1-10)** obrigatórios no cadastro manual.
  Quem não tem contato de emergência repete o próprio nome e telefone, e o sistema aceita.
  Não haverá checkbox "sem contato" nem permissão para dispensar. E-mail obrigatório ficou
  ambíguo (⏸).
- **Turma cheia (B2-02):** o cliente é cadastrado e entra automaticamente na lista de espera,
  com aviso claro. Nada de matrícula acima da capacidade.
- **Datas das sessões (B1-04):** o dia fixo semanal continua como padrão. Na mesma tela entram
  o resumo das datas, a marca de horário indisponível e as exceções por data. A Agenda continua
  servindo para emergências.
- **Recibo (B5-02, B5-01, B4-08):** o cliente assina o recibo por link, como no contrato
  (antifraude em dinheiro). Em vez de imagem ou PDF, vai uma mensagem "recebemos seu
  pagamento" com o link, por modelo editável e pelo botão de WhatsApp existente (wa.me).
- **Telegram (B5-03, B5-04):** a notificação de pagamento sai quando o cliente **assina** o
  recibo. Também avisam agendamento marcado e cliente novo, e o bot tem comandos para o dia, a
  semana e o mês. **Exceção ao "Fora de escopo"**: esta rodada abre a integração com o provedor
  externo Telegram (Bot API) por decisão do dono na reunião. Nenhum outro provedor entra.
- **Eventos (B2-05 + B3-01):** página nova, anotada como "muito urgente".
- **Painel de turmas (B6-02 a B6-04):** cartões com iniciais, modal com alunos, seletor de
  filial e atrasados clicáveis. Isso fica no repositório `dashboard-studios`; aqui entra só o
  que a API externa precisar (tarefas PX).
- **Barra de pendências (B4-02):** continua fixa no topo, com letra branca e fundo vermelho,
  sem aumentar altura nem fonte.

### Triagem no código (03/11, `main` em `75d3190`)

| Item | Já existe | Falta | Arquivos |
|---|---|---|---|
| B2-04 assinatura no iPhone | Página pública, `SignaturePad` com `devicePixelRatio` e `touch-action: none` | **Causa provável:** `.document-paper` tem `aspect-ratio: 210/297` (altura presa à largura). No celular o texto passa da folha e, como a página pública não usa `.document-paper-canvas` (com `overflow: auto`), transborda por cima do formulário. O `@media (max-width: 700px)` só reduz o padding; o `aspect-ratio: auto` existe só no `@media print`. Também há `min-height: 100vh` (barra do Safari), nenhum tratamento de `pointercancel` e o canvas não é redimensionado ao girar a tela | `features/contracts/PublicSignaturePage.tsx`, `DocumentPaper.tsx`, `styles/10-commercial-communications.css` (~1099, ~1484, ~1837) |
| B2-03 cadastro com contrato "caducou" | — | Erro desconhecido. Hipóteses: token de 8 h expirado (`auth/routes.ts:40`), `bodyLimit` padrão de 1 MiB do Fastify (logo em data URL no `branding`), chave de idempotência repetida | `features/patients/Guided*`, `features/contracts/signature-on-registration.integration.test.tsx` |
| B6-05 CPF | `patients.cpf` aceita nulo (`UNIQUE (clinic_id, cpf)` aceita vários nulos), gravação usa `input.cpf \|\| null`, contrato sai com "não informado" (`missingDocumentValue`), duplicidade e busca já ignoram CPF vazio | `patientInputSchema.cpf` obrigatório; `patientImportRequiredFields` inclui `cpf`; teste `patient-required-cpf.integration.test.ts` exige CPF na importação | `contracts/src/patients/{model,automatic-tags}.ts`, `api/src/modules/patients/{patient-import,routes}.ts` |
| B1-07/B1-10 WhatsApp e emergência | Campos opcionais (`optionalPhoneSchema`) | Obrigatoriedade no cadastro manual sem travar a edição de clientes antigos | `contracts/src/patients/model.ts`, `features/patients/PatientModal.tsx`, `patient-emergency-contact.integration.test.tsx` |
| B1-08 DDD na exportação | **Já atendido:** colunas "DDD (…)" + número em `api/src/modules/patients/patient-export.ts:74`; teste `crm-api-patients.integration.test.ts:3814`; no relatório, `report-workbooks.ts:377` | — | — |
| B2-02 turma cheia | **API já faz:** `insertGroupEnrollment` (`storage/mysql/context.ts:710`) trava a turma (`FOR UPDATE`), conta as vagas e grava `waitlisted` com posição. A venda de plano com turma usa o mesmo método. Aviso existe no cadastro guiado (`features/patients/model.ts:222`) e em Turmas (`groupEnrollmentToast`) | `PatientPlanModal.tsx` ignora `result.enrollment` (sem aviso de espera). O cancelamento **promove sozinho** o primeiro da espera (`storage/mysql/agenda.ts:1276`), o que contradiz "não matricular sem confirmação" (⏸). Validade do plano conta desde a venda mesmo na espera (⏸) | `PatientPlanModal.tsx`, `storage/{memory,mysql}/agenda.ts` |
| B1-04/B1-05 datas das sessões | **Já atendido** no commit `7a0e2229` (02/11): `PlanScheduleSummary.tsx` lista as sessões geradas, consulta `POST /appointments/conflicts`, marca conflito e "Fora da vigência", aceita exceção por sessão; `PlanSessionsSentStep.tsx` envia as datas por wa.me | Rótulo "Conflito: …" em vez de "Horário indisponível"; B1-03 "Dia 1/Dia 2" continua em `features/agenda/PackageWeeklySlotsFields.tsx:55` | idem |
| B5-02/B5-01/B4-08 recibo | Recibo de parcela (`GET /finance/receivables/:id/receipt`, `modules/finance/receipt.ts`, `ReceiptModal.tsx`); link público de assinatura de documento (`document_signature_links`: token, visualizações, `signed_at`, imagem) | O link é preso a `issued_documents`, que exige `template_id`. Não há assinatura de recibo, controle de enviado nem modelo de mensagem de pagamento | `modules/contracts/signature-links.ts`, `PublicSignaturePage.tsx`, `modules/finance/*` |
| B5-03/B5-04 Telegram | Nada. Variáveis reais no hPanel da Hostinger; API sem agendador em segundo plano | Tudo | — |
| B2-05 Eventos | CRM comercial: lead com telefone, e-mail, origem livre, `lead_contacts` (canal, observação, data e hora), `LeadAppointmentModal` (avaliação/experimental), conversão em cliente (`LeadConvertModal`, CPF obrigatório), duplicidade (`contracts/commercial/duplicates.ts`); importador com mapeamento de colunas reaproveitável (`modules/patients/patient-import.ts`) | Entidade evento e vínculo participante→evento | `modules/commercial`, `features/commercial` |
| B3-04 endereço | Endereço da filial (`contracts/src/branches/model.ts`: `street`, `city`…) | Variável de endereço. **Não existe** link do Google Maps no código (a ata supõe que sim) | `contracts/src/communications/model.ts:427`, `MessageBodyEditor.tsx` |
| B3-06 serviço no lembrete | **Já atendido:** `appointment_upcoming` tem `{{servico}}` (`model.ts:433`), preenchido em `auto-campaigns.ts:167`. Falta só o estúdio cadastrar "Avaliação Pilates" e "Avaliação Fisioterapia" | — | — |
| B4-02 barra vermelha | `NotificationsBanner` (`app/NotificationAlerts.tsx`) só aparece quando há pendência destacada. `--red: #b85d53` com branco dá ~4,4:1, **abaixo do AA** (4,5:1). Não há tema escuro | Token de perigo escuro e novo visual | `styles/01-base.css`, `styles/03-shell.css:534` |
| B1-01 sem retorno por serviço | **Já atendido:** filtro "Já contratou" com grupos Planos/Serviços/Produtos (`features/reports/SalesInsights.tsx:162`; teste `reports-redesign.integration.test.tsx:445`) | — | — |
| API externa (painel) | `/external/v1/groups` com `serviceId/serviceName`, `branchId`; membros com `phone`/`email`; `/external/v1/overdue` | O painel espera `businessLine`, `overdueMembers` e `overdueInCents` por turma ("Fase 0", hoje só no CRM simulado) e WhatsApp do aluno | `contracts/src/integrations/external.ts`, `modules/external/routes.ts` |

**Migrações:** maior número na `main` = `0039`; o branch aberto `claude/beautiful-fermi-ou993c`
já usa `0040`. Hoje a próxima livre é `0041`, mas confira pela regra do CLAUDE.md no momento de
cada tarefa (branches antigos do Postgres com `01xx` não contam). Este plano não reserva números.

**Arquivos quentes:** RC e TG mexem em `finance` e `route-access.ts`. TG é empilhado sobre RC e
nunca em paralelo. EV também mexe em `route-access.ts`: abra o PR dela só depois de RC mesclada
ou empilhado.

**Ordem:** CT → CP → PX (prazo de segunda do painel) → CD → TW → SS → EV → RC → TG → CM → NB → AJ.

### CT e CP — já feitas nos PRs #272 e #273

As tarefas CT e CP abaixo foram feitas antes deste plano, nos PRs #272 (assinatura no iPhone e
cadastro com contrato) e #273 (importar clientes sem CPF), que tinham planos próprios com outra
numeração. Aqui fica só o resumo e o que falta. O detalhe está no diário do `STATE.md` (com a
numeração antiga, mapeada em cada tarefa) e no histórico do git.

### CT1 — Página pública de assinatura sem sobreposição no celular

- **Origem:** B2-04 (impeditivo). Link aberto no iPhone (iOS 18) com elementos sobrepostos.
- **Feito em:** #272 (CT1 e CT2 de lá). `e2e/public-signature-mobile.spec.ts` (iPhone 13 emulado
  no Chromium, só no projeto `mobile`); CSS do bloco "Página pública" em
  `10-commercial-communications.css`: folha sem `aspect-ratio` só em `.public-signature-document`,
  `100dvh` e, em ≤ 700 px, respiro menor e campos em `--text-lg` (16 px, sem zoom do iOS).
- **Status:** DONE

### CT2 — Assinar com o dedo no iPhone

- **Origem:** B2-04 (o cliente precisa conseguir assinar no celular).
- **Feito em:** #272 (CT3 de lá). `features/contracts/SignaturePad.tsx`: traços redesenhados ao
  mudar o tamanho (`ResizeObserver`), densidade com teto 2, `pointercancel` encerra o traço e
  emite a imagem, canvas com `user-select: none` e `-webkit-touch-callout: none`.
- **Depende de:** CT1
- **Status:** DONE

### CT3 — Investigar a falha do cadastro guiado com contrato

- **Tipo:** investigação (sem correção às cegas)
- **Origem:** B2-03 ("acho que ele caducou, porque eu coloquei muita coisa").
- **Feito em:** #272 (CT5 e CT6 de lá). Cadastro com 10 planos e contrato de ~19 700 caracteres
  funciona. Reproduzido: observações acima de 2 000 caracteres davam 400 sem `maxLength` no
  campo; corrigido com `patientNotesMaxLength`/`leadAppointmentNotesMaxLength` nos dois textarea
  do cadastro guiado. Não confirmado que foi o erro da demo: pedir ao dono o horário para cruzar
  com o log de produção.
- **Depende de:** CT2
- **Status:** DONE

### CT4 — Validação no iPhone real (manual)

- **Tipo:** manual
- **Origem:** B2-04 (CT4 do #272).
- **Escopo:** dono abre um link real em produção no iPhone (Safari e WhatsApp in-app), contrato
  longo: lê sem sobreposição, sem zoom ao tocar nos campos, assina em retrato e paisagem, vê a
  confirmação. Registrar o resultado no STATE.
- **Depende de:** CT3
- **Status:** TODO

### CP1 — CPF opcional na importação, com etiqueta automática "Falta CPF"

- **Origem:** B6-05 (impeditivo). A planilha do estúdio não tem CPF e a base não entra.
- **Feito em:** #273 (CP1 e CP2 de lá). `optionalCpfSchema` e `patientImportInputSchema` em
  contracts; `patientImportRequiredFields` = nome e telefone; `MISSING_CPF_TAG = "Falta CPF"`
  calculada na leitura (sem CPF e não mesclado), visível para todos os perfis e recusada em
  `POST/PATCH /patient-tags`. Importação sem CPF nos dois repositórios (grava `NULL`); cadastro
  manual e conversão de lead continuam exigindo CPF. Teste MySQL opt-in
  `patient-without-cpf.integration.test.ts`.
- **Depende de:** CT3
- **Status:** DONE

### CP2 — Editar cliente importado sem CPF

- **Origem:** B6-05, efeito colateral.
- **Feito em:** #273 (CP3 e CP4 de lá). `PUT /patients/:id` aceita CPF vazio só se o cliente já
  estava sem CPF; apagar CPF gravado → 400 `PATIENT_CPF_REQUIRED`. `PatientModal` sem `required`
  no CPF só nesse caso; importação mostra "N sem CPF"; filtro "Falta CPF" na lista de clientes.
- **Depende de:** CP1
- **Status:** DONE

### CP3 — Contrato de cliente sem CPF

- **Origem:** B6-05 (CP5 do #273). **P1 respondida pelo dono em 06/11/2026:** bloquear novas
  emissões e novos links quando o modelo usa `{{paciente_cpf}}` e o cliente não tem CPF;
  exigir CPF válido de quem assina; preservar links já enviados e documentos assinados.
- **Escopo:** rascunhos e prévias continuam permitidos. Aviso específico no `DocumentWizard`
  e no `SendForSignatureModal`, com acesso ao cadastro e atualização dos dados. API retorna
  409 `DOCUMENT_PATIENT_CPF_MISSING` na emissão, contratação integrada e geração/renovação
  de link (memória e MySQL). Modelos sem CPF e documentos de fornecedores seguem permitidos.
- **Histórico:** links existentes ainda válidos podem ser abertos, reaproveitados e assinados;
  renovar link vencido exige atender à nova regra. CPF do signatário fica separado do cadastro
  e do texto do contrato. Recibos mantêm seu CPF opcional. Migração `0047_document_patient_cpf`
  preserva a exigência do modelo nos novos rascunhos, inclusive após edição ou exclusão do modelo.
- **Gate:** gate completo, MySQL e navegador desktop/celular
- **Depende de:** CP2 (concluída); P1 resolvida
- **Status:** DONE (06/11/2026; gate completo, MySQL e navegador aprovados)

### CP4 — Conferência manual com a planilha do estúdio

- **Tipo:** manual
- **Origem:** B6-05 (CP6 do #273).
- **Escopo:** importar a planilha real (sem CPF) em homologação; conferir duplicados por
  telefone, etiqueta "Falta CPF" na lista e no filtro, edição sem CPF e preenchimento posterior
  (etiqueta some), contrato de um importado.
- **Depende de:** CP2
- **Status:** TODO

### PX1 — API externa: linha de negócio e inadimplência por turma

- **Origem:** B6-01 a B6-04 (painel de turmas no `dashboard-studios`, prazo segunda). O
  painel já espera `businessLine`, `overdueMembers` e `overdueInCents` por turma
  ("Fase 0" do CRM simulado), e hoje a API real não envia.
- **Escopo:**
  - Serviço ganha "Linha no painel" (`studio` | `aesthetics`, padrão `studio`): migração nova
    `services.business_line VARCHAR(20) NOT NULL DEFAULT 'studio'` com `CHECK`, contracts,
    cadastro de serviço em Configurações e dados demo.
  - `ExternalGroupRow` ganha:
    - `businessLine`, vinda do serviço da turma.
    - `overdueMembers` e `overdueInCents`, com a mesma regra de `/external/v1/overdue`
      (`isOverdueReceivable`).
  - Documentar em `endpoints.ts`. Testes em `external-api.integration.test.ts` e MySQL opt-in.
  - Não implementa as categorias Pilates/Dança: ver PX3.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** CP2
- **Status:** DONE

### PX2 — API externa: WhatsApp e situação de cada aluno da turma

- **Origem:** B6-02 (modal com alunos: nome, telefone e botão de WhatsApp) e B6-04.
- **Escopo:**
  - `ExternalGroupMember` ganha `whatsapp?` e `overdue: boolean`.
  - Privacidade: a API externa já devolve `phone` a quem tem acesso ao painel. O contato
    passa a sair só se a pessoa logada (`X-CRM-User-Token`) tiver `patients.view`; sem a
    permissão, saem só o nome e as iniciais.
  - Testes de API: com e sem a permissão.
- **Decisão do dono (06/11):** `overdue` no formato do CRM simulado do painel (`{ amountInCents, installments, oldestDueDate, daysOverdue }`, só com `finance.view` e só para inscritos ativos), não `boolean`.
- **Gate:** gate completo
- **Depende de:** PX1
- **Status:** DONE

### PX4 — API externa: nomes dos alunos ativos na lista de turmas

- **Origem:** PT2 (bolinhas de iniciais nos cartões do painel). Sem isto, o BFF do painel
  busca `/external/v1/groups/:id` de cada turma (cerca de N+1 vezes a carga do
  `groupsOverview` no CRM). Decisão do dono em 06/11: os nomes vêm na própria lista.
- **Escopo:**
  - `ExternalGroupRow` ganha `memberNames: string[]`: nomes dos inscritos **ativos** da turma
    (sem a lista de espera), na ordem de inscrição, calculados no mesmo `groupsOverview` que
    já monta a lista (nenhuma consulta nova por turma).
  - Só nomes, que o detalhe da turma já devolve sem `patients.view`; nada de contato.
  - Documentar em `endpoints.ts`. Testes em `external-api.integration.test.ts`.
- **Gate:** gate completo
- **Depende de:** PX2
- **Status:** DONE

### PX3 — Serviço sem classificação ("Outros") para os filtros do painel

- **Origem:** B6-01. **Respondida pelo dono em 06/11:** no painel, os filtros são os próprios
  serviços do CRM (vários ao mesmo tempo), agrupados por linha Studio / Estética / Outros, para
  acompanhar novos serviços sem mudar o painel. A linha é escolhida no cadastro do serviço no
  CRM e **só** categoriza o painel (não muda nada no funcionamento do CRM). Serviço sem
  classificação aparece como "Outros". Os serviços que já existem voltam para "sem
  classificação" (decisão do dono), e o estúdio classifica um a um.
- **Escopo:**
  - Migração nova: `services.business_line` passa a aceitar NULL (sem padrão) e todos os
    serviços existentes ficam NULL. O CHECK continua aceitando só `studio`/`aesthetics`.
  - contracts: `ServiceBusinessLine | null` no `Service` e no `ExternalGroupRow.businessLine`;
    na entrada, ausente ao criar = `null`; no PUT, ausente = mantém e `null` explícito limpa.
  - Cadastro de serviço em Configurações: "Linha no painel" com "Sem classificação" (padrão),
    "Studio" e "Estética", e a dica de que isso só vale para o painel. Dados demo coerentes
    (alguns serviços sem classificação).
  - API externa: `businessLine: null` sai como está (o painel mostra "Outros"); documentar em
    `endpoints.ts`. Conferir que `/external/v1/services` devolve `id`, `name` e
    `businessLine` dos serviços ativos (é a lista de filtros do painel).
  - Testes API, web e MySQL opt-in.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** PX4
- **Status:** DONE

### PX5 — API externa: linha e serviços de cada venda e de cada inadimplente

- **Origem:** PT6 (filtro por linha e por serviço em todas as telas do painel). Hoje `/sales` e
  `/overdue` não dizem a linha nem os serviços de cada item, e o painel deduzia a linha pela
  turma do cliente. **Decisões do dono (06/11):** produto ganha a mesma "Linha no painel" do
  serviço (Studio / Estética / sem classificação), escolhida no cadastro do produto no CRM e
  que só categoriza o painel; venda de plano com vários serviços aparece em cada serviço dele,
  com o valor inteiro (não divide).
- **Escopo:**
  - Migração nova: `products.business_line VARCHAR(20) NULL` (sem padrão; existentes NULL),
    CHECK nomeado com `studio`/`aesthetics`. contracts e cadastro de produto com "Sem
    classificação" (padrão), "Studio" e "Estética" e a mesma dica do serviço; PUT ausente
    mantém e `null` limpa (como na PX3). Dados demo coerentes.
  - `SaleMovement` (`/external/v1/sales`) ganha `services: { id, name, businessLine }[]`
    (venda de serviço: o serviço; de plano: todos os serviços do plano; de produto: vazio) e
    `businessLine` do produto na venda de produto (`null` = sem classificação). A linha de
    cada serviço vem do cadastro, inclusive de serviço inativo.
  - `ExternalOverdueRow` (`/external/v1/overdue`) ganha `services: { id, name, businessLine }[]`:
    os serviços de onde vêm as parcelas vencidas do cliente (plano, serviço da comanda/venda) e
    `productLines` (linhas dos produtos dessas parcelas), para o painel filtrar sem deduzir pela
    turma.
  - Documentar em `endpoints.ts`. Testes API e MySQL opt-in.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** PX3
- **Status:** DONE

### PX6 — API externa: ficha do cliente e histórico de pagamentos

- **Origem:** pedido do dono em 07/11 para o painel de turmas: o matriculado vira botão que abre
  os detalhes do cliente, com os dados do CRM e o histórico de pagamento de tudo, com filtros.
  **Decisões do dono (07/11):** abre num modal sobre a turma (PT8); filtros por situação,
  período, origem e serviço/linha; permissões iguais às do CRM (dados cadastrais e contato só com
  `patients.view`; histórico de pagamento só com `finance.view`; sem a permissão, só o nome).
- **Escopo:**
  - `GET /external/v1/patients/:id`: ficha do cliente (nome sempre; com `patients.view`, os dados
    cadastrais e de contato que o CRM mostra na ficha, etiquetas, filial, planos ativos e turmas).
    404 para cliente de outra clínica ou inexistente.
  - `GET /external/v1/patients/:id/payments` (exige `finance.view`): todas as cobranças do
    cliente — planos, comandas, vendas e lançamentos manuais — com origem (`plan` | `tab` |
    `sale` | `manual`), descrição, vencimento, valor, desconto, situação (em aberto, vencida,
    paga, parcialmente paga, estornada/cancelada), baixas (data, valor, forma) e estornos, e
    `services: { id, name, businessLine }[]` + `productLines` como na PX5. Query opcional para
    filtrar por situação, período (vencimento ou pagamento), origem, serviço e linha; sem query,
    tudo, do mais recente para o mais antigo.
  - Documentar em `endpoints.ts`. Testes API (com e sem cada permissão) e MySQL opt-in se houver
    SQL novo.
- **Gate:** gate completo (+ `npm run test:mysql` se mexer em SQL)
- **Depende de:** PX5
- **Status:** DONE

**Tarefas do `dashboard-studios`** (executadas lá, PR para `main` com `npm run check`; cada uma
só depois das PX que usa estarem mescladas no CRM e o CRM simulado `apps/bff/src/mock-crm`
atualizado no mesmo PR):

- PT1: seletor de filial (`useBranchFilter`, já existe) no topo da tela de turmas.
- PT2: cartões por turma, com:
  - bolinhas de iniciais (duas letras), de 4 a 6, depois "+N";
  - "15/20 · 5 vagas".
- PT3: modal (não gaveta) com os alunos: nome, telefone e WhatsApp. Substitui o
  `GroupDrawer.tsx`, reaproveitando o conteúdo. Usa a PX2.
- PT4: "Pagamentos atrasados" clicável, abrindo a lista (`OverduePage`/BFF). Usa a PX1.
- PT5: inscrever pela turma (`EnrollDialog`, `useGroupFlow`) e invalidar o cache de 45 s do
  BFF (`TtlCache.clear`/chave da turma) depois de inscrever, para o cartão atualizar na hora.
  Na turma cheia, a mensagem já vem do CRM (`waitlisted`).
- PT6: filtro por linha e por serviço em **todas** as telas que hoje filtram por linha
  (decisão do dono em 06/11). Linha: Tudo / Studio / Estética / Outros (sem classificação);
  "Tudo" inclui Estética. Serviços: os ativos do CRM (`/external/v1/services`), agrupados por
  linha, com seleção de vários ao mesmo tempo. A escolha fica na URL e acompanha o usuário entre
  as telas. Substitui o filtro de linha atual. Atualizar o CRM simulado (`businessLine` nulo
  em parte dos serviços e produtos). Usa a PX3 e a PX5.
- PT7 (pedido do dono, 07/11): tela de turmas abre na **tabela** por padrão (cartões continuam na
  alternância); na lista de matriculados (tabela e cartão) o aluno com parcela vencida aparece
  marcado como inadimplente (`overdue` da PX2, só com `finance.view`); abrir a lista de
  matriculados não muda a largura das colunas nem o tamanho da tabela.
- PT8 (pedido do dono, 07/11): cada matriculado vira botão que abre, num modal sobre a turma, os
  detalhes do cliente (dados do CRM) e o histórico de pagamento de tudo, com filtros por
  situação, período, origem e serviço/linha. Permissões iguais às do CRM. Usa a PX6.

### CD1 — WhatsApp e contato de emergência obrigatórios no cadastro manual

- **Origem:** B1-07 e B1-10 (decididos).
- **Escopo:**
  - Contracts: schema de **criação manual** com `whatsapp`, `emergencyContactName` e
    `emergencyContactPhone` obrigatórios. Aceita o próprio nome e telefone do cliente como
    contato (sem regra de "diferente de").
  - Vale para o cadastro completo, o rápido, o guiado e a conversão de lead.
  - Edição (`PUT`): mesma regra da CP2. Campo vazio é aceito se já estava vazio (clientes
    antigos continuam editáveis), mas não dá para apagar o que existe. A ficha mostra
    "Cadastro incompleto: falta WhatsApp/contato de emergência".
  - Web:
    - `*` nos campos.
    - Botão "Usar os dados do cliente" no bloco de emergência, que copia nome e telefone.
  - Importação: **não muda** nesta tarefa (ver CD3).
  - Atualizar `demo-patients.ts`, `seed-demo-scenarios.ts` e
    `patient-emergency-contact.integration.test.tsx`.
  - Testes de contracts, API e web.
- **Gate:** gate completo
- **Depende de:** PX3 (ordem; sem dependência de código)
- **Status:** DONE

### CD2 — E-mail obrigatório?

- **Origem:** B1-07. **Pergunta ao estúdio:** "O e-mail deve ser obrigatório no cadastro?"
  Na reunião, alguém disse "tem que ser obrigatório" e outra pessoa "tem gente que não tem".
- **Resposta do dono (04/11):** o e-mail **continua opcional** em todos os cadastros. Sem código
  nesta tarefa. Quem não tem e-mail é sinalizado só na importação (etiqueta "Sem e-mail", CD3).
- **Gate:** —
- **Depende de:** CD1
- **Status:** DONE

### CD3 — Importação sem WhatsApp, contato de emergência ou e-mail

- **Origem:** P2/P3. **Pergunta ao estúdio:** "A planilha pode trazer cliente sem WhatsApp e
  sem contato de emergência, como o CPF?"
- **Respostas do dono (04/11):**
  - A importação **aceita** cliente sem WhatsApp e sem contato de emergência e marca com a
    etiqueta automática **"Cadastro incompleto"**, que some quando os dois forem preenchidos.
  - Etiqueta automática **separada "Sem e-mail"**, só informativa (para filtrar), que some quando
    o e-mail for preenchido. O e-mail continua opcional (CD2).
  - As duas etiquetas valem **só para clientes importados pela planilha**. Cadastro manual antigo
    sem os dados continua só com o aviso na ficha (CD1).
- **Escopo:**
  - Migração nova `0041_patient_imported_at.sql`: `patients.imported_at DATETIME(6) NULL`
    (preenchida por `importPatients` na memória e no MySQL). Clientes importados antes desta
    tarefa não têm a marca e não recebem as etiquetas (não há registro da origem).
  - Contracts (`patients/automatic-tags.ts`): `INCOMPLETE_REGISTRATION_TAG` ("Cadastro
    incompleto") e `MISSING_EMAIL_TAG` ("Sem e-mail"), mesmo mecanismo do `MISSING_CPF_TAG`
    (`needsCpf` → regras novas que exigem cliente importado e não mesclado), incluídas em
    `isAutomaticPatientTag`/`withAutomaticPatientTags`; não podem ser criadas à mão. `Patient`
    ganha `importedAt?`.
  - API: o tagger aplica as duas para todos os perfis (como "Falta CPF").
  - Web: filtro de etiquetas da lista de clientes, dica por etiqueta (`automaticTagHints`) e, na
    prévia da importação, selo "N cadastros incompletos" / "N sem e-mail" e detalhe da linha, como
    o "N sem CPF" da CP2.
  - Testes de contracts, API (memória e MySQL opt-in) e web.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** CD2
- **Status:** DONE

### CD4 — Aviso de profissional sem WhatsApp

- **Origem:** B1-06 (constatação, baixa prioridade). Profissionais cadastrados antes da
  atualização estão sem WhatsApp, e o "compartilhar agenda" fica sem contato.
- **Escopo:**
  - Selo "sem WhatsApp" na lista de usuários/profissionais (`features/settings`).
  - Dica no compartilhar agenda quando faltar o número.
  - Teste web.
- **Gate:** gate completo
- **Depende de:** CD3 (ordem; pode ser feita antes se a CD3 seguir bloqueada)
- **Status:** DONE

### TW1 — Aviso de lista de espera na venda de plano com turma

- **Origem:** B2-02.
- **Triagem:** a API já põe na espera quando a turma está cheia, com trava na turma, inclusive
  na venda de plano. O cadastro guiado e Turmas já avisam.
- **Escopo:**
  - `PatientPlanModal.tsx` usa `result.enrollment` e mostra o toast (`groupEnrollmentToast`):
    "Turma cheia: Fulana entrou na lista de espera de <turma> (posição N)".
  - Seletores de turma (plano, guiado, Turmas) mostram "turma cheia (lista de espera)" como no
    guiado.
  - Testes:
    - API: a última vaga fica com o primeiro; o seguinte vai para a espera (memória).
    - API: duas matrículas concorrentes na última vaga, uma ativa e uma na espera (MySQL
      opt-in).
    - Web: aviso na venda de plano.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** CD4
- **Status:** DONE

### TW2 — Vaga aberta: promover sozinho ou oferecer?

- **Origem:** B2-02 ⏸.
  - **Pergunta ao estúdio (1):** "Hoje, ao cancelar uma matrícula, o primeiro da lista de espera
    é matriculado automaticamente. Preferem que a vaga seja só oferecida (WhatsApp/confirmação)?"
  - **Pergunta ao estúdio (2):** "O plano vendido para quem está na espera começa a contar
    validade e cobrança na venda ou só quando a vaga sai?"
  - Hoje conta na venda: o código não dá resposta segura.
- **Escopo:** conforme as respostas: rotas de cancelamento nos dois repositórios
  (`storage/{memory,mysql}/agenda.ts`) e datas do plano na venda com turma.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** TW1
- **Status:** DONE (oferta de vaga aprovada pelo dono; cobrança/validade mantidas)

### TW3 — Turma cheia vai para a Lista de espera; matrícula pela lista

- **Origem:** pedido do dono (07/11/2026). Decisões: turma cheia não vende plano (sem forma de
  pagamento nem contrato), no cadastro guiado e no Novo plano; serviço sem turma segue vendendo;
  quando abrir vaga, a equipe matricula pela Lista de espera, registra o pagamento e envia o
  contrato (sem portal do cliente).
- **Escopo:**
  - Contratos: `next: "waitlist"` e `waitlist` no passo `plan` do cadastro guiado
    (`serviceId` + turma desejada), `waitlistEntries` na resposta, nota "Turma desejada: …".
  - API: venda de plano com turma sem vaga (guiado e contratação) → 409 `GROUP_FULL`, tudo
    desfeito; o guiado grava as entradas da Lista de espera na mesma transação (memória e MySQL).
  - Web: cadastro guiado e Novo plano escondem pagamento/contrato com turma cheia e colocam o
    cliente na Lista de espera; o modal da Lista de espera matricula numa turma com vaga, abre o
    Novo plano com a turma escolhida (pagamento, contrato e link de assinatura) e marca a entrada
    como atendida.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** TW2
- **Status:** DONE

### SS1 — Rótulos claros dos dias fixos e do horário indisponível

- **Origem:** B1-03 e B1-04.
  - "Dia 1 / Dia 2" confundiu: pensaram que era a 1ª data.
  - Resumo, conflito e exceções já existem (commit `7a0e2229`).
  - Envio das datas por WhatsApp (B1-05) também já existe.
- **Escopo:**
  - `PackageWeeklySlotsFields.tsx`: "1º dia da semana", "2º dia da semana"…
  - `PlanScheduleSummary.tsx`: selo "Horário indisponível" com o motivo em seguida
    ("Horário indisponível · Profissional ocupado").
  - Atualizar os testes que procuram os rótulos antigos:
    - `single-package-schedule`
    - `appointment-package-weekdays`
    - `application-shell-finance`
- **Gate:** gate completo
- **Depende de:** TW2 (ordem; pode ser feita antes se a TW2 seguir bloqueada)
- **Status:** DONE

### SS2 — Exceção por data atende?

- **Origem:** P5 ⏸. **Pergunta ao estúdio:** "A exceção por data atende ou querem escolher
  livremente o dia de cada sessão?"
- **Escopo:** se quiserem escolha livre, avaliar o modo "datas manuais" que a Agenda já tem
  (`AppointmentForm`, `manualDates`) também na contratação.
- **Gate:** gate completo
- **Depende de:** SS1
- **Status:** DONE (07/11/2026; dono: a exceção por data atende, sem código novo)

### EV1 — Eventos: modelo, rotas e permissões

- **Origem:** B2-05 + B3-01 ("muito urgente"). Exemplo: aulão na praça com 130 pessoas; lista
  de 29 contatos que fechou 7 Pilates e 4 dança.
- **Decisão técnica (recomendada):** o participante **é um lead** do CRM comercial com vínculo
  ao evento. Motivos:
  - Reaproveita o registro de contato (`lead_contacts`), a marcação de avaliação
    (`LeadAppointmentModal`), a conversão em cliente e o aviso de duplicidade.
  - Não duplica a pessoa em duas listas.
  - Fica pergunta ao dono **sem bloquear** (pergunta 5 da lista do estúdio): "O participante
    deve aparecer também no funil comercial?" Se não, o funil filtra `eventId` fora por padrão.
- **Escopo:**
  - Migração nova:
    - Tabela `events`: id, `clinic_id`, `branch_id` opcional, nome, local/cidade, número de
      pessoas, `starts_at`, observações (`LONGTEXT`), `created_by`, datas.
    - `leads.event_id` com FK nomeada `ON DELETE SET NULL`.
  - Contracts `commercial/events.ts`: schemas e indicadores. Lead criado pelo evento tem origem
    "Evento: <nome>" e interesse padrão "Evento".
  - Métodos no `ClinicRepository` (memória + MySQL). Rotas `GET/POST/PUT /events`,
    `GET /events/:id` com participantes e indicadores.
  - Indicadores, sem outros:
    - contatados;
    - interessados;
    - avaliações marcadas;
    - convertidos em cliente.
  - Permissões novas `events.view` e `events.manage`, no bloco de `crm.*` em `permissions.ts`
    e `route-access.ts` (junto das rotas `/leads`, não no fim).
  - Testes API (memória + MySQL opt-in) e contracts.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** SS2 (ordem)
- **Status:** DONE

### EV2 — Página Eventos

- **Origem:** B2-05.
- **Escopo:**
  - `features/events/EventsPage.tsx`:
    - começa com `PageHeader`, depois `.panel` com a lista de eventos;
    - estados `LoadingBlock`, `EmptyState` e `ErrorBanner`;
    - modal de criar e editar o evento.
  - Item "Eventos" no menu lateral logo depois de "Comercial" (bloco relacionado), rota
    `/eventos`.
  - Celular: grids com a regra de 700px.
  - Teste web.
- **Gate:** gate completo
- **Depende de:** EV1
- **Status:** DONE
- **Validação:** mesclada na `main` (CM1 no #289; EV2 e AJ1 no #293, após os empilhados #290/#291). CI do #291 (mesma árvore): `checks` verde; `browser`/`mysql` só com as falhas conhecidas da `main`.

### EV3 — Participantes e registro de contato

- **Origem:** B2-05.
- **Escopo:**
  - Na página do evento, a lista de participantes tem nome, telefone, e-mail e WhatsApp.
  - Adicionar participante cria um lead ligado ao evento, com o aviso de duplicidade existente.
  - Registro de contato: contato feito (sim/não), data e hora e observação.
    - Usa `lead_contacts`.
    - Observação num campo grande com contador e limite de 2000 caracteres, igual às notas do
      lead.
  - Os indicadores se atualizam.
  - Testes API e web.
- **Gate:** gate completo
- **Depende de:** EV2
- **Status:** DONE

### EV4 — Marcar avaliação pelo evento

- **Origem:** B2-05 ("marcar a avaliação ali mesmo, sem a pessoa sumir da lista do evento").
- **Escopo:**
  - Ação "Marcar avaliação" no participante, reaproveitando `LeadAppointmentModal`.
  - O participante continua na lista, com o selo "Avaliação em 05/11 às 10:00".
  - Testes web.
- **Gate:** gate completo
- **Depende de:** EV3
- **Status:** TODO

### EV5 — Finalizar cadastro do participante

- **Origem:** B2-05.
- **Escopo:**
  - "Finalizar cadastro" abre o cadastro de cliente pré-preenchido, pelo fluxo de conversão de
    lead (`POST /leads/:id/convert`).
  - Salva sem plano. CPF, WhatsApp e emergência seguem a CD1.
  - O participante fica ligado ao cliente criado e conta em "convertidos".
  - Testes API e web.
- **Gate:** gate completo
- **Depende de:** EV4
- **Status:** TODO

### EV6 — Importar participantes por planilha

- **Origem:** B2-05 (lista de contatos do evento).
- **Escopo:**
  - Reaproveitar o analisador com mapeamento de colunas de `modules/patients/patient-import.ts`.
    Extrair a parte genérica, sem duplicar.
  - Campos: nome, telefone, e-mail, WhatsApp.
  - Prévia com duplicados (telefone) antes de gravar.
  - Testes API e web.
- **Gate:** gate completo
- **Depende de:** EV5
- **Status:** TODO

### EV7 — Mensagem para a lista do evento?

- **Origem:** B2-05 ⏸. **Pergunta ao estúdio:** "Querem mandar mensagem para a lista do
  evento?" A resposta na reunião foi "Não, não. É esse sistema de mensagem aí": não ficou claro
  se querem incluir os participantes nas Campanhas.
- **Escopo:** nada de envio em massa até a resposta.
- **Gate:** gate completo
- **Depende de:** EV6
- **Status:** BLOCKED

### RC1 — Recibo para assinatura: modelo, migração e repositório

- **Origem:** B5-02 (ênfase do Daniel: evitar fraude em pagamento em dinheiro na recepção).
- **Decisão técnica:** tabela própria em vez de `issued_documents`, porque o documento exige
  `template_id` e o recibo não vem de modelo. Reaproveita a lógica de token, visualizações e
  assinatura de `modules/contracts/signature-links.ts`, extraída para um helper comum, sem
  duplicar.
- **Escopo:**
  - Migração nova, tabela `receipt_signatures`:
    - Identificação: id, `clinic_id`, `receivable_id`, `paid_at` da baixa, valor, `token`
      único (≥ 32).
    - Envio e leitura: `sent_at`, `first_viewed_at`/`last_viewed_at`, `view_count`, `views`
      JSON.
    - Assinatura: `signed_at`, `signature` JSON, `signature_image`.
    - Cancelamento: `cancelled_at`, `cancel_reason`.
    - `CHECK`s iguais aos de `document_signature_links`.
  - Uma linha por baixa (parcela paga). Estados: gerado → enviado → visualizado → assinado,
    ou cancelado.
  - Estornar a baixa cancela o recibo na mesma transação.
  - O recibo é gerado na baixa, dentro da transação.
  - Evento interno `receipt.signed` (`{ clinicId, receiptId, receivableId, patientId,
    amountInCents, signedAt }`) emitido **depois do commit**, por um publicador injetável
    (`domain-events.ts`, sem fila nesta tarefa). A TG2 consome esse evento.
  - Métodos no `ClinicRepository` (memória + MySQL).
  - Testes API (baixa → recibo; estorno → cancelado), MySQL opt-in.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** EV7 (ordem)
- **Status:** DONE

### RC2 — Link público para assinar o recibo

- **Origem:** B5-02 ("como se fosse um contrato de recebimento").
- **Escopo:**
  - Rotas públicas `GET/POST /public/receipt-signatures/:token` (como `/public/document-signatures/:token`): visualização registrada e assinatura com
    nome, aceite e imagem.
  - Rota web `/assinar-recibo/:token` reaproveitando a estrutura da `PublicSignaturePage` (CT1/CT2)
    com o recibo (`ReceiptModal` em modo leitura).
  - Recibo cancelado ou já assinado mostra o estado correto.
  - PDF ou impressão do recibo assinado com a assinatura e a data.
  - Testes API e web, e e2e celular no `public-signature.spec.ts`.
- **Gate:** gate completo e `npm run test:e2e -- e2e/public-signature.spec.ts --workers=1`
- **Depende de:** RC1
- **Status:** DONE

### RC3 — Mensagem "recebemos seu pagamento" com modelo editável

- **Origem:** B5-01. Mandar o recibo em imagem/PDF é "muita mão".
- **Escopo:**
  - Modelo editável em Configurações › Mensagens, com o editor de variáveis existente:
    `{{nome}}`, `{{valor}}`, `{{data_pagamento}}`, `{{link_recibo}}`.
  - Texto padrão: "Olá {{nome}}, recebemos seu pagamento de {{valor}} em {{data_pagamento}}.
    Assine o recibo: {{link_recibo}}".
  - Botão "Enviar recibo pelo WhatsApp" na baixa e no recebível: wa.me com o texto pronto.
  - O sistema registra o clique (`sent_at`), não o envio real.
  - Prévia no editor e valor de exemplo nos dados demo.
  - Testes de contracts (preenchimento), API e web.
- **Gate:** gate completo
- **Depende de:** RC2
- **Status:** DONE

### RC4 — Controle de enviado, visualizado e assinado

- **Origem:** B4-08 ("esqueci de colocar um controle de enviado").
- **Escopo:**
  - No recebível, no detalhe do pagamento e no histórico, mostrar:
    - enviado em;
    - visualizado em;
    - assinado em.
  - Selo na lista do Financeiro com filtro "Recibo não assinado".
  - Testes web.
- **Gate:** gate completo
- **Depende de:** RC3
- **Status:** DONE

### RC5 — Aviso "X clientes ainda não assinaram o recibo"

- **Origem:** B5-02, parte 2.
- **Escopo:**
  - Grupo novo no centro de notificações (`app/notification-center.tsx`): recibos enviados e
    não assinados há mais de N horas. Pode ser destacado na barra (preferências existentes em
    `NotificationSettingsModal`).
  - Frequência e horário configuráveis na clínica.
  - Como a API não tem agendador, o aviso é calculado na leitura: a barra e o sino mostram
    quando a frequência configurada vence. O envio periódico pelo Telegram fica com a TG4.
  - Testes API e web.
- **Gate:** gate completo
- **Depende de:** RC4
- **Status:** DONE

### RC6 — Periodicidade padrão do aviso de recibo

- **Origem:** B5-02 ⏸. **Pergunta ao estúdio:** "Com que frequência e em que horário avisar
  'X clientes não assinaram o recibo'?"
- **Escopo:** só o valor padrão da configuração da RC5 (até lá: diário, 18:00, provisório e
  marcado no código como pendente).
- **Gate:** gate completo
- **Depende de:** RC5
- **Status:** DOING (regra imediata definida pelo dono; validação geral bloqueada por duas migrações 0052 já na main)

### RC7 — Pagamento e recibo no fim do envio do contrato

- **Pedido do dono (07/11/2026):** ao concluir o envio do contrato pelo WhatsApp, perguntar se o
  cliente já pagou. "Sim" dá baixa e gera o recibo para enviar pelo WhatsApp, no mesmo fluxo;
  "Não" fecha e a cobrança fica em aberto no Financeiro. Decisões do dono: a baixa usa a tela
  completa do Financeiro ("Dar baixa na parcela"); plano parcelado dá baixa só na 1ª parcela.
- **Escopo:** só a venda de plano com documento (Novo plano da ficha e da tela Planos), que é a
  que gera cobrança. Pergunta só para quem pode dar baixa (`finance` editável +
  `finance.receive`). Sem API nova nem migração.
- **Gate:** gate completo
- **Status:** DONE

### RC8 — Contrato, horários e pagamento no fim do cadastro de cliente

- **Pedido do dono (07/11/2026):** a pergunta do pagamento da RC7 vale sempre que se fecha um
  contrato de plano, inclusive no fim do cadastro de cliente (Novo cliente em Clientes e na
  Agenda); e os horários pelo WhatsApp também precisam aparecer ali. Decisões do dono: um campo
  "Documento para o cliente assinar" por plano do cadastro; o avulso do cadastro ganha o mesmo
  agendamento de sessões do Novo plano.
- **Escopo:** `POST /patients/guided` aceita `document` em cada plano e `appointments` nos
  avulsos, na mesma transação (memória e MySQL, helpers extraídos da contratação de plano).
  Ao concluir: link de cada contrato → horários → cobrança Pix (como antes) → pergunta do
  pagamento de cada plano com contrato → recibo. Sem migração.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### TG1 — Cliente do Telegram, configuração e vínculo

- **Origem:** B5-03/B5-04. Pedido da dona do estúdio. Exceção de provedor externo registrada
  nas decisões acima. Empilhada sobre a RC (arquivos quentes).
- **Escopo:**
  - `infrastructure/telegram-client.ts`: Bot API por HTTPS com `fetch`, sem dependência nova.
    Interface injetável e cliente falso nos testes, sem rede.
  - Token: proposta de variável de ambiente `TELEGRAM_BOT_TOKEN` no hPanel da Hostinger, nunca
    no repositório (ver TG6). Sem token, a integração fica desligada e a tela diz isso.
  - Webhook `POST /integrations/telegram/webhook/:secret`:
    - A API já é HTTPS pública na Hostinger. Long polling exigiria processo contínuo, que a
      hospedagem compartilhada não garante.
    - Valida o cabeçalho `X-Telegram-Bot-Api-Secret-Token`.
  - Vínculo:
    - Configurações gera um código de uso único (10 min) para o usuário.
    - Ele envia `/vincular <código>` ao bot.
    - Grava `telegram_links` (migração nova: `clinic_id`, `user_id`, `chat_id`, `linked_at`).
    - Só perfis marcados numa configuração da clínica podem vincular (padrão: admin).
  - Fila de saída `telegram_outbox` (migração nova): mensagem, tentativas, `next_attempt_at`,
    `last_error`, `sent_at`.
    - Drenada depois de cada commit que enfileira, a cada chamada do webhook e sob demanda.
    - Até 5 tentativas com espera crescente; a falha fica registrada.
    - Falha no Telegram nunca desfaz a operação de origem.
  - Rotas e permissões no bloco de integrações do `route-access.ts`.
  - Testes API (vínculo, código vencido, segredo errado, fila com falha) e MySQL opt-in.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** RC6 (empilhada sobre RC5 se a RC6 seguir bloqueada)
- **Status:** DONE

### TG2 — Aviso de recibo assinado

- **Origem:** B5-04. A notificação sai quando o cliente **assina** ("o assinado é a forma mais
  certeira; fora isso tudo é manipulável"), não quando a baixa é registrada.
- **Escopo:**
  - Assinante do evento `receipt.signed` (RC1) enfileira para os chats vinculados:
    "Recibo assinado: <cliente> · R$ <valor> · pago em <data>".
  - Teste: registrar a baixa não envia; assinar o recibo envia uma vez.
  - Falha do Telegram não quebra a assinatura.
- **Gate:** gate completo
- **Depende de:** TG1
- **Status:** DONE

### TG3 — Aviso de agendamento e de cliente novo

- **Origem:** B5-03.
- **Escopo:**
  - Ao criar um atendimento (qualquer funcionário), avisar quem marcou, o cliente, o serviço,
    o profissional e a data e hora.
  - Ao criar um cliente, mandar o aviso de cliente novo.
  - Enfileirado depois do commit, para fora da transação.
  - Recorrência e plano com várias sessões geram **um** aviso com o resumo, não um por sessão.
  - "Cliente novo" = cadastro criado (pergunta 4 confirma).
  - Testes API.
- **Gate:** gate completo
- **Depende de:** TG2
- **Status:** DONE

### TG4 — Comandos do bot: dia, semana e mês

- **Origem:** B5-03.
- **Escopo:**
  - `/hoje`, `/semana` e `/mes` respondem com as aulas e atendimentos do período (fuso da
    clínica), agrupados por dia, com totais.
  - Só para chats vinculados.
  - O aviso periódico de recibos (RC5) é enviado quando um comando ou o webhook rodar depois
    do horário configurado (sem agendador).
  - Testes API com cliente falso.
- **Gate:** gate completo
- **Depende de:** TG3
- **Status:** DONE

### TG5 — Outras métricas no Telegram

- **Origem:** B4-09/B5-05 ⏸. **Pergunta ao estúdio:** "Que outras métricas querem receber no
  Telegram?" Na reunião: "deve faltar algumas coisinhas".
- **Escopo:** o envio já é extensível (fila + formatadores). Sem métricas inventadas.
- **Gate:** gate completo
- **Depende de:** TG4
- **Status:** BLOCKED

### TG6 — Quem recebe e onde guardar o token

- **Origem:** P7 ⏸. **Perguntas ao dono:**
  - (1) Só a Aryana recebe, ou outros perfis?
  - (2) O token do bot fica em variável de ambiente no hPanel (proposta) ou cifrado na
    configuração da clínica no banco?
  - (3) "Cliente novo" é o cadastro ou a primeira compra?
  - Editar `.env` ou `compose.yaml` exige autorização.
- **Escopo:** ajustar o padrão de perfis da TG1 e o texto da TG3 conforme as respostas.
- **Gate:** gate completo
- **Depende de:** TG5
- **Status:** BLOCKED

### CM1 — Variável "Inserir endereço" da filial

- **Origem:** B3-04. "Tem gente que é leigo": além do link, o endereço por extenso.
- **Triagem:** não existe link do Google Maps no código. O endereço da filial existe
  (`branches/model.ts`).
- **Escopo:**
  - Variável `{{endereco}}` nos eventos com atendimento (`appointment_upcoming`). O texto vem
    da filial do agendamento: rua, número, bairro, cidade.
  - Variável `{{link_mapa}}` com `https://www.google.com/maps/search/?api=1&query=<endereço>`:
    só um link, sem API nem provedor.
  - Filial sem endereço: o editor mostra o aviso "Cadastre o endereço da unidade em
    Configurações" e a mensagem sai sem a linha (texto vazio, sem `{{endereco}}` cru).
  - Prévia no editor, valor de exemplo nos dados demo.
  - Testes de contracts, API e web.
- **Gate:** gate completo
- **Depende de:** TG6 (ordem; não depende de código)
- **Status:** DONE
- **Validação:** mesclada na `main` (CM1 no #289; EV2 e AJ1 no #293, após os empilhados #290/#291). CI do #291 (mesma árvore): `checks` verde; `browser`/`mysql` só com as falhas conhecidas da `main`.

### CM2 — Lembrete com antecedência em horas

- **Origem:** B3-07 ⏸. **Pergunta ao dono:** "Querem mesmo o lembrete em horas? Qual era a
  ressalva?" (o trecho ficou ininteligível e não houve decisão).
- **Escopo planejado:**
  - Unidade do passo (`days` | `hours`) em `autoCampaignStepSchema`, com migração nova.
  - O cálculo de `appointment_upcoming` usa horas até o início.
  - A fila manual mostra "para enviar agora" quando falta ≤ N horas.
  - O envio continua manual (wa.me + marcar como enviada).
- **Gate:** gate completo
- **Depende de:** CM1
- **Status:** BLOCKED

### CM3 — Nomes dos lembretes configuráveis

- **Origem:** B4-01 ⏸. **Pergunta ao dono:** "Querem renomear os lembretes? Quais nomes?"
  (Breno ofereceu, sem resposta).
- **Triagem:** o nome da campanha automática já é editável (`communications/model.ts:337`).
  Se o pedido for o rótulo do passo ("2 dias antes"), é um campo novo opcional por passo, com
  migração e impacto na fila e no histórico, que mostram o rótulo.
- **Gate:** gate completo
- **Depende de:** CM2
- **Status:** BLOCKED

### NB1 — Barra de pendências com fundo vermelho e letra branca

- **Origem:** B4-02 (Daniel). Barra fixa no topo; "não bota isso aí muito grande não".
- **Escopo:**
  - Token novo `--danger-strong` em `01-base.css`, perto de `--red`, com contraste ≥ 4,5:1
    com branco. `#963f35`, já usado no foco da barra, dá ~6,9:1.
  - `.notification-banner` com fundo `--danger-strong`, texto e ícone brancos, sem mudar
    padding, altura nem fonte.
  - Itens internos: fundo translúcido branco ou borda branca, com contraste AA. Foco visível
    com `outline` branco de 2px sobre o vermelho.
  - A barra só aparece quando há pendência destacada (comportamento atual, mantido e testado).
  - Avaliar tirar as animações "breathe/ring/shake" (enfeite, contra o tom sóbrio) e anotar no
    PR.
  - Teste web: a barra some sem pendência e aparece com a classe nova.
- **Gate:** gate completo
- **Depende de:** CM3 (ordem)
- **Status:** DONE

### AJ1 — Plano com vários serviços: layout do "Adicionar serviço"

- **Origem:** B4-05. O bloco ficou "feio" (palavras do Breno), e a referência de valor usa o
  preço do avulso.
- **Escopo:**
  - Em `features/settings/PlanTemplateModal.tsx` (~442), cada serviço numa linha de
    `form-grid`, com remover alinhado e "Adicionar serviço" como `secondary-button button-sm`
    abaixo.
  - A tabela "Preço de tabela" com valores à direita e regra de 700px.
  - Preço de referência: mantém "Total avulso" (já rotulado "Só referência"). Se o dono quiser
    outra base, pergunta no PR sem bloquear.
  - Teste web (`configured-plan-catalog`).
- **Gate:** gate completo
- **Depende de:** NB1
- **Status:** DONE
- **Validação:** mesclada na `main` (CM1 no #289; EV2 e AJ1 no #293, após os empilhados #290/#291). CI do #291 (mesma árvore): `checks` verde; `browser`/`mysql` só com as falhas conhecidas da `main`.

### AJ2 — Botões do editor de modelo de prontuário com respiro

- **Origem:** B5-06.
- **Escopo:**
  - Espaçamento entre os botões de `features/clinical/AssessmentTemplateFields.tsx` com
    `gap: var(--space-2)`, sem mudar o comportamento.
  - Teste existente continua verde; o `audit-panels` passa.
- **Gate:** gate completo
- **Depende de:** AJ1
- **Status:** DONE

### AJ3 — Itens já atendidos (registro)

- **Origem:** B1-01, B1-08, B3-06 e B1-05.
- **Escopo:** sem código. Registrar no STATE.md com a evidência:
  - B1-01: `SalesInsights.tsx:162` + `reports-redesign.integration.test.tsx:445`.
  - B1-08: `patient-export.ts:74` + `crm-api-patients.integration.test.ts:3814`.
  - B3-06: `auto-campaigns.ts:167`.
  - B1-05: `PlanSessionsSentStep.tsx`.
- **Gate:** —
- **Depende de:** AJ2
- **Status:** DONE

### AJ4 — Pendências de decisão do estúdio

- **Origem:** ⏸ **Perguntas ao estúdio:**
  - **B1-12:** qual forma de pagamento estava faltando? O pagamento misto já existe.
  - **B2-06:** aula experimental é paga ou gratuita? Hoje é gratuita, sem preço.
    - Aceitar preço opcional exige campo de valor na demonstração do cadastro guiado
      (`GuidedDemonstrationFields.tsx`) e no agendamento `trial`.
    - Também exige gerar recebível/comanda e contar nos relatórios de experimentais
      (`storage/*/reports.ts`).
  - **B3-02:** o CEP deve preencher cidade e endereço? Exige consulta a serviço externo
    (ex.: ViaCEP), que é provedor externo e precisa de autorização; sem dependência nova.
  - **B4-06:** a fonte pequena foi efeito do compartilhamento no Meet? A escala de fontes não
    muda sem confirmação.
- **Escopo:** uma tarefa nova por resposta positiva, com ID AJ5+.
- **Gate:** —
- **Depende de:** AJ3
- **Status:** DONE

## Rodada 10 — Atendimento por plano (pedido do dono, 06/11/2026)

Serviço vira só cadastro (nome, duração, linha, profissionais e salas) e todo atendimento sai de
um plano; atendimento único (ex.: avaliação) é um **plano avulso** de 1 sessão. Hoje o serviço
ainda tem preço (que gera o plano "<Nome> (avulso)"), agendar não exige plano e o realizado sem
plano não cobra nada.

### Decisões do dono (06/11/2026)

- Serviço fica com nome, profissionais, salas, **duração** (término na agenda) e **linha de
  negócio** (painel de vendas). Sai só o preço.
- Atendimento normal e avaliação **exigem plano com saldo**; sem plano, o agendamento oferece
  vender o plano avulso do serviço e já agenda. Cada tipo de avaliação é um serviço com o seu
  plano avulso.
- **Aula experimental** não exige nem consome plano (sem valor). **Lead só faz experimental**;
  para avaliação, converte em cliente (afeta a EV4).
- O atendimento **guarda o plano** escolhido; o realizado consome exatamente esse plano.

### AP1 — Serviço sem preço

- **Escopo:**
  - Contratos: sai `priceInCents` de `serviceInputSchema`/`Service`/registro; sai
    `planTablePriceSummary` (bloco "Preço de tabela"/"Total avulso" do `PlanTemplateModal`).
  - API: sai `syncServiceSinglePlan` (preço → plano avulso automático) de `POST /services` e da
    edição pelo registro; `GET /services` mantém `singleSessionPriceInCents` (do plano avulso).
  - Migração nova remove `services.price_in_cents` e o seu CHECK. Planos avulsos já criados
    ficam.
  - Web: sai "Preço de tabela" do cadastro de serviço (completo e rápido); o texto orienta que o
    valor fica no plano avulso.
  - Dados demo, seeds e fixtures sem o campo.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### AP2 — Atendimento guarda o plano

- **Escopo:**
  - Migração nova: `appointments.patient_plan_id` (nulo = histórico, lead ou experimental), FK
    para `patient_plans`. `planId` opcional no contrato do atendimento.
  - Realizado com `planId` consome esse plano (sem saldo → `NO_SESSION_BALANCE`); sem `planId`
    mantém a busca atual (histórico e crédito de comanda).
  - `visitType: "trial"` nunca consome sessão (inclusive na finalização automática).
  - Compra de plano com agendamento grava o `planId` nos atendimentos criados.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** AP1
- **Status:** DONE

### AP3 — Agendar exige plano (API)

- **Escopo:**
  - Criar, repetir, editar (troca de cliente/serviço) e remarcar ausência de cliente com
    `visitType` normal/avaliação exigem `planId` de plano do cliente ativo, válido nas datas, que
    cubra o serviço e com saldo para as ocorrências (`PLAN_REQUIRED`, 409). Regra única
    reaproveitando `appointmentPricing`.
  - Lead só agenda `trial`; experimental de cliente não pede plano.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** AP2
- **Status:** DONE

### AP4 — Agendar exige plano (web) e venda do avulso no agendamento

- **Escopo:**
  - Campo "Plano" no agendamento (padrão: o que vence antes, com saldo); some na experimental.
  - Sem plano válido: "Vender plano avulso" reaproveitando a venda de plano, já com o plano
    avulso do serviço, e seleciona o plano novo; sem plano avulso cadastrado, orienta a criar em
    Configurações › Planos.
  - Edição/remarcação mostram o plano; agendamento de lead só oferece aula experimental.
  - Testes web: com plano, vendendo avulso, experimental.
- **Gate:** gate completo
- **Depende de:** AP3
- **Status:** DONE
- **Pendente com o dono:** a EV4 ("Marcar avaliação pelo evento") passa a marcar aula
  experimental ou exige converter o participante antes?

### AP5 — Plano avulso tem uma única sessão

- **Escopo (pedido do dono, 07/11/2026):** plano avulso é uma sessão de um serviço, no modelo e
  na venda.
  - Contratos: modelo (`planTemplateInputSchema`), venda (`patientPlanInputSchema`) e cadastro
    guiado (avulso e avulso adicional) recusam avulso com mais de um serviço ou sessão.
    Modelo antigo com várias sessões segue válido enquanto serviços e tipo não mudam (ativar,
    desativar, renomear); `planPackageSessions` deixa de tratar avulso como pacote.
  - Venda (`PlanForm`, `GuidedPlanFields`): sessões só leitura; avulso sai com 1 sessão pelo
    preço por sessão do modelo (`planTemplateSaleServices`).
  - Configurações › Planos: avulso sem campo "Sessões" nem "Adicionar serviço"; editar avulso
    antigo de várias sessões avisa e salva com uma. Sem migração.
- **Gate:** gate completo
- **Depende de:** AP4
- **Status:** DONE

### AP6 — Venda de plano e fim da venda de serviço nos relatórios

- **Escopo (pedido do dono, 07/11/2026: conferir financeiro e relatórios depois da AP1–AP5):**
  - Produção da equipe (relatório gerencial): aula experimental realizada não entra em sessões
    nem no valor gerado (ela é gratuita); memória e MySQL.
  - Vendas: o plano avulso fica separado dos demais planos. `SaleMovement.planKind: "single"`
    (sem mudar `sourceType`, que o painel de vendas valida), tipo `single` "Planos avulsos" em
    `byType`/`byItem`, no "Já contratou", no histórico do cliente e na planilha.
  - O tipo `service` (e a origem `service_sale` do relatório financeiro) passa a se chamar
    "Serviço(s) (comanda antiga)": só comanda fechada antes de o serviço deixar de ser vendido.
  - Descrição de `/external/v1/sales` atualizada.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** AP5
- **Status:** DONE

### AP7 — Serviço do agendamento só dos planos do cliente

- **Escopo (pedido do dono, 07/11/2026):** no "Novo atendimento" (normal/avaliação), o campo
  "Serviço" mostrava todos os serviços com o preço do avulso, misturando serviço e plano.
  - Contratos: `appointmentPlanServiceIds(planos, data)` — serviços de planos ativos, vigentes
    e com saldo (ou recorrentes), mesma regra do `appointmentPricing`.
  - Web: "Serviço" lista só os serviços dos planos do cliente, sem preço, e a opção "Vender
    plano avulso…" (quem vende planos), que passa a listar todos os serviços com o preço do
    avulso; escolhido o serviço, o campo "Plano" vende o avulso e já o seleciona. Experimental,
    sem cliente e contratação de pacote seguem com a lista completa.
- **Gate:** gate completo
- **Depende de:** AP6
- **Status:** DONE

## Rodada 11 — Entregas da reunião de 07/11/2026

Levantamento completo (o que já existe, passos, riscos e testes) em
`docs/ENTREGAS_2026-11-07.md`; o número entre parênteses é o da entrega lá. Ordem: EN10 → EN1 →
EN3 → EN2 → EN4 → EN7–EN9 → EN11–EN13 → EN5–EN6 → EN14. Painel e histórico de pagamentos com
filtros ficam no `dashboard-studios` (EN11–EN13 têm só a parte da API aqui).

### EN10 — Campo "Outros" na importação (10)

- **Escopo:**
  - Contratos: opção de mapeamento "Outros" (`extra`), permitida em várias colunas, na
    importação de clientes e de participantes; `extraFields` (`{ título: valor }`, até 50
    chaves e 500 caracteres por valor) no cliente e no lead; coluna "Outros" (opcional) na
    exportação de clientes.
  - Migração nova: `extra_fields JSON` em `patients` e `leads`.
  - Gravação mescla sem apagar (`JSON_MERGE_PATCH`/`{...antigo, ...novo}`); reimportação de
    cliente já cadastrado com "Outros" mescla em vez de ignorar (`updated` no resultado); a
    conversão de lead em cliente leva o "Outros".
  - Web: opção no mapeamento (clientes e eventos), "Importar N e atualizar M", seção "Outros"
    na ficha do cliente. Dados demo com "Outros".
  - Exportação de participantes com "Outros" fica na EN2.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### EN1 — Importar participantes: vincular cliente existente e contar ignorados (1)

- **Escopo:** botão "Importar participantes"; procurar cliente por telefone, e-mail ou CPF e
  criar o participante já ligado (`convertedPatientId`); contato já participante do evento é
  ignorado; `EventImportResult` `{ created, linked, skipped, errors }`; memória e MySQL na
  mesma transação.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** EN10
- **Status:** DONE

### EN3 — Marcar quem "virou cliente" no evento (3)

- **Escopo:** ação "Se tornou cliente" no participante, etiqueta "Cliente" no convertido.
- **Decisão do dono (08/11/2026):** "Se tornou cliente" abre o cadastro de cliente normal (o de
  conversão de lead, já preenchido) **na frente** de onde a equipe está, sem sair da tela nem
  fechar o modal aberto (ex.: "Registrar contato"); depois de cadastrado, o participante ganha a
  etiqueta "Cliente". A coluna "Origem: evento/lead" na exportação de clientes foi para a EN3b.
- **Gate:** gate completo
- **Depende de:** EN1
- **Status:** DONE

### EN3b — Coluna "Origem: evento/lead" na exportação de clientes

- **Escopo:** coluna opcional na exportação de clientes (`patient-export.ts`) com a origem do
  cliente convertido de lead ("Evento: <nome>" ou "Lead"), lida pelo `converted_patient_id`
  dos leads (memória e MySQL).
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** EN3
- **Status:** DONE

### EN2 — Exportar participantes do evento (2)

- **Escopo:** `GET /events/:id/participants/export.xlsx` (mesma permissão de ver eventos, filial
  ativa), colunas do documento incluindo "Virou cliente" e "Outros"; botão "Exportar
  participantes".
- **Gate:** gate completo
- **Depende de:** EN1
- **Status:** DONE

### EN4 — Limpeza dos dados de teste (4)

- **Escopo:** `db-cleanup.ts` e `npm run db:cleanup-test-data`: simulação por padrão,
  `--execute --confirm=<nome do estúdio>`, backup antes, uma transação na ordem das FKs.
- **Gate:** gate completo + `npm run test:mysql`
- **Decisão do dono (08–09/11/2026):** apagar todos os dados e deixar só um admin
  (`admin@studios.com`). Feito à mão no banco de produção, pelo phpMyAdmin, com um script SQL
  avulso; o comando `db:cleanup-test-data` saiu do PR a pedido do dono.
- **Status:** DONE

### EN7 — Renomear para "Organiza Estúdios" (7)

- **Escopo:** constante `PRODUCT_NAME` nos pontos listados no documento; selo "Demonstração"
  só no ambiente de demonstração; busca automática pelo nome antigo.
- **Gate:** gate completo
- **Pendente com o dono:** separar o nome do produto do nome do estúdio?
- **Status:** BLOCKED

### EN8 — Logo personalizado no login e favicon (8)

- **Escopo:** `GET /public/branding` (nome e logo), favicon dinâmico, `object-fit` no logo,
  SVG/WebP.
- **Gate:** gate completo
- **Depende de:** EN7
- **Status:** TODO

### EN9 — "Clínica" → "Estúdio" nos textos visíveis (9)

- **Escopo:** só textos visíveis (sem renomear `clinic_id`/`clinics`); chaves de variáveis
  mantidas, rótulo "Nome do estúdio".
- **Gate:** gate completo
- **Pendente com o dono:** manter os termos clínicos do prontuário?
- **Status:** BLOCKED

### EN11 — Modalidade Pilates/Dança nos serviços (11, parte da API)

- **Escopo:** `services.modality`, linha obrigatória no cadastro, filtro `modality` na API
  externa.
- **Gate:** gate completo + `npm run test:mysql`
- **Pendente com o dono:** lista fixa ou categoria cadastrável?
- **Status:** BLOCKED

### EN12 — Botão "Copiar" no histórico de pagamentos (12)

- **Escopo:** `formatPaymentHistoryForWhatsApp` nos contratos; filtros e "Copiar" na aba
  Financeiro da ficha.
- **Gate:** gate completo
- **Pendente com o dono:** "Copiar" na ficha do CRM, no `dashboard-studios` ou nos dois?
- **Status:** BLOCKED

### EN13 — Relatório e backup do dashboard em Excel (13, parte da API)

- **Escopo:** `GET /reports/dashboard-backup.xlsx` com abas Turmas, Calendário e Lista de
  espera (período até 31 dias, filial ativa, valores só com `finance.view`).
- **Gate:** gate completo
- **Pendente com o dono:** como calcular os "horários livres" da aba Calendário? O CRM não guarda expediente nem disponibilidade de profissional.
- **Status:** BLOCKED

### EN5 — Telegram: agenda para a profissional (5)

- **Escopo:** vínculo pela profissional, envio por destinatário, avisos de agendamento,
  `/hoje`, `/semana`, `/mes`.
- **Gate:** gate completo
- **Pendente com o dono:** contato da Ariana e respostas da TG6.
- **Status:** BLOCKED

### EN6 — Melhorias no módulo de eventos (6)

- **Escopo:** excluir evento, serviço do evento (migração `events.service_id`) e filtro,
  status único por participante, busca/filtro e remover participante.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** EN2
- **Status:** DONE

### EN14 — Guia de uso (14)

- **Escopo:** rota `/ajuda` com o guia estático (sumário do documento).
- **Gate:** gate completo
- **Pendente com o dono:** autorizar o guia dentro do sistema (o CLAUDE.md proíbe documentos
  novos sem autorização)?
- **Status:** BLOCKED

## Pedido avulso — Senha visível para o admin (09/11/2026)

### SV1 — Admin consulta a senha atual do usuário

- **Escopo:** cópia cifrada (AES-256-GCM, `v1:`) da senha ao lado do hash bcrypt, gravada em
  todo caminho que troca senha (`POST /admin/users`, `reset-password`, `/me/password`);
  migração `0057_user_password_encrypted.sql`; `POST /admin/users/:id/reveal-password` (só
  admin, mesma clínica, `no-store`, 20/min, auditoria `user.password_viewed` antes da resposta,
  409 sem cópia); modal "Senha de acesso" com "Senha atual" (olho) e "Nova senha".
- **Gate:** gate completo + `npm run test:mysql`
- **Pendente com o dono:** definir `PASSWORD_ENCRYPTION_KEY` no `.env`/`.env.example` e na
  Hostinger (não editados sem autorização).
- **Status:** DONE

## Pedido avulso — Lixeira (10/11/2026)

### Decisões do dono (10/11/2026)

- Lixeira por tópico, dentro da própria tela: Clientes, Comercial (leads), Agenda
  (atendimentos) e Planos (planos do cliente). Modelos de plano, turmas e financeiro ficam fora.
- Duas permissões: `trash.send` (enviar para a lixeira) e `trash.view` (ver a lixeira, restaurar
  e excluir em definitivo). Restaurar devolve o item exatamente como estava.
- Exclusão definitiva apaga junto tudo que está ligado ao item, depois de um aviso grande com a
  contagem por tipo e da confirmação digitando `EXCLUIR`.

### LX1 — Lixeira: permissões, base e telas

- **Escopo:** módulo `trash` com `trash.send` (sem depender de `trash.view`) e `trash.view`,
  ambas só por escolha explícita; migração `0060_trash.sql` (`deleted_at`/`deleted_by_user_id`
  em `patients`, `leads`, `appointments`, `patient_plans`); rotas `/trash/:kind` (enviar, listar,
  impacto, restaurar, excluir de vez), conferindo também a área do tópico; exclusão definitiva
  guiada pelas chaves estrangeiras do banco (ponteiros de origem viram vazios); item na lixeira
  fora das listas, buscas, agenda e checagem de horário; envio recusado para cliente/plano com
  atendimento agendado à frente; restauração confere o horário e o cliente/lead dono; auditoria
  `*.trashed`/`*.restored`/`*.purged`; botões "Excluir" e "Lixeira" nas quatro telas.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### LX2 — Financeiro do cliente na lixeira fora de Relatórios e Financeiro

- **Pedido (10/11/2026):** o financeiro de um cliente na lixeira sai dos relatórios e também da
  tela Financeiro (decisão do dono: os dois iguais); restaurar o cliente devolve tudo.
- **Escopo:** filtro no repositório (memória e MySQL; helper `patientNotTrashed` em
  `storage/mysql/sql.ts`, `withoutTrashedPatients` na memória): vendas e histórico de vendas,
  gerencial (atendimentos, planos ativos, sessões, contas em aberto, receita por serviço),
  dashboard, DRE, caixa/movimentos, contas a receber e totais do mês, comandas do estoque e
  lista de planos sem cliente informado. Comissões e folha continuam como estão.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### LX3 — Botões da lixeira só com ícone e hover vermelho

- **Pedido (11/11/2026):** botão da lixeira mais exposto (fora do menu "Mais"), só o ícone e
  hover vermelho, para "Abrir lixeira" e "Excluir"; quem não tem a permissão não vê o botão.
- **Escopo:** `TrashIconButton` (`features/trash`), CSS `.trash-icon-button` em
  `19-trash.css`; Clientes com o ícone ao lado de "Mais"; "Excluir" vira ícone no detalhe do
  cliente, no lead, no atendimento e no cartão do plano.
- **Gate:** gate completo
- **Status:** DONE

## Pedido avulso — Conversão de lead com o cadastro completo (11/11/2026)

### Decisões do dono (11/11/2026)

- "Converter em cliente" (CRM comercial e "Se tornou cliente" em Eventos) abre o mesmo cadastro
  do "Novo cliente", já preenchido com o lead, com plano recorrente, avulso, aula experimental,
  lista de espera, produtos e descontos.
- Cliente já cadastrado é reconhecido **só pelo CPF** na conversão.

### LC1 — Conversão do lead pelo cadastro completo de cliente

- **Escopo:** `leadId` opcional em `POST /patients/guided` (exige também `crm.convert`): cria o
  cliente, vende o que foi escolhido e converte o lead na mesma transação (lead `won`, atendimentos
  do lead passam para o cliente, etiquetas/interesses/"Outros" do lead entram no cliente). CPF já
  cadastrado → 409 `LEAD_PATIENT_EXISTS`; lead já convertido → 409. `POST /leads/:id/convert`
  reaproveita cliente existente só pelo CPF (antes: telefone, e-mail ou CPF). Web: `PatientModal`
  com `lead` substitui o `LeadConvertModal` (removido) no Comercial e em Eventos; só cadastro com
  CPF já existente cai na conversão simples (reaproveita o cliente).
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

## Pedido avulso — Importar leads por planilha (12/11/2026)

### LI1 — Importar leads por planilha na tela do CRM comercial

- **Pedido (12/11/2026):** importar leads de uma planilha direto na tela de Leads, sem precisar
  de evento. Decisões do dono: origem escolhida no modal (coluna "Origem" vale por linha);
  nenhum campo obrigatório (como no evento); etapa do funil escolhida para todos os leads;
  quem já é cliente (ou lead, ou repete outra linha) é importado como lead aberto, com aviso.
- **Escopo:** contratos `commercial/lead-import.ts` (`relaxedLeadInputSchema` compartilhado
  com o evento, `importMappingSchema`); validador genérico `validateContactImport` em
  `event-import.ts`; `lead-import.ts` + `lead-import-routes.ts` (`POST /leads/import/preview`
  e `POST /leads/import`, `crm.create`); repositório `listContactImportCandidates` e
  `importLeads` (memória e MySQL, transação, etapa aberta obrigatória); botão "Importar leads"
  e `LeadImportModal` no CRM comercial. Sem migração.
- **Gate:** gate completo + `npm run test:mysql`

## Pedido avulso — Novo lead com WhatsApp e cadastro rápido de origem/interesse (12/11/2026)

### LQ1 — WhatsApp à vista e "Cadastrar origem/interesse" por cima do novo lead

- **Pedido (12/11/2026):** no "Novo lead", telefone e WhatsApp lado a lado; botões "Cadastrar
  origem" e "Cadastrar interesse" que abrem um modal por cima do lead (sem fechá-lo) para quem
  tem permissão incluir o item no cadastro.
- **Escopo:** WhatsApp sai de "Mais informações" e vai para o lado do Telefone (`LeadModal`).
  `CatalogEntryModal` (`shared/components`) extraído do editor de `CatalogSection` e reaproveitado
  nos dois lugares. `CatalogSelect` ganha `createLabel`/`onCreate`/`reloadKey`. Botões só para o
  admin (mesma regra de `POST /clinic-catalogs/:kind`); o lead fica `inactive` por baixo e o item
  salvo já vira a origem/interesse escolhida. Sem mudança na API.
- **Gate:** gate completo
- **Status:** DONE

## Pedido avulso — Etiquetas automáticas editáveis (13/11/2026)

### AT1 — Nome e cor das etiquetas automáticas em Configurações › Etiquetas

- **Pedido (13/11/2026):** as etiquetas automáticas ("Pagamento atrasado", "Falta CPF", "CPF
  inválido", "Cadastro incompleto", "Sem e-mail") aparecem numa seção própria de Configurações ›
  Etiquetas; a clínica troca o nome exibido e a cor (mesmo seletor das etiquetas manuais), sem
  mudar a regra.
- **Decisão do dono (13/11/2026):** só nome e cor, com "Restaurar padrão"; sem desligar.
- **Escopo:** o nome padrão segue como identidade da etiqueta (`patient.tags`, filtros, avisos,
  API externa); só a exibição troca. Contratos `automaticPatientTagDefinitions`,
  `resolveAutomaticPatientTags`, `automaticPatientTagDisplay`; migração `0064` (tabela
  `patient_automatic_tags`); repositório `list/update/resetAutomaticPatientTag` (memória e
  MySQL); rotas `GET/PATCH/DELETE /patient-tags/automatic[/:key]`; exportação com o nome
  configurado; web com seção e modal em Configurações e nome/cor configurados na lista, ficha,
  cadastro, agenda e importação.
- **Gate:** gate completo
- **Status:** DONE

## Pedido avulso — Aula experimental (13/11/2026)

- **Origem:** auditoria do sistema de aula experimental (13/11/2026): série recorrente de
  experimentais grátis, nenhum controle de repetida, lead com "avaliação" no contrato e recusada
  na API, card de conversão misturando avaliação e qualquer plano, divergência memória × MySQL e
  corrida no agendamento de lead.
- **Decisões do dono (13/11/2026):** experimental repetida só **avisa** (não bloqueia), mas nunca
  vira série; cliente com plano só faz experimental de serviço **fora** do plano; o card
  "Aulas experimentais" conta só `trial`, e "converteu" = plano não avulso, fora da lixeira,
  criado de 30 dias antes a 30 dias depois da aula, uma vez por pessoa. A experimental segue
  gratuita (B2-06 sem resposta).

### EX1 — Experimental sem série e lead só com experimental

- **Escopo:** `recurringAppointmentInputSchema` recusa `visitType: "trial"`;
  `leadAppointmentInputSchema.visitType` vira `"trial"` (padrão). O repositório ainda grava a
  avaliação de lead anterior à AP3 (`LeadAppointmentRecord`). Remarcação de falta de lead segue
  experimental (memória). Web: no "Novo atendimento", a experimental desmarca e trava "Repetir"
  e não aparece na contratação de pacote nem para quem só repete.
- **Gate:** gate completo
- **Status:** DONE

### EX2 — Experimental de cliente com plano e aviso de repetida

- **Escopo:** `assertAppointmentPlan` recusa experimental (`TRIAL_SERVICE_IN_PLAN`, 409) de
  cliente com plano ativo, não avulso e vigente que cubra o serviço. Repositório
  `listTrialAppointments` (memória e MySQL) e rota `GET /appointments/trials?patientId=|leadId=`
  (`agenda.create`). Web: aviso "Já fez experimental de <serviço> em <data>" no "Novo
  atendimento", no agendamento do lead e na experimental do cadastro vindo de lead.
- **Gate:** gate completo + `npm run test:mysql`
- **Depende de:** EX1
- **Status:** DONE

### EX3 — Card "Aulas experimentais" só com experimentais e conversão real

- **Escopo:** memória e MySQL com a mesma regra: `scheduled` = experimentais não canceladas;
  `completed` = pessoas distintas com experimental realizada; `converted` = clientes distintos
  com plano não avulso, sem `source_appointment_id`, fora da lixeira, criado de 30 dias antes a
  30 dias depois da aula (plano sem filtro de filial). Texto do card em `ClinicIndicators`.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### EX4 — Corrida no agendamento de lead (MySQL)

- **Escopo:** `createLeadAppointment` do MySQL lê o lead com `FOR UPDATE` dentro da mesma
  transação da gravação, para a conversão simultânea não deixar atendimento preso ao lead.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

## Pedido avulso — Correções do relatório de teste (13/11/2026)

- **Origem:** teste manual em produção (13/11/2026, usuário admin, desktop), conferido contra o
  código. Plano: `PLANO_CORRECOES_2026-11-13.md` (enviado pelo dono).
- **Decisões do dono (14/11/2026):** D1 — plano do catálogo do tipo "Plano pacote" é vendido no
  cadastro guiado com `kind: "custom"`, igual à ficha do cliente; D2 — senha continua sem tamanho
  mínimo; D3 — ligação e tentativa sem resposta não contam como "envio" de mensagem.

### RT1 — Plano pacote no cadastro guiado

- **Escopo:** `guidedSubscriptionPlanSchema` aceita `kind: "custom"` (modelo `promotional`, via
  `planTypeKind`); a API grava o plano `custom` pelo mesmo `createPatientPlan` da ficha (memória
  e MySQL). Web: `guidedPlanKinds` aceita `custom`; o seletor "Modelo" só mostra "Personalizado"
  quando o plano já é `custom`.
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### RT3 — Dados faltantes do lead incluem o WhatsApp de emergência

- **Escopo:** `LeadRegistrationData` ganha `emergencyContactWhatsapp`; em
  `leadMissingRegistrationFields`, o item de emergência só some com nome, telefone e WhatsApp
  preenchidos e lista só o que falta ("Contato de emergência (WhatsApp)", "(nome e WhatsApp)",
  "(nome, telefone e WhatsApp)").
- **Gate:** gate completo
- **Status:** DONE

### RV1 — Cadastro do lead com CPF, endereço e contato de emergência

- **Origem:** 2ª rodada de teste (`PLANO_CORRECOES_RODADA2_2026-11-13.md`, item 7.2).
- **Escopo:** `LeadModal` ganha o bloco recolhível "Dados para o cadastro de cliente" (fechado no
  lead novo; aberto na edição quando algum dos campos tem valor): CPF (`CpfInput`, opcional, mas
  válido quando preenchido), endereço (`PatientAddressFields`, extraído de
  `PatientProfileFields` sem mudar o cadastro de cliente) e contato de emergência (nome,
  telefone e WhatsApp). `LeadDetailsModal` mostra "Endereço" e "Contato de emergência" em uma
  linha cada, só quando preenchidos. Com tudo preenchido, a conversão abre direto o formulário.
- **Gate:** gate completo
- **Depende de:** RT3
- **Status:** DONE

### RT2 — Contato do lead: "Sem resposta" e rótulo por canal

- **Escopo:** regra única `isLeadMessageSent` no contrato (envio = `outbound`, canal fora de
  `phone`/`in_person` e `reached !== false`), usada no resumo de envios, no
  `lastMessageSentAt` (memória e MySQL) e na atualização local do cartão. `LeadActivityModal`
  ganha "Conseguiu falar?" no contato realizado ("Não" envia `reached: false`). A linha do tempo
  rotula o realizado por canal: "Ligação realizada", "Atendimento presencial" ou "Mensagem
  enviada".
- **Gate:** gate completo + `npm run test:mysql`
- **Status:** DONE

### RT4 — Campanha para leads: textos e filtro de etiquetas

- **Escopo:** na campanha por filtros, o resumo, a busca, os avisos e o `CampaignFiltersModal`
  usam o substantivo do público ("cliente(s)", "lead(s)", "pessoa(s)"; helper
  `campaignAudienceWords`); com "Só leads", sai o trecho "· N leads". `Choices` ganha
  `emptyHint`: "Etiquetas do lead" vazio mostra "Nenhum lead tem etiqueta ainda.".
- **Gate:** gate completo
- **Status:** DONE

### RT5 — Sacola mostra o tipo do plano

- **Escopo:** no cadastro guiado, `GuidedPlanFields` sobe o `planType` do modelo escolhido
  (`onTemplateChange`) para o `GuidedPlanEntry`; na sacola, o plano com tipo mostra
  `"<rótulo do tipo> · <cobranças>"` (ex.: "Plano pacote · 3 parcelas"); sem tipo, segue "Plano".
- **Gate:** gate completo
- **Depende de:** RT1
- **Status:** DONE

### RT6 — Acabamento de textos e formatos

- **Escopo:** sem ponto duplo no aviso "Já tem aula experimental"; cartão do lead com rótulo
  "Enviada" e `<time>` que não trunca; "Cadastrado em"/"Atualizado em" do lead com hora; botão da
  conversão de lead "Converter e …"; CPF com máscara na ficha e telefone com máscara na lixeira de
  clientes e leads.
- **Gate:** gate completo
- **Depende de:** RT1, RT2, RT5
- **Status:** DONE

### RV3 — Nome da clínica visível no celular

- **Origem:** 2ª rodada de teste (`PLANO_CORRECOES_RODADA2_2026-11-13.md`, item 1.3).
- **Escopo:** só CSS (`11-responsive.css`, bloco até 820px): sai o `display: none` do
  `.clinic-label`; o nome fica em uma linha com reticências (`.topbar-context` com `flex: 1 1 0`
  e `min-width: 0`) e as ações do topo (filial, SOS, sino) não encolhem nem quebram linha.
- **Gate:** gate completo + `npm run test:e2e`
- **Status:** DONE
