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
- **Status:** DONE

### T044 — Contratos na interface

- **Escopo:** item de menu "Contratos" em `/contratos` com a página de modelos e emissão
  restaurada da antiga `DocumentsPage` (título "Contratos", impressão do documento emitido),
  métodos em `api.ts`, CSS da página e "Contratos" na matriz de permissões da recepção. Sem botão
  de declaração na agenda. Teste web (substitui "no longer offers the documents page").
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T043
- **Status:** DONE

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
- **Status:** DONE

### T035 — Exportação da base de clientes na interface

- **Escopo:** botão "Exportar" em Clientes (só owner), com modal de formato e colunas, usando os
  filtros da tela e baixando o arquivo. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T034
- **Status:** DONE

### T045 — Paginação na lista de clientes

- **Escopo:** só web, na página Clientes: 20 clientes por página, botões "Anterior" e "Próxima" e
  o texto "Página X de Y · N clientes"; busca e filtros voltam para a página 1; os controles somem
  quando tudo cabe numa página; funciona também no layout de cartões (≤700px). A exportação
  continua usando todos os clientes filtrados, não só a página. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T035
- **Status:** DONE

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
- **Status:** DONE

### V2 — Revisão visual do financeiro (manual)

- **Tipo:** manual
- **Escopo:** revisar em 1440px e 390px a agenda (feriado, experimental, SOS), o CRM
  e o Financeiro (despesas fixas, caixa do dia, previsão). Conferir também a marca "Studios Aryana", a página Contratos, a exportação e a paginação de
  clientes e os modais (sem desfoque, sem rolar o fundo). Criar correções se precisar.
  Pendência herdada da V1: em Relatórios, o texto `.sales-help` encosta na borda inferior do
  painel `.sales-report` (1px) — falta margem inferior.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T020, T024, T025, T026, T027, T029, T031, T033, T042, T044, T035, T045, T046
- **Status:** DONE

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
- **Status:** DONE

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
- **Status:** DONE

### T038 — Retenção, rankings e faixa etária na interface

- **Escopo:** cartões em Relatórios, usando o período filtrado: retenção mês a mês e
  cancelamentos, os dois rankings e a distribuição por faixa etária. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T036, T037
- **Status:** DONE

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
- **Status:** DONE

### T040 — Comunicado segmentado na interface

- **Escopo:** em Comunicações, formulário de segmento, canal e texto, prévia com contagem e motivos
  dos pulados, confirmação e aviso de que a fila ainda não envia de fato. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T039
- **Status:** DONE

### V3 — Revisão visual dos relatórios (manual)

- **Tipo:** manual
- **Escopo:** revisar em 1440px e 390px a exportação (Clientes), os relatórios novos e o
  comunicado. Criar correções se precisar.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T035, T038, T040
- **Status:** DONE

### T041 — Documentação da rodada 2

- **Escopo:** novos incrementos em `docs/STATUS_IMPLEMENTACAO.md`: design, feriados, experimental
  de lead, declaração, SOS, despesas fixas, caixa do dia, previsão, exportação, retenção, rankings
  e faixa etária, e comunicado. Atualizar também a lista do `README.md`.
- **Gate:** `npm run build`
- **Depende de:** V3
- **Status:** DONE

## Rodada 4 — Usuários, permissões e comissão (pedido do dono, 03/10/2026)

Decisões do dono:

- **Permissões:** o perfil (owner, reception, physiotherapist, finance) continua sendo o ponto de
  partida; a gestora liga/desliga módulos por usuário e a API passa a respeitar isso.
- **Função:** cargo em texto livre (ex.: "Instrutora de Pilates"), só informativo — não dá acesso.
- **Comissão:** percentual por usuário sobre **atendimentos concluídos** (regra atual). O usuário é
  ligado ao cadastro de profissional da agenda (`professionals.user_id`, que já existe) e o
  percentual reaproveita `commission_rules`.
- Entra **depois** da V3 e da T041.

Regras gerais da rodada:

- Módulos (chaves estáveis): `agenda`, `groups` (Turmas), `patients` (Clientes), `plans`, `crm`,
  `relationship` (Contatos sugeridos), `communications`, `contracts`, `clinical` (Prontuários),
  `finance`, `reports`, `settings`. "Visão geral" é sempre visível; "Administração" (usuários,
  feriados, prazos) é sempre só da gestora (owner) e não é um módulo configurável.
- Usuário sem ajuste (`modules` nulo) usa o padrão do perfil. O padrão de cada perfil reproduz
  **exatamente** o acesso de hoje (menu em `App.tsx` e guardas `require*Access` em `app.ts`).
- Owner tem sempre todos os módulos (não editável) — evita a gestora se trancar para fora.

### T047 — Cargo e módulos por usuário na API

- **Escopo:**
  - Migração nova `0039_user_permissions.sql`: `users.job_title text NULL` e `users.modules text[] NULL`.
  - Contratos: `appModuleSchema` (enum acima), `appModuleLabels` (pt-BR), `roleDefaultModules`
    (padrão por perfil = acesso de hoje) e helper puro `effectiveModules(role, modules?)` (owner →
    todos; nulo → padrão do perfil; senão a lista, sem duplicatas e na ordem do enum).
  - `adminUserInputSchema`/`adminUserUpdateSchema` ganham `jobTitle` (opcional, até 80) e
    `modules` (opcional; `null` = voltar ao padrão do perfil). `AdminUser` e `UserSummary` ganham
    `jobTitle?` e `modules` (efetivos). Login e `/me` (ou equivalente) devolvem `modules` efetivos.
  - Dois repositórios + auditoria `users.permissions_updated` quando módulos mudarem.
  - `GET /admin/permission-matrix` passa a sair de `roleDefaultModules` (rótulos pt-BR).
  - Testes: `effectiveModules` em contracts.test.ts; rotas de criar/editar usuário com cargo e
    módulos em app.test.ts; teste PG opt-in.
- **Gate:** `npm exec -w @crm/contracts -- vitest run src/contracts.test.ts` e
  `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T041
- **Status:** DONE

### T048 — Níveis "ver" e "editar" por módulo na API (dados)

Decisão do dono (03/10/2026): cada módulo tem dois níveis, **ver** e **editar**. O padrão de cada
perfil reproduz o acesso de hoje — ex.: a fisioterapeuta **vê** Clientes e Planos, mas não edita.

- **Escopo:**
  - Migração nova `0040_user_edit_modules.sql`: `users.edit_modules text[] NULL` (sem CHECK).
  - Contratos: `roleDefaultEditModules` (padrão por perfil = **gravações que a API permite hoje**,
    derivado das guardas `require*Access` de `app.ts` — ver divergências da T047 no diário) e
    helper puro `effectiveEditModules(role, modules?, editModules?)`: owner → todos; nulo → padrão
    do perfil; o resultado é sempre **subconjunto** dos módulos efetivos de visualização (editar
    implica ver; editar sem ver é descartado), sem duplicatas e na ordem do enum.
  - `adminUserInputSchema`/`adminUserUpdateSchema` ganham `editModules` (mesma semântica de
    `modules`: ausente = mantém, `null` = padrão, lista = ajuste). `AdminUser`, `UserSummary` e
    `AuthenticatedUser` ganham `editModules` (efetivos); `customModules` fica `true` se qualquer um
    dos dois ajustes estiver gravado. Login e `/me` devolvem `editModules`.
  - Dois repositórios, auditoria `users.permissions_updated` com `{modules, editModules, custom}`.
  - `GET /admin/permission-matrix` mostra, por perfil, o que vê e o que edita (rótulos pt-BR).
  - NÃO troca as guardas ainda (é a T053).
  - Testes: `effectiveEditModules` em contracts.test.ts (inclui "editar sem ver é descartado" e
    fisioterapeuta sem edição de `patients`/`plans`); rotas de usuário em app.test.ts; PG opt-in.
- **Gate:** `npm exec -w @crm/contracts -- vitest run src/contracts.test.ts` e
  `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T047
- **Status:** DONE

### T053 — A API respeita os módulos e níveis de cada usuário

- **Escopo:**
  - Trocar as guardas por perfil (`requireClinicalAccess`, `requireCommercialAccess`,
    `requireFinanceAccess`, `requireManagementAccess`, `requireGroupAccess`,
    `requireSatisfactionAccess`…) por `requireModule(module, "view" | "edit")`, lendo módulos e
    níveis efetivos do usuário **no banco a cada requisição** (mudança vale sem novo login; usuário
    desativado → 401). `requireOwnerAccess` continua para Administração.
  - Leituras exigem "ver"; gravações exigem "editar". Rotas que hoje só pedem login (agenda,
    visão geral, cadastros de apoio como `/professionals`, `/rooms`, `/services`, `/holidays`)
    continuam assim nas leituras; mapear as gravações. Mapa rota → módulo/nível numa constante única.
  - Testes: todos os testes de 403 existentes continuam passando com os padrões; novos testes:
    recepção **com** `finance` acessa `/finance/*`; usuário sem `patients` recebe 403 em `/patients`;
    fisioterapeuta padrão lê `/patients` e recebe 403 ao criar cliente; fisioterapeuta com edição de
    `patients` liberada consegue criar.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T048
- **Status:** DONE

### T049 — Usuários com cargo e permissões na interface

- **Escopo:**
  - Em Configurações › Usuários (só owner): formulário de criar/editar com Cargo e uma tabela de
    módulos com duas colunas de `checkbox-field`, **Ver** e **Editar**, já marcada com o padrão do
    perfil (marcar Editar marca Ver; desmarcar Ver desmarca Editar); trocar o perfil sugere o novo
    padrão; botão "Restaurar padrão do perfil" (envia `modules: null, editModules: null`). Owner
    mostra "Acesso total" sem checkboxes. Lista de usuários mostra cargo e o selo "Permissões
    personalizadas" (`customModules`).
  - O menu lateral e as rotas da web passam a usar os `modules` do usuário logado (não mais
    `roles` fixos); botões de criar/editar/excluir somem (ou ficam desabilitados com explicação)
    quando o módulo não está em `editModules`. Tratar `UserSummary` antigo do localStorage sem
    `modules`/`editModules` (forçar novo login ou buscar `/me`).
  - A matriz de permissões vira referência do padrão de cada perfil.
  - Usar `Modal` (não `window.prompt/confirm`) nos fluxos tocados. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T053
- **Status:** DONE

### T050 — Comissão por usuário na API

- **Escopo:**
  - `AdminUser` ganha `professionalId?`, `professionalName?` e `commissionPercentage?` (regra
    vigente hoje) e `commissionEffectiveFrom?`.
  - `PUT /admin/users/:id/professional` {professionalId | null}: liga/desliga o usuário a um
    profissional da agenda (`professionals.user_id`); 404 PROFESSIONAL_NOT_FOUND; 409
    PROFESSIONAL_ALREADY_LINKED se o profissional já for de outro usuário.
  - `PUT /admin/users/:id/commission` {percentage 0–100, effectiveFrom}: cria nova regra em
    `commission_rules` para o profissional ligado (mesma lógica de `/finance/commission-rules`);
    409 USER_NOT_PROFESSIONAL se não houver profissional ligado. Só owner.
  - A geração de comissões não muda (continua por profissional e regra vigente).
  - Sem migração (coluna `user_id` já existe); se precisar de índice único parcial em
    `professionals(clinic_id, user_id)`, migração nova 0040.
  - Dois repositórios, auditoria e testes (rota + PG opt-in).
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T047
- **Status:** DONE

### T051 — Comissão por usuário na interface

- **Escopo:** no formulário de usuário (só owner), seção "Comissão": profissional da agenda
  ligado (seleção dos profissionais livres + "Nenhum"), percentual e "Vale a partir de"; lista de
  usuários mostra o percentual vigente. Sem profissional ligado, o percentual fica desabilitado
  com explicação. Estados de carregando/erro. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T049, T050
- **Status:** DONE

### V4 — Revisão de usuários e permissões (manual)

- **Tipo:** manual
- **Escopo:** em 1440px e 390px, criar usuário com cargo, personalizar módulos, entrar com ele e
  conferir menu e bloqueios; ligar a um profissional e definir comissão; gerar comissões no
  Financeiro e conferir o percentual.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T049, T051
- **Status:** DONE

### T052 — Documentação da rodada 4

- **Escopo:** incremento novo em `docs/STATUS_IMPLEMENTACAO.md` (cargo, permissões por usuário,
  comissão por usuário) e item no `README.md`.
- **Gate:** `npm run build`
- **Depende de:** V4
- **Status:** DONE

## Rodada 5 — Estética e usabilidade (pedido do dono, 04/10/2026)

Pedido: "melhorar a estética do site, o visual dos botões, os textos soltos e a usabilidade em geral;
tudo tem que ser bem intuitivo e fácil". Varredura feita no Chrome (cópia local, 1440px, todas as 13
telas). Achados que viram tarefas:

- **Texto pequeno demais:** `styles.css` tem 69 regras com 8–10px e 47 com 11px; na tela medida,
  39 textos de 10–11px (rótulos, abas, botões de linha, selos, legendas).
- **Botões sem padrão:** "Redefinir senha" com estilo nativo do navegador (Configurações);
  "Dar parabéns" sublinhado e maior que "Marcar como enviado", com uma linha solta em cima (Visão
  geral e Aniversários); botões primários de largura total em verde apagado que parecem desabilitados
  (Comunicações "Adicionar à fila", Contratos "Criar rascunho"); "Gerar lembretes" e "Criar modelo"
  brancos ao lado de primários verdes; "Cancelar" de plano como texto vermelho solto; "Registrar
  contato" minúsculo ao lado do "WhatsApp"; botões "Recibo" e "Estornar" com cerca de 9px.
- **Layout quebrado:** Financeiro › Parcelas — linha com metade esquerda vazia, um quadrado cinza
  solto, nome espremido em 3 linhas e os botões caídos abaixo; abas do Financeiro espremidas
  ("Contas a receber (120)" quebra em 2 linhas); cartão "Compromissos em aberto" sozinho numa 2ª
  linha.
- **Elementos soltos:** "Matricular cliente" flutuando fora de painel (Turmas); 9 botões de ação
  num bloco que quebra linha (Prontuários › Acompanhamento); colunas do CRM vazias sem orientação.
- **Fluxos antigos:** `window.prompt`/`confirm` ainda em CRM (mover etapa, converter), Financeiro
  (ajustes) e Agenda (cancelar bloqueio); Enter na seção de comissão envia o formulário errado.
- **Permissões personalizadas:** Contatos sugeridos sem Configurações dá erro (GET
  /relationship/settings exige ver Configurações); telas que carregam `/patients` dão erro para quem
  não vê Clientes.

Regras gerais da rodada:

- Só visual e usabilidade: nenhuma regra de negócio muda (exceto o acesso de leitura da D11).
- Reaproveitar classes; tokens de espaçamento e raio; nada de `style={{}}`; celular ≤700px.
- Os testes web existentes continuam passando; testes que dependem de texto exato só mudam se o
  texto mudar de propósito (explicar no relatório).

### D06 — Escala tipográfica legível

- **Escopo:**
  - Tokens novos em `:root`: `--text-xs` 12px, `--text-sm` 13px, `--text-md` 14px, `--text-lg`
    16px, `--text-xl` 18px, `--text-2xl` 22px, `--text-3xl` 30px, `--text-4xl` 42px (ajustar se
    necessário e documentar).
  - Nenhum texto abaixo de 12px; texto corrido e campos de formulário em 14px; rótulos e legendas
    em 12–13px. Trocar todos os `font-size` em px de `styles.css` pelos tokens.
  - Ampliar `apps/web/scripts/audit-panels.cjs` (autorizado nesta tarefa) com uma 4ª checagem:
    reprova `font-size` abaixo de 12px e `font-size` em px fora dos tokens (exceto dentro de
    `:root`). Documentar a regra no `CLAUDE.md` › "Design de páginas" (autorizado).
- **Gate:** `node apps/web/scripts/audit-panels.cjs` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T052
- **Status:** DONE

### D07 — Botões padronizados

- **Escopo:**
  - Variantes únicas: `primary-button`, `secondary-button`, `text-button`, `danger-button` (nova,
    para ações destrutivas: cancelar plano, estornar, desativar, encerrar) e tamanho compacto
    `button-sm` para ações de linha e de cartão (mínimo `--text-sm`, altura de pelo menos 32px).
    Estado `:disabled` claro (opacidade e cursor), sem parecer "carregando".
  - Todo `<button>` e todo link com cara de botão em `App.tsx` usa uma dessas classes (corrigir
    "Redefinir senha", "Dar parabéns", "Recibo", "Estornar", "Registrar contato", "Cancelar" do
    plano, "Gerar lembretes", "Criar modelo", "Adicionar à fila", "Criar rascunho"…). Primários de
    largura total viram tamanho normal alinhado à direita em `modal-actions` ou no rodapé do
    formulário.
  - Remover a linha solta acima dos botões de aniversário.
  - Ampliar o `audit-panels.cjs` (autorizado): reprova `<button` em App.tsx sem `className`
    (exceto componentes que recebem a classe por prop — listar as exceções numa constante).
  - Teste web que renderiza Configurações, Visão geral e Planos e confere que não há `button` sem
    classe.
- **Gate:** `node apps/web/scripts/audit-panels.cjs` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D06
- **Status:** DONE

### D08 — Revisão extensa do Financeiro: estrutura e Contas a receber

Pedido do dono (04/10/2026): "revisão extensa na aba Financeiro — textos pequenos demais, um campo
de marcar GIGANTE e informações muito confusas".

- **Escopo:**
  - **Caixa de marcar gigante:** identificar o quadrado cinza das linhas (seleção para baixa em
    lote?). Se tiver uso, vira uma caixa de seleção de tamanho normal (≈18px), alinhada à esquerda
    da linha, com rótulo acessível ("Selecionar parcela de <cliente>"), uma opção "Selecionar todas"
    e uma barra de ação que aparece só com itens marcados ("2 parcelas selecionadas · Dar baixa");
    se não tiver uso, sai.
  - **Linhas de Parcelas legíveis:** cliente e plano à esquerda (nome numa linha só, com
    reticências), vencimento, valor alinhado à direita, situação (selo com cor e texto: Paga, Em
    aberto, Vencida há N dias) e ações (`button-sm`) na mesma linha; no celular a linha vira cartão.
    Ações explicadas por texto claro ("Dar baixa", "Recibo", "Estornar"), com destrutivas em
    `danger-button`.
  - **Topo da página:** cartões de resumo em grade de 4 (2 no celular) com rótulo e uma frase curta
    do que cada número significa ("Saldo do mês = recebido − despesas pagas"); ações do cabeçalho
    ("+ Categoria", "+ Centro de custo") num menu "Cadastros" ou como secundárias com ícone.
  - **Abas:** legíveis numa linha, sem quebrar rótulo, com contagem num selo; rolagem horizontal no
    celular. O seletor "Forma usada na baixa" sai do topo e passa a ser escolhido no momento da
    baixa (modal da baixa), com rótulo claro.
  - **Filtros de Contas a receber:** por situação (Em aberto, Vencidas, Pagas) e busca por cliente,
    com estado vazio que diga o próximo passo.
  - Teste web cobrindo: linha de parcela (nome, valor, situação e ações), seleção e barra de ação
    (se mantida), filtro por situação.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D07
- **Status:** DONE

### D12 — Revisão extensa do Financeiro: demais abas

- **Escopo:** aplicar o mesmo padrão da D08 às abas **Contas a pagar** (inclui despesas fixas),
  **Comissões**, **Caixa do dia** e **Previsão**:
  - textos e títulos que expliquem o que a tela mostra (uma frase curta por seção), rótulos
    completos em vez de abreviações, valores alinhados à direita com sinal e cor consistentes
    (entrada verde, saída vermelha), datas no formato do sistema;
  - linhas no mesmo formato da D08 (sem caixas gigantes, ações compactas e claras);
  - Previsão: tabela legível no celular (rolagem com primeira coluna fixa) e legenda do que é
    "Confirmado" e "Projetado";
  - Caixa do dia: resumo de entradas, saídas e saldo no topo, movimentos agrupados por forma de
    pagamento com totais;
  - estados de vazio com próximo passo em todas as abas.
  - Testes web para as abas alteradas (textos explicativos presentes, valores alinhados por classe,
    vazio).
  - Contas a receber: limpar a seleção de parcelas depois de baixa, estorno ou ajuste (hoje uma parcela quitada continua marcada e iria junto no "Renegociar"); teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D08
- **Status:** DONE

### D09 — Telas sem elementos soltos

- **Escopo:**
  - Turmas: "Matricular cliente" vai para o cabeçalho da página (secundário) ou para dentro do
    painel da turma.
  - Prontuários › Acompanhamento: ações agrupadas — as principais visíveis (Nova avaliação, Nova
    medição, Adicionar adendo) e as demais num menu "Mais ações" acessível por teclado; Imprimir e
    Exportar juntos à direita.
  - Configurações › Usuários: linha do usuário com nome, cargo e e-mail e ações compactas
    alinhadas.
  - CRM: coluna vazia mostra um texto curto de orientação e o botão "Novo lead" fica evidente
    quando não há leads.
  - Agenda: seletor de situação do atendimento e legenda de profissionais legíveis (pelo menos
    `--text-sm`).
  - Teste web para o menu "Mais ações" e para o CRM vazio.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D07
- **Status:** DONE

### D10 — Fim das janelas do navegador: um modal próprio para cada ação

Pedido do dono (04/10/2026): "parar de usar esses forms do JS (prompt/confirm), é feio e nada
profissional; criar modais personalizados para cada opção".

- **Escopo:**
  - Trocar **todas** as janelas nativas (`window.prompt`, `window.confirm`, `window.alert`) de
    `apps/web/src/App.tsx` por um `Modal` próprio para cada ação, com título, frase explicando o
    efeito, os campos certos para o dado pedido e botões "Confirmar"/"Voltar" (ações destrutivas
    com `danger-button`). Levantamento atual (14 ocorrências):
    - CRM: motivo da perda do lead (campo de texto obrigatório); converter lead em cliente
      (confirmação mostrando o nome e o que acontece);
    - Planos: cancelar plano (confirmação com o efeito no saldo/parcelas);
    - Financeiro: ajustar valor de parcela (campo monetário em R$ com o valor atual); nova
      categoria de despesa e novo centro de custo (formulário com nome); renegociar parcelas (um
      formulário só com valor em R$, número de parcelas, primeira data em seletor de data e motivo —
      hoje são 4 prompts seguidos); nova regra de comissão (percentual e vigência);
    - Prontuários: finalizar evolução (confirmação explicando que não poderá mais ser editada);
    - Agenda: cancelar bloqueio (confirmação com o motivo e o horário);
    - Configurações: excluir feriado (confirmação com nome e data);
    - qualquer outra que aparecer na varredura.
  - Campos com validação em português (`form-error`), foco no primeiro campo ao abrir, Esc fecha,
    Enter confirma.
  - Enter na seção de comissão salva a comissão, não o formulário principal.
  - Revisar os textos dos botões e títulos tocados para verbos claros e consistentes ("Salvar",
    "Confirmar", "Voltar") e mensagens de vazio com o próximo passo.
  - Ampliar o `audit-panels.cjs` (autorizado nesta tarefa): reprova qualquer `window.prompt`,
    `window.confirm`, `window.alert` ou `prompt(`/`confirm(`/`alert(` globais em `apps/web/src`.
  - Teste web para cada modal novo (abre, valida, envia o corpo certo, Voltar não envia nada) e
    para o Enter da comissão.
- **Gate:** `node apps/web/scripts/audit-panels.cjs` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D07
- **Status:** DONE

### D11 — Telas que funcionam com permissões personalizadas

- **Escopo:** GET /relationship/settings passa a exigir ver `relationship` **ou** `settings` (mapa
  em `route-access.ts`). Telas que carregam `/patients` só como apoio (Agenda, Comunicações,
  Contratos, Turmas) não quebram para quem não vê Clientes: ou a API libera uma lista mínima de
  clientes (id e nome) para quem vê esses módulos — rota nova `GET /patients/options` — ou a web
  degrada com aviso; escolher a opção mais simples e segura e documentar. Testes de rota e web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** D07
- **Status:** DONE

### Pedidos do dono de 04/10/2026 (entram antes da V5)

- **Permissões 100% livres:** acabam os perfis com permissões pré-definidas (recepção,
  fisioterapeuta, financeiro). Ao criar um usuário, o admin escolhe só o **tipo**: "Admin" (acesso
  total, inclusive Administração) ou "Usuário comum". Para o usuário comum, o admin marca módulo a
  módulo o que ele vê e edita. **Usuário comum novo começa com tudo desmarcado.** Opção de
  **copiar as permissões de outro usuário** ao criar ou editar.
- **Comissão direto no usuário:** o percentual é definido no próprio usuário (já no formulário de
  criação), sem exigir antes a ligação com um profissional da agenda.
- **Configurações em gavetas:** cada seção da aba Configurações começa fechada e abre ao clicar.

### T055 — Permissões livres na API

- **Escopo:**
  - Tipo de usuário passa a ser `admin` | `user` (contratos e API). Migração NOVA `0042_…`:
    `owner` → `admin`; recepção, fisioterapeuta e financeiro → `user`, **gravando em
    `modules`/`edit_modules` os módulos efetivos que cada um tem hoje** (ninguém perde nem ganha
    acesso na migração). A migração roda sozinha no deploy: não pode falhar com os dados atuais.
  - Fim dos padrões por perfil: `user` sem módulos marcados não acessa nenhum módulo (só Visão
    geral). `admin` tem tudo, inclusive Administração (`requireOwnerAccess` → admin).
  - Procurar todo uso de perfil fixo no código (API e web: `role === "physiotherapist"`,
    `"reception"`, `"finance"`, `"owner"`, rótulos, dados demo, seed, testes) e trocar por
    módulos/tipo; listar no relatório o que mudou (ex.: quem assina prontuário).
  - Regra de segurança: não permitir rebaixar ou desativar o último admin ativo (409).
  - Testes: migração dos padrões (cada perfil antigo mantém o mesmo acesso), usuário comum novo sem
    acesso, admin com tudo, último admin protegido; PG opt-in.
- **Gate:** `npm exec -w @crm/contracts -- vitest run src/contracts.test.ts` e
  `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** D11
- **Status:** DONE

### T056 — Permissões livres na interface

- **Escopo:** formulário de usuário com o campo **Tipo** ("Admin" ou "Usuário comum"); usuário
  comum novo começa com Ver/Editar todos desmarcados; campo **"Copiar permissões de…"** (lista de
  usuários) que preenche a tabela, ainda editável antes de salvar; admin mostra "Acesso total".
  Sai o "Restaurar padrão do perfil" e a matriz "Padrão de cada perfil". Lista de usuários mostra o
  tipo e um resumo do acesso. Menu e telas continuam por módulos. Testes web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T055
- **Status:** DONE

### T057 — Comissão direto no usuário na API

- **Escopo:** percentual e vigência definidos no próprio usuário, inclusive na criação
  (`POST /admin/users` aceita `commission` opcional), sem exigir profissional ligado. A ligação com
  o profissional da agenda continua existindo **só para saber quais atendimentos são da pessoa**;
  a geração de comissões usa a regra do usuário ligado ao profissional (e a regra antiga do
  profissional enquanto não houver regra no usuário). Migrar as regras existentes sem perda
  (migração nova, se precisar, segura para o deploy). Testes de rota, geração e PG opt-in.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T055
- **Status:** DONE

### T058 — Comissão direto no usuário na interface

- **Escopo:** campos "Comissão (%)" e "Vale a partir de" no formulário de criar e de editar
  usuário, salvos junto com o restante (sem passo separado); a ligação com o profissional da agenda
  fica como campo opcional explicado ("para contar os atendimentos desta pessoa"). Enter salva o
  formulário inteiro. Testes web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T056, T057
- **Status:** DONE

### T059 — Configurações em gavetas

- **Escopo:** cada seção de Configurações (Usuários, Dados da clínica, Feriados, Prazos e
  mensagens, Auditoria e as demais) vira uma gaveta que começa **fechada** e abre ao clicar no
  título (botão com `aria-expanded`, ícone de seta, acessível por teclado); várias podem ficar
  abertas. Visual consistente com o resto (painel, tokens). Testes web: começa fechada, abre e
  fecha.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T058
- **Status:** DONE

### T060 — Corrigir a comissão no mesmo dia sem erro

- **Escopo:** hoje, salvar a comissão de um usuário com a mesma data de vigência de uma regra que
  ele já tem (ex.: corrigir no mesmo dia o percentual de um usuário criado hoje) devolve 409
  COMMISSION_RULE_DUPLICATE. Para o usuário isso é uma correção, não uma vigência nova:
  `PUT /admin/users/:id/commission` com a mesma data passa a **substituir o percentual dessa
  vigência** (dois repositórios, transação no PG, auditoria registrando valor anterior e novo),
  desde que essa regra ainda não tenha gerado lançamentos de comissão; se já gerou, mantém o 409
  com mensagem pt-BR explicando que é preciso escolher outra data. Web: a mensagem aparece no
  formulário. Testes de rota (substitui; bloqueia com lançamento) e web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T058
- **Status:** DONE

### V5 — Revisão visual da rodada 5 (manual)

- **Tipo:** manual
- **Escopo:** em 1440px e 390px, percorrer as 13 telas e conferir textos, botões, Financeiro,
  Prontuários, Configurações, CRM vazio e os novos modais de confirmação.
- **Gate:** aprovação do dono no chat.
- **Depende de:** D08, D09, D10, D11, D12, T059, T060
- **Status:** DONE

Decisões do dono na V5 (04/10/2026):

- Contas a receber passa a usar sinal e cor como as outras abas do Financeiro (T067).
- Regra nova no Financeiro para profissional ligado a usuário só valer onde o usuário não tem regra
  própria: **mantido** como está.
- Fechar a gaveta "Dados da clínica" com alterações não salvas abre um aviso (T068).
- Modais: nada fecha durante o salvamento, todos fecham com Esc e **nenhum** fecha ao clicar fora,
  em todo o CRM (T069).

### T067 — Contas a receber com sinal e cor

- **Escopo:** em Financeiro › Contas a receber, os valores seguem o mesmo padrão das outras abas
  (`signedCurrency`, `.cash-in`/`.cash-out`): entrada a receber com a cor de entrada; estornos,
  ajustes negativos ou valores que reduzem o saldo com "- R$" em vermelho. Mesma regra no cartão de
  celular. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx` e `node apps/web/scripts/audit-panels.cjs`
- **Depende de:** V5
- **Status:** DONE

### T068 — Aviso ao fechar "Dados da clínica" com alterações

- **Escopo:** em Configurações, fechar a gaveta "Dados da clínica" (ou sair da página pelo menu do
  app) com edição não salva abre um modal (`ActionModal`/`Modal`, nunca `window.confirm`) com
  **Salvar alterações**, **Descartar alterações** e **Continuar editando**. Salvar usa o mesmo
  salvamento do formulário e só fecha se der certo (erro aparece no modal); descartar volta aos
  valores salvos e fecha; continuar mantém a gaveta aberta. Sem alterações, fecha direto. Se for
  simples, aplicar o mesmo às outras gavetas com formulário editável (Prazos e mensagens). Teste web
  dos três caminhos.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx` e `node apps/web/scripts/audit-panels.cjs`
- **Depende de:** V5
- **Status:** DONE

### T069 — Modais sem fechar por clique fora, com Esc e travados no salvamento

- **Escopo:** em todo o CRM (`Modal`, `ActionModal`, `Drawer` e qualquer outro diálogo com fundo):
  (1) clicar no fundo **não fecha** mais nada — remover o `onMouseDown` do `.modal-backdrop` e
  equivalentes; (2) **Esc fecha** todos os modais/gavetas (hoje só o `ActionModal`), só o de cima
  quando houver modal sobre modal; (3) durante o salvamento (`saving`/envio em andamento), o X, o
  Esc e o "Voltar/Cancelar" ficam desativados — o `Modal` ganha prop opcional (ex.: `busy`) e as
  telas que salvam passam o estado. O `ActionMenu` (menu "Mais ações") continua fechando ao clicar
  fora — não é modal. Ampliar o audit (autorizado): reprovar fundo de modal com `onClick`/
  `onMouseDown` que chame fechar. Testes web: clique no fundo não fecha; Esc fecha; X desativado
  durante o salvamento.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx` e `node apps/web/scripts/audit-panels.cjs`
- **Depende de:** V5
- **Status:** DONE

## Rodada 6 — Etiquetas, cadastro guiado e WhatsApp (pedido do dono, 04/10/2026)

Pedidos do dono:

- Estilizar os botões que levam para o WhatsApp.
- Configurar etiquetas em Configurações, cada uma com uma cor própria.
- Ao etiquetar um cliente, só poder escolher entre as etiquetas configuradas.
- Os filtros mostram as etiquetas configuradas.
- Ao adicionar cliente, dizer se ele vai fazer uma **aula de demonstração**, **assinar um plano** ou
  **contratar um serviço avulso**. Quem assina já pode ser ligado a um plano e, de acordo com o
  plano, a uma turma — a turma **não é obrigatória** e pode ser escolhida depois com o responsável
  daquele tipo de aula. Em Clientes, filtro **"Assinantes sem turma vinculada"**.

Decisões do orquestrador (o dono pode mudar na V6):

- As etiquetas que os clientes já têm hoje (texto livre) viram etiquetas configuradas na migração,
  com uma cor padrão — nada some.
- Excluir uma etiqueta em uso é bloqueado, com aviso de quantos clientes a usam (renomear é
  permitido e atualiza os clientes).
- "Serviço avulso" = plano do tipo `single`; "plano" = `recurring` ou `fixed_package`.
- Turma compatível = turma do mesmo serviço do plano; o responsável é o profissional da turma.
- "Assinante sem turma vinculada" = cliente com plano ativo que não é avulso e sem matrícula ativa
  em nenhuma turma do serviço desse plano.
- Etiquetas dos leads (CRM) ficam como estão nesta rodada.

### T061 — Botões de WhatsApp estilizados

- **Escopo:** variante própria `whatsapp-button` (verde do WhatsApp com contraste AA, ícone, tamanho
  normal e `button-sm`), aplicada a todos os links que abrem o WhatsApp (`whatsappLink`: Contatos
  sugeridos, aniversários, SOS, detalhe do cliente e demais). Mesma aparência em todas as telas; abre
  em nova aba com `rel="noopener"`. Ampliar o audit (autorizado): link com `whatsappLink`/`wa.me`
  sem a variante é reprovado. Teste web.
- **Gate:** `node apps/web/scripts/audit-panels.cjs` e `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** V5
- **Status:** DONE

### T062 — Etiquetas configuráveis na API

- **Escopo:**
  - Migração nova `0044_…`: tabela de etiquetas por clínica (nome único sem diferenciar
    maiúsculas/acentos, cor `#RRGGBB`), importando as etiquetas distintas que os clientes já têm,
    com cor padrão. Segura para o deploy automático (transação, idempotente, sem perda).
  - Rotas: listar (quem vê `patients`, `settings` ou módulos que usam etiquetas), criar, renomear e
    trocar cor, excluir (edição de `settings`). Renomear atualiza as etiquetas dos clientes; excluir
    etiqueta em uso devolve 409 com a contagem.
  - Cadastro e edição de cliente só aceitam etiquetas configuradas (400 com a lista das
    desconhecidas). Importação de clientes: etiqueta desconhecida vira erro na prévia daquela linha.
  - Filtros (`/patients/export`, comunicado segmentado) continuam funcionando com os nomes.
  - Dois repositórios, `ROUTE_ACCESS`, auditoria, testes de rota e PG opt-in (inclui a migração).
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T061
- **Status:** DONE

### T063 — Etiquetas configuráveis na interface

- **Escopo:** gaveta "Etiquetas" em Configurações (criar, renomear, escolher cor com paleta
  sugerida e seletor livre, excluir com o aviso do 409). No cadastro do cliente, as etiquetas viram
  seleção múltipla só das configuradas (chips coloridos), sem campo de texto livre. Filtros de
  Clientes, exportação e comunicado segmentado listam as etiquetas configuradas com a cor. Selos de
  etiqueta coloridos nas listas (texto legível sobre a cor, contraste AA). Testes web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T062
- **Status:** DONE

### T064 — Cadastro guiado do cliente na API

- **Escopo:**
  - Rota transacional para criar o cliente já com o próximo passo: `demonstration` (cria o
    atendimento experimental — serviço, profissional, data/hora, respeitando feriados e conflitos),
    `plan` (cria o plano `recurring`/`fixed_package` e, opcionalmente, a matrícula numa turma do
    mesmo serviço) ou `single` (cria o plano avulso). Tudo ou nada (transação no PG). Reaproveitar a
    validação dos fluxos existentes.
  - Filtro `withoutGroup=true` em `GET /patients` (e na exportação): assinantes sem turma vinculada,
    conforme a definição acima.
  - Dois repositórios, `ROUTE_ACCESS` (edição de `patients` + a do módulo afetado: `agenda`, `plans`,
    `groups`), testes de rota e PG opt-in.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T063
- **Status:** DONE

### T065 — Cadastro guiado do cliente na interface

- **Escopo:** ao criar cliente, depois dos dados, a pergunta "O que o cliente vai fazer?" com três
  opções (Aula de demonstração · Assinar um plano · Serviço avulso), e uma opção "Só cadastrar por
  enquanto". Demonstração: serviço, profissional, data e hora. Plano/avulso: formulário de plano
  reaproveitado; para plano, campo **opcional** de turma, listando só turmas do serviço do plano com
  o responsável e as vagas, e o texto "A turma pode ser escolhida depois com o responsável". Em
  Clientes, filtro "Assinantes sem turma vinculada" (e um selo/atalho para matricular). Opções
  escondidas para quem não pode editar o módulo correspondente. Testes web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T064
- **Status:** DONE

### V6 — Revisão da rodada 6 (manual)

- **Tipo:** manual
- **Escopo:** em 1440px e 390px: botões de WhatsApp, Configurações › Etiquetas (cores), cadastro de
  cliente com as quatro opções, turma opcional, filtro "Assinantes sem turma vinculada", filtros com
  etiquetas coloridas.
- **Gate:** aprovação do dono no chat.
- **Depende de:** T065
- **Status:** DONE

Decisões do dono na V6 (04/10/2026):

- "Assinantes sem turma vinculada" exige plano dentro da validade: **mantido**.
- Parcela cancelada deixa claro que foi cancelada (T070).
- Aviso de alterações só no fechar da gaveta e no menu lateral: **mantido**.
- Detalhe do cliente mostra as etiquetas como selos coloridos; etiquetas continuam sendo criadas
  só em Configurações por quem tem permissão (T071).
- Demonstração sem cadastro de serviço/profissional/sala só erra ao salvar: **mantido**.

### T070 — Parcela cancelada explícita em Contas a receber

- **Escopo:** em Financeiro › Contas a receber (e no cartão de celular), parcela com status
  `cancelled` deixa de parecer entrada: valor sem "+" e sem a cor de entrada, em tom neutro/apagado
  e riscado, com o selo "Cancelada" bem visível ao lado do valor e legível para leitor de tela
  (ex.: texto "Cancelada" acessível, não só cor). Totais e seleção para renegociar não mudam de
  regra. Teste web (cancelada: sem "+", sem `cash-in`, com "Cancelada"; aberta/paga continuam como
  na T067).
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx` e `node apps/web/scripts/audit-panels.cjs`
- **Depende de:** V6
- **Status:** DONE

### T071 — Etiquetas como selos coloridos no detalhe do cliente

- **Escopo:** no detalhe do cliente (hoje texto separado por vírgula) e em qualquer outro ponto que
  ainda mostre etiqueta de cliente como texto (procurar: Agenda › Dados do cliente, Turmas,
  Contratos, Comunicações), usar o mesmo selo colorido da T063 (`PatientTagBadge`/`tagColorStyle`,
  cor da etiqueta configurada; etiqueta sem configuração usa a cor padrão). As etiquetas continuam
  sendo criadas só em Configurações › Etiquetas por quem edita `settings`; onde fizer sentido,
  um texto curto/atalho "Gerenciar etiquetas" só para quem tem essa permissão. Sem etiquetas:
  nada ou "Sem etiquetas". Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx` e `node apps/web/scripts/audit-panels.cjs`
- **Depende de:** V6
- **Status:** DONE

## Organização e testes — 12/10/2026

### T072 — Organização por domínio e ampliação dos testes

**Status:** DONE

- Reorganização por domínio de frontend, API, contratos, estilos e suítes: implementada.
- Unitários, integração, paridade PostgreSQL e navegador desktop/celular: implementados.
- Cobertura sem regressão, limites de imports, instruções curtas e GitHub Actions: implementados.
- Validação final: concluída; resultados registrados em STATE.md.

## Rodada 7 — Correções do teste manual (pedido do dono, 16/10/2026)

Origem: teste manual completo em produção (modo Demonstração). Ordem: Fase 1 (críticos) →
Fase 2 (usabilidade, U1–U46) → Fase 3 (visual, V1–V12). Commits `fix(<ID>): …` em pt-BR.

### Decisões do dono

- **C10 Recorrente:** 1 cobrança por ciclo (valor cheio), sem campo "Parcelas"; a próxima nasce
  na renovação. **Pacote fixo:** parcela com vencimento após a validade é permitida, com aviso.
  **Esgotado:** status derivado na exibição/filtros (ativo + 0 sessões restantes), sem migração.
- **C8:** centro de custo da despesa passa a ser opcional; categoria continua obrigatória.

### Fase 1 — Críticos

| ID | Item | Status |
|----|------|--------|
| C1 | Turmas: 500 em GET /groups/workspace (SQL com `gs` fora do FROM); selects de "Nova turma" independentes do workspace | DONE |
| C2 | Detalhes do atendimento: confirmar presença, realizado, falta | DONE |
| C3 | Cancelado fora das contagens e com estilo distinto na agenda | DONE |
| C4 | 500 em /reports/clients/details (mesma causa do C1) | DONE |
| C5 | Sino de notificações e menu do usuário | DONE |
| C6 | Datas/horas locais nos campos (medição, comanda) | DONE |
| C7 | Campo monetário único (BRL, vírgula, vazio) | DONE |
| C8 | Nova despesa: cadastro inline de categoria/centro, o que falta, centro opcional | DONE |
| C9 | Encoding do modal "Novo atendimento" | DONE |
| C10 | Recorrente 1 cobrança por ciclo; aviso no pacote; "Esgotado" | DONE |
| C11 | Histórico: ordem por criação, sem duplicar, responsável sempre gravado, seed sem datas futuras | DONE |
