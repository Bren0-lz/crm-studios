# Plano — Movimenta CRM, rodada 2: design, agenda, financeiro, relatórios e segmentação

## Objetivo final
As páginas têm espaçamento consistente, sem texto colado nas bordas. A clínica passa a ter
feriados na agenda, atendimento experimental ou de avaliação para leads (com a taxa de
conversão), declaração de comparecimento pela agenda, botão SOS, despesas recorrentes, caixa do
dia, previsão de receitas, exportação da base de clientes, relatórios de retenção, rankings e
faixa etária, e comunicado segmentado na fila de mensagens.

## Definição de pronto (global)
- D01–D05 e T019–T041 `DONE`, cada uma com commit próprio.
- V1–V3 revisadas pelo dono.
- `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`
  retorna 0 na `main`.
- `docs/STATUS_IMPLEMENTACAO.md` e `README.md` descrevem as novas funcionalidades.

## Fora de escopo
- Cadastro completo do cliente (endereço, gênero, responsável, mesclagem de cadastros).
- O que depende de provedor externo: pagamentos, NFSe, envio real de WhatsApp ou e-mail,
  Wellhub/TotalPass.
- Portal ou app do cliente e reativação das telas removidas de propósito (frequência de turmas,
  estoque e comandas).
- Infraestrutura, deploy, CI, segurança e refatorações de arquitetura.
- Dependências npm novas, `git push`, edição de migrações existentes, `.env`, `compose.yaml` e
  `docs/PLANO_*`.

## Rodada 1 (concluída)
T001–T018: Central de relacionamento, aniversários, CREFITO, NPS, histórico do cliente e
importação de clientes. Tudo `DONE`, no GitHub em `78f7106`.

## Decisões do dono para esta rodada
- O atendimento experimental ou de avaliação de um lead é agendado **sem converter** o lead. O
  atendimento fica ligado ao lead e passa para o cliente quando o lead é convertido.
- O comunicado segmentado só **enfileira** mensagens na outbox, que não envia nada de fato.
- A exportação da base de clientes é **só para o owner** e fica registrada na auditoria.
- É preciso cuidado extra com o design das páginas: muitos textos estão sem margem ou fora do
  lugar.

## Auditoria de design (2026-09-29)
A auditoria foi feita no navegador e completada pelo código, porque a extensão caiu três vezes.
- **Causa:** `.panel` não tem padding, e cada filho precisa trazer o próprio espaçamento. Quando
  não traz, o texto fica colado na borda do painel.
- **Gate automático:** `node apps/web/scripts/audit-panels.cjs` falha com código 1 enquanto houver
  filho de `.panel` sem espaçamento lateral. Hoje ele aponta 9 problemas.
- **Confirmados no navegador:**
  - "23 clientes atendidos neste mês." colado na borda (`p.dashboard-sales-context`);
  - rótulo "Situação" colado em Contatos sugeridos (`.filter-group.filter-tags` dentro de
    `.plans-panel`);
  - ícone colado ao texto no botão "Importar" de Clientes (`.secondary-button` não tem
    `inline-flex`/`gap`).
- **A versão de celular (390px) não foi auditada no navegador.** Ela entra na D03, por regra.

---

## Tarefas

Status: `TODO` · `DOING` · `DONE` · `BLOCKED`. Tipo: `auto` (padrão, o loop executa) ou
`manual` (o `/next` para e chama o dono).

Toda tarefa, além do gate próprio, só fica pronta com a suíte completa verde:
`npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`.
A exceção é a D01, que é justamente quem zera o `audit-panels`.
Gates que citam um arquivo de teste falham (exit 1) enquanto o arquivo não existir, então o teste
vem primeiro. A próxima migração livre é a **0031**.

### D01 — Espaçamento dos filhos de painel
- **Escopo:** corrigir os 9 apontamentos de `node apps/web/scripts/audit-panels.cjs` só com CSS em
  `apps/web/src/styles.css`, dando padding ou margem lateral ao elemento ou ao bloco:
  - `p.dashboard-sales-context`, no painel inicial;
  - `.filter-group.filter-tags`, em Contatos sugeridos;
  - `.sales-period` e `.sales-help`, no relatório de vendas;
  - `.dre-lines`;
  - `.profit-rows`, nas duas tabelas de rentabilidade;
  - `.admin-relationship`, a página de prazos e mensagens vista pela recepção e pelo financeiro
    (`p.muted-copy` e `form.clinical-form`).

  O respiro deve ser coerente com o `panel-head` (padding lateral de ~23px). Não mexer no
  `audit-panels.cjs` para esconder apontamentos. Se algum for falso positivo, reportar `BLOCKED`
  com o motivo.
- **Gate:** `node apps/web/scripts/audit-panels.cjs && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** —
- **Status:** DONE

### D02 — Escala de espaçamento e botões com ícone
- **Escopo:** em `apps/web/src/styles.css`:
  - tokens em `:root`: `--space-1`…`--space-8` (4, 8, 12, 16, 24, 32, 48, 64px) e
    `--radius-sm`/`--radius-md`/`--radius-lg` (8, 12, 18px);
  - usar esses tokens nas peças compartilhadas: `.panel-head`, `.list-toolbar`, `.form-grid`,
    `.modal-*`, `.plan-card`, `.plans-grid`, `.status-pill`, `.error-banner`, `.form-error`,
    `.success-banner` e `.empty-state`, sem mudar os valores visuais em mais de ±2px;
  - `.secondary-button` com `display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2)`,
    como o `.primary-button`, para o ícone não grudar no texto;
  - `.page-actions` com os botões alinhados na mesma altura (`align-items: center`);
  - `overflow-wrap: anywhere` em `.plan-card`, nas células de tabela (`.table-row > *`) e em
    `.status-pill`, para texto longo não vazar.

  Só CSS. Sem `style={{}}` novo.
- **Gate:** `node apps/web/scripts/audit-panels.cjs && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D01
- **Status:** DONE

### D03 — Celular: grids de várias colunas
- **Escopo:** acrescentar ao `apps/web/scripts/audit-panels.cjs` uma segunda verificação.
  - Toda regra de `styles.css` com `grid-template-columns` de 2 ou mais colunas fixas (`repeat(N, …)`
    com N ≥ 2, ou uma lista de 2 ou mais trilhas) precisa ter, para o mesmo seletor, uma regra
    dentro de `@media (max-width: …)` com largura ≤ 760px que reduza para 1 coluna ou use
    `auto-fit`/`auto-fill`/`minmax`.
  - Corrigir todos os apontamentos dessa verificação em `styles.css`, com uma regra
    `@media (max-width: 700px)` quando faltar.
  - Os seletores dentro de `@media print` ficam de fora.
  - Nenhuma coluna pode ficar mais estreita que o conteúdo em 390px.
- **Gate:** `node apps/web/scripts/audit-panels.cjs && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D02
- **Status:** DONE

### D04 — Regras de design no processo
- **Escopo:**
  - Acrescentar ao `CLAUDE.md` a seção "Design de páginas", com as regras da D01–D03:
    - conteúdo novo dentro de `PageHeader` + `panel`, com `panel-head` ou bloco com respiro
      lateral;
    - tokens `--space-*`/`--radius-*` em CSS novo, sem px soltos para espaçamento e sem
      `style={{}}`;
    - grid de várias colunas com regra para ≤ 700px;
    - estados de vazio, carregando e erro;
    - valores alinhados à direita em tabelas;
    - reaproveitar as classes existentes.
  - Acrescentar esses itens ao checklist de `.claude/agents/verifier.md`.
- **Gate:** `npm run build && node apps/web/scripts/audit-panels.cjs`
- **Depende de:** D03
- **Status:** DONE

### D05 — Correções da revisão V1
- **Escopo:** corrigir em `apps/web/src/styles.css` os problemas encontrados na revisão visual de
  2026-09-30 (Chrome do notebook, 1536px e iframe de 390px):
  1. **Login: texto sobreposto.** `.story-note span` transforma cada `<span>` num ponto de 7px,
     então "Ambiente de demonstração" e "Dados fictícios" vazam e se sobrepõem. O ponto deve vir
     de um `::before` em cada `span`, e o texto fica legível ao lado.
  2. **Visão geral: painel colado nas métricas.** O painel "Vendas e retorno dos clientes"
     (`.dashboard-sales`) encosta no grid de métricas de cima (`.metric-grid`), sem espaço entre
     os dois. Acrescentar espaçamento coerente com os outros blocos (`--space-5`).
  3. **Cartões encostando na borda do painel.** `.sales-metrics` (no painel inicial e no
     relatório de vendas) e `.sales-details`/`.report-disclosure` dentro de `.sales-report`
     encostam nas bordas esquerda, direita e inferior do painel (distância de 1px). Dar respiro
     lateral e inferior de ~23px, como nos demais filhos de painel.
  4. **Configurações (owner): respiro duplicado.** Em `.admin-grid > .panel`, o `.panel-head`
     recebe o padding de 20px do painel e mais os 23px próprios, e a linha inferior do cabeçalho
     não chega às bordas. O cabeçalho deve ocupar a largura toda do painel, como nos outros
     painéis (margem negativa ou padding do painel aplicado só aos demais filhos).
  5. **Ampliar o `audit-panels.cjs`** para detectar o caso 3: um filho direto de `.panel` que
     tem borda, fundo ou sombra próprios (cartão ou bloco com caixa) e fica a menos de 8px da
     borda do painel, sem regra de espaçamento lateral no CSS. A verificação antiga continua
     idêntica. O script deve apontar o caso 3 antes da correção e passar depois.
- **Gate:** `node apps/web/scripts/audit-panels.cjs && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D04
- **Status:** DONE

### V1 — Revisão visual do design (manual)
- **Tipo:** manual
- **Escopo:** o orquestrador ou o dono abre o app (`npm run dev`) em 1440px e 390px: painel,
  Contatos sugeridos, Clientes, Relatórios e Configurações. Compara com a auditoria e cria tarefas
  de correção se precisar. A revisão só é marcada `DONE` quando o dono aprovar.
- **Gate:** aprovação do dono no chat.
- **Depende de:** D05
- **Status:** DONE

### T019 — Feriados na API
- **Escopo:**
  - Migração nova `holidays` (clinic_id, date, name; única por clínica e data).
  - Contratos `holidayInputSchema` e `Holiday`.
  - Repositório (interface + memória + PostgreSQL): `listHolidays(clinicId, from?, to?)`,
    `createHoliday` e `deleteHoliday`.
  - Rotas `GET /holidays` (todos os perfis), `POST /holidays` e `DELETE /holidays/:id` (só
    `owner`).
  - Criar atendimento, reagendar ou criar série recorrente que caia num feriado (data da clínica)
    dá 409 `HOLIDAY` com o nome do feriado. Na série, nenhuma ocorrência é criada.
  - Testes em `app.test.ts`.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** D04
- **Status:** DONE

### T020 — Feriados na interface
- **Escopo:**
  - Seção "Feriados" em Configurações (owner): listar, criar e excluir.
  - A agenda (dia, semana e mês) marca o feriado com o nome e mostra o erro da API em linguagem
    clara ao tentar agendar nele.
  - Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T019
- **Status:** DONE

### T021 — Tipo de atendimento na API
- **Escopo:**
  - Migração nova: `appointments.visit_type` (`regular`, `trial` ou `evaluation`, padrão
    `regular`).
  - Contrato `visitType` na entrada (opcional, padrão `regular`) e na saída de `Appointment`.
  - Criação, criação recorrente, listagem e reagendamento preservam o tipo nos dois repositórios.
  - `ManagementReport` ganha `appointments.byVisitType`.
  - Testes.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** D04
- **Status:** DONE

### T022 — Atendimento de lead sem conversão na API
- **Escopo:**
  - Migração nova: `appointments.patient_id` aceita nulo, entra `lead_id` (FK para leads) e um
    CHECK garante exatamente um dos dois.
  - Contrato: `Appointment.patientId?`, `leadId?` e `leadName?`.
  - Rota `POST /leads/:id/appointments` (acesso comercial), com o tipo obrigatório `trial` ou
    `evaluation`, profissional, sala, serviço e horário. Conflitos de profissional e sala,
    bloqueios, turmas e feriados valem normalmente.
  - Atendimento de lead **não** consome sessão ao ser finalizado. Prontuário e NPS dão 400/409
    claros.
  - Ele fica **fora** de: sugestões de contato, linha do tempo do cliente, relatório de vendas e
    de retorno, lembretes e comissões.
  - A agenda lista o atendimento com `leadName`.
  - Toda a base de código precisa tratar `patientId` opcional sem `!` indevido.
  - Testes para cada exclusão, nos dois repositórios quando couber.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts src/contact-suggestions.test.ts src/patient-timeline.test.ts`
- **Depende de:** T021
- **Status:** DONE

### T023 — A conversão do lead leva os atendimentos
- **Escopo:** `POST /leads/:id/convert` passa todos os atendimentos do lead para o cliente criado
  ou reaproveitado (`lead_id` → `patient_id`), na mesma transação no PostgreSQL e de forma
  equivalente em memória. A partir daí eles contam para o cliente. Testes.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T022
- **Status:** DONE

### T024 — Experimental e avaliação na interface
- **Escopo:**
  - Selo "Experimental" ou "Avaliação" nos cards e no detalhe da agenda, com o nome do lead
    quando for de lead.
  - Campo "Tipo" no formulário de novo atendimento.
  - Botão "Agendar experimental" no card do lead no CRM, com modal de tipo, serviço, profissional,
    sala e horário.
  - O detalhe do atendimento de lead não mostra ações de cliente (prontuário, NPS, histórico).
  - Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T022, T023
- **Status:** DONE

### T025 — Conversão das experimentais
- **Escopo:**
  - `ManagementReport` ganha `trials`, com os campos `scheduled`, `completed`, `converted` e
    `conversionRate`.
  - Considera os atendimentos `trial`/`evaluation` do período.
  - "Convertido": o cliente (convertido do lead ou que já era cliente) tem um plano criado em até
    30 dias depois da experimental concluída.
  - Cartão "Experimentais" em Relatórios.
  - Testes na API e na web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T023
- **Status:** DONE

### T026 — Declaração de comparecimento pela agenda
- **Escopo:**
  - Migração nova: `issued_documents.appointment_id`, que aceita nulo.
  - `issuedDocumentInputSchema.appointmentId` opcional, que precisa ser atendimento concluído do
    mesmo cliente.
  - Variáveis `{{atendimento_data}}`, `{{atendimento_horario}}` e `{{servico_nome}}`. O
    profissional do atendimento preenche `{{profissional_*}}`.
  - Web: no detalhe de atendimento concluído de cliente, o botão "Declaração de comparecimento"
    abre a escolha do modelo `attendance_declaration`, emite e abre a impressão existente.
  - Testes na API e na web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T022
- **Status:** DONE

### T027 — Botão SOS
- **Escopo:**
  - Botão "SOS" no detalhe do atendimento de cliente e na ficha do cliente.
  - Abre um painel com o contato de emergência (nome, link `tel:` e WhatsApp) e os atalhos
    `tel:190`, `tel:192` e `tel:193`.
  - Sem contato cadastrado, mostra "Contato de emergência não cadastrado" e mantém os atalhos.
  - Só web, com teste.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D04
- **Status:** DONE

### T028 — Despesas fixas recorrentes na API
- **Escopo:**
  - Migração nova `recurring_payables`: descrição, fornecedor, categoria, centro de custo, valor,
    dia do mês de 1 a 28, mês inicial, mês final opcional e ativa.
  - Vínculo único (modelo + competência AAAA-MM) nas contas a pagar geradas.
  - Geração tardia e idempotente das competências até o mês atual, no padrão de
    `renewDuePatientPlans`, disparada ao abrir o financeiro.
  - CRUD com acesso financeiro, nos dois repositórios.
  - Testes: idempotência, recuperação de meses perdidos, pausa e encerramento.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** D04
- **Status:** DONE

### T029 — Despesas fixas recorrentes na interface
- **Escopo:** seção "Despesas fixas" em Financeiro › Contas a pagar, para listar, criar, pausar e
  encerrar. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T028
- **Status:** DONE

### T030 — Caixa do dia na API
- **Escopo:**
  - Função pura `apps/api/src/daily-cash.ts` e rota `GET /finance/daily-cash?date=` (acesso
    financeiro; sem data, vale hoje).
  - Entradas: recebimentos e estornos com sinal. Saídas: contas pagas e comissões pagas.
  - Tudo pela data do evento no fuso da clínica, agrupado por forma de pagamento, com o total de
    entradas, de saídas e o saldo.
  - Testes em `daily-cash.test.ts` e na rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/daily-cash.test.ts src/app.test.ts`
- **Depende de:** D04
- **Status:** DONE

### T031 — Caixa do dia na interface
- **Escopo:** aba "Caixa do dia" em Financeiro, com seletor de data, totais por forma de pagamento
  e a lista de movimentos. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T030
- **Status:** DONE

### T032 — Previsão de receitas na API
- **Escopo:**
  - Função pura `apps/api/src/finance-forecast.ts` e rota `GET /finance/forecast?months=6` (acesso
    financeiro; de 1 a 12 meses).
  - Por mês: parcelas em aberto por vencimento (confirmado), renovações projetadas dos planos com
    renovação automática (`nextPlanPeriod` + divisão das parcelas) e despesas recorrentes
    projetadas.
  - O saldo previsto fica separado entre confirmado e projetado.
  - Testes em `finance-forecast.test.ts` e na rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/finance-forecast.test.ts src/app.test.ts`
- **Depende de:** T028
- **Status:** DONE

### T033 — Previsão de receitas na interface
- **Escopo:** bloco "Previsão" em Financeiro, com uma tabela por mês que distingue confirmado de
  projetado e um seletor de 3, 6 ou 12 meses. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T032
- **Status:** DONE

### T042 — Marca "Studios Aryana" e conta da gestora "Aryana Dutra"
- **Escopo:**
  - O nome do CRM passa a ser "Studios Aryana" em tudo que o usuário vê: logo (`brand`
    aria-label e `brand-name` em `App.tsx`), rótulo da clínica no topo, tela de login, título da
    aba em `apps/web/index.html` ("Studios Aryana — Gestão clínica") e `creator` da planilha de
    vendas (`sales-workbook.ts`).
  - Nome da clínica: "Studios Aryana" (razão social "Studios Aryana Ltda.") no seed
    (`database.ts`), no repositório em memória e nos dados demo que citarem o nome antigo.
  - A conta de gestora (owner) passa a se chamar "Aryana Dutra" no seed e na memória. E-mail
    (`admin@movimenta.local`) e senha **não** mudam.
  - Migração nova `0037_rebrand_studios_aryana.sql` atualizando o nome/razão social da clínica e o
    `full_name` da gestora pelos ids fixos do seed (sem efeito se não existirem).
  - Testes que esperavam "Movimenta"/"Mariana Costa" passam a esperar os nomes novos.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D04
- **Status:** DONE

### T043 — Contratos na API
- **Escopo:**
  - Trazer de volta modelos versionados e documentos emitidos (removidos no commit `756aaaf`;
    restaurar a partir de `git show 756aaaf^:<arquivo>`): schemas e tipos nos contratos, métodos
    na interface `ClinicRepository` e nos dois repositórios, rotas `/document-templates`,
    `/document-templates/:id/versions`, `/documents` e `/documents/:id/status`, variáveis de
    profissional (`professionalId`, nome e CREFITO).
  - **Sem** a declaração de comparecimento: nada de `appointmentId`, `{{atendimento_*}}` ou
    `{{servico_nome}}`.
  - Migração nova `0038_contracts.sql` recriando `document_templates` e `issued_documents`
    (estrutura da 0007 + `professional_id` da 0029, sem `appointment_id`). Migrações antigas
    intactas.
  - Testes de API e de integração PG dos modelos e da emissão; sai o teste "drops the removed
    documents tables".
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T042
- **Status:** DOING

### T044 — Contratos na interface
- **Escopo:** item de menu "Contratos" em `/contratos` com a página de modelos e emissão
  restaurada da antiga `DocumentsPage` (título "Contratos", impressão do documento emitido),
  métodos em `api.ts`, CSS da página e "Contratos" na matriz de permissões da recepção. Sem botão
  de declaração na agenda. Teste web (substitui "no longer offers the documents page").
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T043
- **Status:** TODO

### T034 — Exportação da base de clientes na API
- **Escopo:**
  - `GET /patients/export?format=csv|xlsx` com filtros (situação, etiquetas, aniversariantes do
    mês, com ou sem plano ativo) e `columns` (lista das colunas permitidas).
  - Só `owner`; os outros perfis recebem 403.
  - Cada exportação fica registrada na auditoria administrativa, com filtros e quantidade.
  - O CSV sai em UTF-8 com BOM e separador `;`. O XLSX é gerado com `exceljs`.
  - Testes.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** D04
- **Status:** TODO

### T035 — Exportação da base de clientes na interface
- **Escopo:** botão "Exportar" em Clientes (só owner), com modal de formato e colunas, usando os
  filtros da tela e baixando o arquivo. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T034
- **Status:** TODO

### T045 — Paginação na lista de clientes
- **Escopo:** só web, na página Clientes: 20 clientes por página, botões "Anterior" e "Próxima" e
  o texto "Página X de Y · N clientes"; busca e filtros voltam para a página 1; os controles somem
  quando tudo cabe numa página; funciona também no layout de cartões (≤700px). A exportação
  continua usando todos os clientes filtrados, não só a página. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T035
- **Status:** TODO

### T046 — Modais sem desfoque e sem rolar a página de fundo
- **Escopo:**
  - Remover o desfoque (`backdrop-filter: blur(...)`) do fundo dos modais em `styles.css`; o
    escurecimento continua. A barra superior não é modal e fica como está.
  - Enquanto houver modal aberto, a página de trás não rola: o componente `Modal` trava a
    rolagem do `body` e restaura ao fechar/desmontar, com contador para modais empilhados (só
    libera quando o último fecha). Conferir overlays que não usam `Modal`.
  - Teste web: abrir trava, fechar restaura, dois modais empilhados só liberam no último.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D04
- **Status:** TODO

### V2 — Revisão visual do financeiro (manual)
- **Tipo:** manual
- **Escopo:** revisar em 1440px e 390px a agenda (feriado, experimental, SOS), o CRM
  e o Financeiro (despesas fixas, caixa do dia, previsão). Conferir também a marca "Studios Aryana", a página Contratos, a exportação e a paginação de
  clientes e os modais (sem desfoque, sem rolar o fundo). Criar correções se precisar.
  Pendência herdada da V1: em Relatórios, o texto `.sales-help` encosta na borda inferior do
  painel `.sales-report` (1px) — falta margem inferior.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T020, T024, T025, T026, T027, T029, T031, T033, T042, T044, T035, T045, T046
- **Status:** TODO

### T036 — Retenção e cancelamentos na API
- **Escopo:**
  - Função pura `apps/api/src/retention-report.ts` e rota `GET /reports/retention?from&to` (gestão
    e financeiro).
  - Por mês:
    - **ativos:** atendimento concluído no mês ou plano ativo em algum dia do mês;
    - **novos:** primeiro atendimento concluído ou primeiro plano no mês;
    - **perdidos:** ativos no mês anterior e não ativos no mês;
    - **retenção:** (ativos do mês anterior − perdidos) ÷ ativos do mês anterior;
    - **cancelamentos:** planos cancelados e valor cancelado.
  - Atendimentos de lead ficam de fora.
  - Testes em `retention-report.test.ts` e na rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/retention-report.test.ts src/app.test.ts`
- **Depende de:** V2
- **Status:** TODO

### T037 — Rankings e faixa etária na API
- **Escopo:**
  - Função pura `apps/api/src/client-report.ts` e rota `GET /reports/clients?from&to` (gestão e
    financeiro).
  - Os 20 clientes com mais sessões concluídas e os 20 com mais recebimentos no período.
  - Distribuição dos clientes ativos por faixa etária: 0–17, 18–29, 30–44, 45–59, 60+ e "sem
    data".
  - Testes em `client-report.test.ts` e na rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/client-report.test.ts src/app.test.ts`
- **Depende de:** V2
- **Status:** TODO

### T038 — Retenção, rankings e faixa etária na interface
- **Escopo:** cartões em Relatórios, usando o período filtrado: retenção mês a mês e
  cancelamentos, os dois rankings e a distribuição por faixa etária. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T036, T037
- **Status:** TODO

### T039 — Comunicado segmentado na API
- **Escopo:**
  - `POST /communications/broadcast/preview` e `POST /communications/broadcast` (acesso comercial).
  - Entrada: segmento (etiquetas, situação, com ou sem plano ativo, aniversariantes do mês), canal
    (`whatsapp` ou `email`) e texto com `{{nome}}` (primeiro nome).
  - Respeita o opt-out por canal e pula quem não tem destino.
  - Enfileira mensagens `manual` na outbox, que não envia nada.
  - Devolve quantos foram enfileirados e os pulados com o motivo.
  - Testes.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** V2
- **Status:** TODO

### T040 — Comunicado segmentado na interface
- **Escopo:** em Comunicações, formulário de segmento, canal e texto, prévia com contagem e motivos
  dos pulados, confirmação e aviso de que a fila ainda não envia de fato. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T039
- **Status:** TODO

### V3 — Revisão visual dos relatórios (manual)
- **Tipo:** manual
- **Escopo:** revisar em 1440px e 390px a exportação (Clientes), os relatórios novos e o
  comunicado. Criar correções se precisar.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T035, T038, T040
- **Status:** TODO

### T041 — Documentação da rodada 2
- **Escopo:** novos incrementos em `docs/STATUS_IMPLEMENTACAO.md`: design, feriados, experimental
  de lead, declaração, SOS, despesas fixas, caixa do dia, previsão, exportação, retenção, rankings
  e faixa etária, e comunicado. Atualizar também a lista do `README.md`.
- **Gate:** `npm run build`
- **Depende de:** V3
- **Status:** TODO
