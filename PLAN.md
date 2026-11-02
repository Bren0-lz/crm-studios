# Plano — Studios Aryana CRM

Plano vivo do loop autodev (`/next`, `/loop /next`). Rodadas 1–7 concluídas (o detalhe delas
está no histórico do git, neste arquivo antes do commit "chore: handoff da rodada 8"); rodada 8
em andamento; rodada 9 (CD, cadastro completo) planejada em 02/11/2026.

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

## Rodada 9 — Cadastro completo (reunião de 02/11/2026)

Origem: reunião de 02/11/2026 (itens B1-06, B1-07, B1-08, B1-10). IDs com prefixo `CD`. Cada
tarefa: branch a partir de `origin/main`, gate completo, commit `feat(CDn): …` em pt-BR e PR
`CDn: <título>`. Sem migração nova (etiquetas calculadas na leitura); se precisar, número pela
regra do `CLAUDE.md`. Ordem: CD0 → CD1 → CD2 → CD3 → CD4 → CD5; CD6 já atendido; CD7 BLOCKED.

### Decisões do dono (02/11/2026)

- **B1-07 WhatsApp obrigatório** no cadastro do cliente (a exportação saía sem WhatsApp). Sai a
  dica "Em branco, as mensagens usam o telefone de contato." do `PatientModal`.
- **B1-10 contato de emergência obrigatório** (nome e telefone). Quem não tiver repete o próprio
  nome e telefone, e o sistema aceita. Sem checkbox "sem contato" e sem permissão para dispensar.
- **E-mail continua opcional** até decidir (CD7 BLOCKED).
- **Importação por planilha: nenhum campo é obrigatório.** CPF, telefone, WhatsApp e contato de
  emergência podem faltar; linha sem nome (mas com algum dado) entra como "Cliente sem nome
  (linha N)"; linha totalmente vazia é ignorada. Só o **cadastro normal** (rápido, agenda,
  guiado, edição, conversão de lead, API externa) exige os campos.
- **Etiqueta do que falta:** todo cliente sem algum dado obrigatório mostra etiqueta automática
  ("Falta nome", "Falta CPF", "Falta telefone", "Falta WhatsApp", "Falta contato de emergência").
- **Clientes antigos:** nada é migrado nem apagado. "Editar cliente" exige preencher o que falta
  ao salvar (como já acontece com o CPF); nunca fica impossível (WhatsApp pode repetir o
  telefone; contato pode repetir o próprio cliente). Status, etiquetas, mesclagem, inativação,
  planos e agenda continuam funcionando sem completar o cadastro.
- **B1-06** (constatação): só aviso "Sem WhatsApp" para profissionais, baixa prioridade.

### Onde cada regra vale

| Lugar | WhatsApp | Contato de emergência (nome + tel.) | CPF |
|---|---|---|---|
| `patientInputSchema` (cadastro, guiado, edição) | obrigatório | obrigatório (pode = cliente) | obrigatório (como hoje) |
| Importação (`patientImportInputSchema`, novo) | opcional → etiqueta | opcional → etiqueta | opcional (válido se vier) → etiqueta; nome e telefone também opcionais |
| Mesclagem (`mergedPatientInput`) | tolerante | tolerante | tolerante |
| `PatientModal` novo (botão, agenda, guiado) | `required` + "Falta:" | fora de "Mais informações", `required` | como hoje |
| `PatientModal` edição | exigido ao salvar | exigido ao salvar | como hoje |
| Conversão de lead (`leadConversionInputSchema`, `LeadConvertModal`) | obrigatório (pré-preenche) | obrigatório | como hoje |
| API externa `POST /external/v1/patients` e `/leads/:id/convert` | segue a rota interna | idem | idem |
| Painel de vendas (`dashboard-studios`) | campo novo obrigatório | campos novos obrigatórios | como hoje |
| Etiqueta automática (leitura) | "Falta WhatsApp" | "Falta contato de emergência" (nome **ou** telefone vazio) | "Falta CPF" (+ "Falta nome", "Falta telefone") |
| E-mail | opcional em tudo (CD7) | | |

### Triagem no código (02/11/2026)

- `patientInputSchema` (`contracts/patients/model.ts`) é usado em `POST /patients`,
  `POST /patients/guided`, `PUT /patients/:id` (`modules/patients/routes.ts`), importação
  (`patient-import.ts`), conversão de lead (`commercial/conversion.ts`) e mesclagem
  (`contracts/patients/management.ts`).
- `POST /external/v1/patients` repassa para `/patients` (`external/endpoints.ts`). O painel de
  vendas (`dashboard-studios`: `apps/web/src/components/EnrollDialog.tsx` `NewPatientForm`,
  `apps/bff/src/app.ts` `patientSchema`, mock `apps/bff/src/mock-crm/app.ts`) cadastra com só
  nome, CPF, telefone e e-mail → **quebraria com a CD3**; por isso a CD0 vai antes.
- Um único `PatientModal.tsx` serve cadastro rápido (também `agenda/AppointmentPatientCreateModal`),
  guiado e edição; o contato de emergência fica no `<details>` "Mais informações".
- Etiqueta automática já existe para "Pagamento atrasado" (`contracts/patients/automatic-tags.ts`,
  `api/modules/patients/automatic-tags.ts`, filtro em `PatientsPage.tsx`).
- Importação exige CPF hoje (`patientImportRequiredFields`; teste
  `patient-required-cpf.integration.test.ts`); duplicidade já compara CPF **e** telefone.
- Demo: `demo-patients.ts` sem CPF e sem WhatsApp, contato de emergência só em 1/3; semente MySQL
  (`database.ts`) não grava `whatsapp`; Helena/Lucas/Sônia só com nome e telefone.
- ~96 `POST /patients` em 32 arquivos de teste da API (e mocks web) precisam dos campos novos.

### CD0 — Painel de vendas envia WhatsApp e contato de emergência (repo `dashboard-studios`)

- **Escopo:** `NewPatientForm` com WhatsApp, Nome e Telefone do contato de emergência
  obrigatórios e dica "Sem contato? Repita o nome e o telefone do cliente."; `patientSchema` do
  BFF com os 3 campos; mock-crm valida igual. Testes BFF (400 sem cada campo; 201 com contato =
  próprio cliente) e web (formulário).
- **Gate:** `npm run check` (no `dashboard-studios`); PR com base `main`. Precisa estar em
  produção antes da CD3 (os campos a mais já são aceitos pelo CRM atual).
- **Depende de:** —
- **Status:** TODO

### CD1 — Dados demo completos

- **Escopo:** `demo-patients.ts` com CPF válido gerado (dígitos verificadores), WhatsApp (maioria
  = telefone, alguns diferentes) e contato de emergência em todos, **exceto 3 clientes fixos** de
  propósito (um sem CPF, um sem WhatsApp, um sem contato) para demonstrar as etiquetas.
  Helena/Lucas/Sônia completos em `storage/memory/context.ts` e `database.ts`; semente MySQL grava
  `cpf` e `whatsapp`. Conferir `demo-scenarios.ts`/`seed-demo-scenarios.ts`. Teste unitário:
  CPFs válidos e únicos; só os 3 fixos incompletos.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** —
- **Status:** TODO

### CD2 — Etiquetas automáticas de cadastro incompleto

- **Escopo:** contracts: "Falta nome", "Falta CPF", "Falta telefone", "Falta WhatsApp", "Falta
  contato de emergência" em `automaticPatientTagNames`, `missingPatientDataTags(patient)` ("Falta
  nome" via helper novo `isPlaceholderPatientName` para "Cliente sem nome (linha N)"; "Falta
  telefone" com `phone` vazio) e categoria por etiqueta (`status` para estas; atraso segue
  `financial`). API: `automaticPatientTagger` acrescenta para todo
  usuário com o módulo de clientes (atraso continua só com Financeiro); recusa etiqueta manual com
  esses nomes. Web: opções automáticas no filtro de `PatientsPage`; filtro e exportação
  reconhecem as novas. Testes contracts (contato pela metade conta como faltando), API (lista,
  ficha, filtro, exportação; não grava) e web (filtro).
- **Gate:** gate completo
- **Depende de:** CD1
- **Status:** TODO

### CD3 — WhatsApp e contato de emergência obrigatórios no cadastro e na edição

- **Escopo:** contracts: `whatsapp`, `emergencyContactName`, `emergencyContactPhone` obrigatórios
  em `patientInputSchema` (mensagens pt-BR), **sem** regra contra contato = próprio cliente; `fullName` recusa o nome provisório da
  importação ("Informe o nome do cliente.");
  schema tolerante para `mergedPatientInput`; `leadConversionInputSchema` exige os campos
  (pré-preenchidos do lead/cliente). Web: no `PatientModal`, fieldset do contato de emergência
  logo após "Contato", campos `required`, "Falta:" com WhatsApp/Contato/Telefone de emergência,
  dica do telefone removida, dica "Sem contato? Repita o nome e o telefone do cliente.";
  `LeadConvertModal` idem. Descrição em `external/endpoints.ts`. Fixture `validPatientContact` em
  `test-support` para os testes existentes (sem afrouxar asserções). Testes novos: API (400 sem
  cada campo em `/patients`, `/patients/guided`, `PUT`, conversão de lead,
  `/external/v1/patients`; 201 com contato = cliente; antigo: PUT sem → 400, com → 200; mesclar
  dois antigos funciona), contracts e web (rápido, agenda, guiado, edição de antigo).
- **Gate:** gate completo
- **Depende de:** CD0 em produção, CD2
- **Status:** TODO

### CD4 — Importação sem campos obrigatórios, com etiquetas

- **Escopo:** `patientImportRequiredFields = []` (o mapeamento não marca nada como obrigatório);
  schema `patientImportInputSchema` com tudo opcional; valor preenchido continua validado (CPF
  inválido, telefone ou e-mail mal formado = erro da linha, como hoje). Sem nome e com algum dado:
  `fullName = "Cliente sem nome (linha N)"` (helper de contracts). Linha sem nenhum dado:
  ignorada. Sem telefone: `phone = ""` (coluna `NOT NULL`, sem migração; conferir telas e links
  que usam o telefone). Prévia avisa por linha ("Sem CPF, WhatsApp: entra com as etiquetas Falta
  CPF, Falta WhatsApp") sem virar erro. Duplicidade por CPF e telefone quando existirem; sem os
  dois não há como detectar (aviso na prévia). Reescrever a parte de importação de
  `patient-required-cpf.integration.test.ts` e `patient-import.unit.test.ts`: só nome; só
  telefone (nome provisório); tudo vazio (ignorada); CPF inválido (erro); DDD separado continua
  importando. `importPatients` MySQL com `cpf` nulo e `phone` vazio.
- **Gate:** gate completo e `npm run test:mysql`
- **Depende de:** CD3
- **Status:** TODO

### CD5 — Aviso "Sem WhatsApp" em usuários/profissionais (B1-06, baixa prioridade)

- **Escopo:** `settings/AdminUsersContent.tsx`: `status-pill` "Sem WhatsApp" para usuário ligado
  a profissional (`professionalId`) sem `whatsapp`. Só aviso. Teste web.
- **Gate:** gate completo
- **Depende de:** —
- **Status:** TODO

### CD6 — B1-08 DDD em coluna separada na exportação

- **Escopo:** já atendido no commit `5a60f11`: `modules/patients/patient-export.ts`
  (`phoneExportColumns`, "DDD (WhatsApp)" etc.) e `modules/reports/report-workbooks.ts` (consulta
  de clientes em Excel). Testes: `crm-api-patients.integration.test.ts` (cabeçalho com
  "DDD (Telefone);Telefone;DDD (WhatsApp);WhatsApp…") e `report-workbooks.unit.test.ts`
  ("separa DDD e número e converte datas e taxas"). `PatientExportModal.tsx` só escolhe colunas.
- **Status:** DONE

### CD7 — E-mail obrigatório?

- **Pergunta ao dono:** na reunião ficou "tem que ser obrigatório" × "tem gente que não tem". Se
  obrigatório: o que fazer com quem não tem e-mail (etiqueta "Falta e-mail"? importação aceita?).
  Nada muda até decidir.
- **Status:** BLOCKED

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
