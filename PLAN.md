# Plano — Movimenta CRM: relacionamento, aniversários e ficha do cliente

## Objetivo final
A equipe da clínica sabe, todos os dias, com quem falar e por quê (clientes sem retorno, planos
vencendo, aniversários, faltas, inadimplência, detratores), registra cada contato, mede a
satisfação, vê o histórico completo de cada cliente e importa a base de clientes por planilha.

## Definição de pronto (global)
- T001–T018 `DONE`, cada uma com commit próprio.
- `npm run typecheck && npm run lint && npm test && npm run build` retorna 0 na `main`.
- `docs/STATUS_IMPLEMENTACAO.md` e `README.md` descrevem as novas funcionalidades.

## Fora de escopo
- Infraestrutura, deploy, CI, segurança (MFA, segredos, cabeçalhos) e refatorações de arquitetura.
- Envio real de WhatsApp/e-mail (o contato é pelo link `wa.me` aberto pela recepção).
- Importação de planos, saldos, financeiro ou prontuários (só clientes).
- Reativar telas removidas de propósito (frequência de turmas, estoque/comandas).
- Dependências npm novas, `git push`, edição de migrações existentes, `.env`, `compose.yaml`, `docs/PLANO_*`.

## Regras da Central de relacionamento (padrões, todos configuráveis na T003/T006)
| Código | Situação | Padrão | Chave de supressão (`referenceKey`) |
|---|---|---|---|
| `birthday` | aniversário hoje ou nos próximos N dias | N = 7 | `<patientId>:<ano>` |
| `single_no_return` | última compra (plano `single` ou comanda fechada) há mais de N dias sem atendimento, plano ou compra posterior | 60 | id da compra |
| `plan_expiring` | plano ativo termina em ≤ N dias, sem `autoRenew` e sem `renewedByPlanId` | 7 | id do plano |
| `low_balance` | plano ativo com ≤ N sessões restantes e sem `renewedByPlanId` | 2 | id do plano |
| `expired_with_balance` | plano `expired` com `remainingSessions > 0`, sem sucessor, vencido há ≤ 60 dias | — | id do plano |
| `treatment_paused` | último atendimento concluído há mais de N dias e nenhum atendimento futuro agendado/confirmado | 30 | id do último atendimento |
| `repeated_no_show` | ≥ N atendimentos `no_show` nos últimos M dias | 2 / 30 | id da falta mais recente |
| `former_client` | plano cancelado entre N e M dias atrás e nenhum plano ativo | 30 / 90 | id do plano |
| `overdue_payment` | parcela `open` com vencimento anterior a hoje (só perfis `owner` e `finance`) | — | id da parcela |
| `nps_detractor` (T012) | pesquisa com nota 0–6 nos últimos 30 dias | — | id da pesquisa |

- Só clientes com `status = "active"`.
- Um `ContactActivity` com mesmo `patientId` + `reason` + `referenceKey` esconde a sugestão; se o
  resultado for `snoozed`, esconde só até `snoozeUntil` (inclusive).
- Uma entrada por (cliente, situação). Ordem: `overdue_payment`, `birthday` de hoje, depois a
  ordem da tabela; dentro da mesma situação, a mais antiga/urgente primeiro.

---

## Tarefas

Status: `TODO` · `DOING` · `DONE` · `BLOCKED`

Toda tarefa, além do gate próprio, só está pronta com a suíte completa verde:
`npm run typecheck && npm run lint && npm test && npm run build`.
Gates que citam um arquivo de teste falham (exit 1) enquanto o arquivo não existir — escreva o teste primeiro.

### T001 — Contratos da Central de relacionamento
- **Escopo:** em `packages/contracts/src/index.ts`: `contactReasonSchema` (códigos da tabela acima),
  `contactOutcomeSchema` (`contacted`, `no_answer`, `scheduled`, `not_interested`, `snoozed`, `dismissed`),
  `relationshipSettingsSchema` + `defaultRelationshipSettings` (prazos da tabela e `messages`:
  um texto-modelo por situação com `{{nome}}`, incluindo o de aniversário),
  `contactActivityInputSchema` (`patientId`, `reason`, `referenceKey`, `outcome`, `notes?`,
  `snoozeUntil?` obrigatório e futuro quando `outcome = snoozed`), interfaces `ContactSuggestion`
  (cliente, telefone, whatsapp, `reason`, `referenceKey`, `detail` legível, `dueDate?`, prioridade)
  e `ContactActivity`; helpers `whatsappLink(phone, text)` (`https://wa.me/55<dígitos>?text=...`,
  sem duplicar o 55) e `fillMessageTemplate(template, vars)`. Testes em `contracts.test.ts`.
- **Gate:** `npm exec -w @crm/contracts -- vitest run src/contracts.test.ts`
- **Depende de:** —
- **Status:** DONE

### T002 — Regras de sugestão como função pura
- **Escopo:** `apps/api/src/contact-suggestions.ts` exportando
  `buildContactSuggestions(data, settings, today, role)` onde `data` traz patients, plans,
  appointments, receivables, tabs (comandas fechadas), activities (e `surveys` opcional, usado na T012).
  Implementa as regras da tabela, a supressão por atividade/adiamento e a ordenação.
  Sem acesso a banco. `apps/api/src/contact-suggestions.test.ts` com caso positivo e negativo por
  regra, supressão, adiamento vencido e filtro de `overdue_payment` por perfil.
- **Gate:** `npm exec -w @crm/api -- vitest run src/contact-suggestions.test.ts`
- **Depende de:** T001
- **Status:** DONE

### T003 — Configurações de relacionamento na API
- **Escopo:** migração nova `apps/api/migrations/0028_relationship.sql` com
  `relationship_settings` (`clinic_id` PK/FK, uma coluna inteira por prazo, `messages jsonb`,
  `updated_at`) e `contact_activities` (id, clinic_id, patient_id, reason, reference_key, outcome,
  notes, snooze_until, actor_user_id, created_at; índice por clinic+patient+reason+reference_key).
  Repositório (interface + memória + PostgreSQL): `getRelationshipSettings` (padrões quando não há
  linha) e `updateRelationshipSettings` (upsert). Rotas `GET /relationship/settings`
  (acesso comercial) e `PUT /relationship/settings` (só `owner`). Testes em `app.test.ts`;
  teste opt-in em `postgres.integration.test.ts`.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T001
- **Status:** DONE

### T004 — Sugestões e registro de contatos na API
- **Escopo:** repositório (interface + memória + PostgreSQL): `listContactSuggestions(clinicId, role)`
  (carrega os dados, lê as configurações e chama `buildContactSuggestions` com a data da clínica),
  `createContactActivity(clinicId, actorUserId, input)` e `listContactActivities(clinicId, patientId?)`.
  Rotas `GET /relationship/suggestions`, `POST /relationship/activities` e
  `GET /relationship/activities?patientId=` com acesso comercial (gestão, recepção, financeiro).
  Testes em `app.test.ts`: sugestão aparece; após registrar contato some; adiada some até a data;
  recepção não vê `overdue_payment`; fisioterapeuta recebe 403.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T002, T003
- **Status:** DONE

### T005 — Página "Contatos sugeridos"
- **Escopo:** rota `/relacionamento` e item "Contatos sugeridos" no menu (perfis com acesso
  comercial), em `apps/web/src/App.tsx`; métodos em `apps/web/src/api.ts`. Lista com filtro por
  situação e contador por situação; cada card mostra cliente, motivo (`detail`), telefone e ações:
  "WhatsApp" (link `whatsappLink` com a mensagem-modelo preenchida; usa `whatsapp` do cadastro,
  senão `phone`; abre em nova aba), "Registrar contato" (modal com resultado, observação e data de
  adiamento quando `snoozed`). Ao registrar, o card sai da lista. Teste em `App.test.tsx`.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T004
- **Status:** TODO

### T006 — Prazos e mensagens em Configurações
- **Escopo:** seção "Relacionamento" na página de Configurações (edição só para `owner`,
  leitura para os demais com acesso) com os prazos e as mensagens-modelo, usando
  `GET/PUT /relationship/settings`; mostra as variáveis disponíveis (`{{nome}}`). Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T003, T005
- **Status:** TODO

### T007 — Aniversários
- **Escopo:** API `GET /relationship/birthdays?month=AAAA-MM` (clientes ativos com aniversário no
  mês, dia, idade a completar e se o parabéns do ano já foi registrado) nos dois repositórios.
  Web: cartão "Aniversariantes" no painel (hoje e próximos N dias, a partir das sugestões
  `birthday`) com botão de parabéns (WhatsApp com a mensagem de aniversário) e "Marcar como
  enviado" (cria atividade `birthday`/`contacted` com `referenceKey` `<patientId>:<ano>`); aba
  "Aniversários do mês" na página de relacionamento com seletor de mês. Testes API e web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T005
- **Status:** TODO

### T008 — Documentação da Central de relacionamento
- **Escopo:** novo incremento 23 em `docs/STATUS_IMPLEMENTACAO.md` (regras, prazos, supressão,
  aniversários, acesso por perfil, limitação: sem envio automático) e item na lista do `README.md`.
- **Gate:** `npm run build`
- **Depende de:** T006, T007
- **Status:** TODO

### T009 — CREFITO nas evoluções e documentos
- **Escopo:** `ClinicalRecord` ganha `professionalCrefito` (contratos + memória + PostgreSQL),
  exibido ao lado do nome do profissional na evolução, na lista de prontuários e no resumo para
  impressão. `issuedDocumentInputSchema` ganha `professionalId` opcional (validado na clínica) e a
  emissão substitui `{{profissional_nome}}` e `{{profissional_crefito}}` (vazio quando não houver).
  Testes API e web.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts && npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** —
- **Status:** TODO

### T010 — Pesquisa de satisfação (NPS) na API
- **Escopo:** migração nova (próximo número livre) `satisfaction_surveys`; contrato
  `satisfactionSurveyInputSchema` (`patientId`, `appointmentId?`, `score` inteiro 0–10,
  `comment?` até 1000); regras: atendimento, se informado, precisa ser do cliente e estar
  `completed`, e só uma pesquisa por atendimento (409). Rotas `POST /satisfaction` (acesso
  comercial ou clínico) e `GET /satisfaction?from&to` com lista + resumo (promotores 9–10,
  neutros 7–8, detratores 0–6, NPS = %promotores − %detratores, arredondado). Dois repositórios,
  testes em `app.test.ts`.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** —
- **Status:** TODO

### T011 — NPS na interface
- **Escopo:** botão "Registrar satisfação" no detalhe de atendimento concluído da agenda (modal
  com notas 0–10 e comentário; some após registrado) e cartão "Satisfação (NPS)" na página de
  Relatórios para o período filtrado. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T010
- **Status:** TODO

### T012 — Detratores na Central de relacionamento
- **Escopo:** regra `nps_detractor` em `buildContactSuggestions` (usa `surveys`) e carga das
  pesquisas em `listContactSuggestions` nos dois repositórios; mensagem-modelo padrão para a
  situação. Testes na função pura e na rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/contact-suggestions.test.ts src/app.test.ts`
- **Depende de:** T004, T010
- **Status:** TODO

### T013 — Linha do tempo do cliente na API
- **Escopo:** `apps/api/src/patient-timeline.ts` (função pura) juntando, do mais recente ao mais
  antigo: atendimentos (data, serviço, profissional, status — sem conteúdo clínico), planos
  (criado, renovado, cancelado), pagamentos e estornos, contatos registrados, mensagens da central
  de comunicações e pesquisas de satisfação. Contrato `PatientTimelineEntry`. Rota
  `GET /patients/:id/timeline` nos dois repositórios. Testes da função e da rota.
- **Gate:** `npm exec -w @crm/api -- vitest run src/patient-timeline.test.ts src/app.test.ts`
- **Depende de:** T004, T010
- **Status:** TODO

### T014 — Histórico na ficha do cliente
- **Escopo:** aba ou seção "Histórico" na ficha do cliente em `App.tsx`, com ícone por tipo,
  filtro por tipo e datas no formato do app. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T013
- **Status:** TODO

### T015 — Leitura e validação da planilha de clientes
- **Escopo:** `apps/api/src/patient-import.ts`: `parseCsv(text)` (separador `;` ou `,`, aspas,
  BOM), `readXlsxRows(buffer)` com `exceljs` (primeira aba), e `validatePatientImport(rows,
  existingPatients)` que reconhece o cabeçalho sem diferenciar maiúsculas/acentos (nome, cpf,
  telefone, whatsapp, email, nascimento em dd/mm/aaaa ou aaaa-mm-dd, etiquetas separadas por
  vírgula, observações), valida cada linha com `patientInputSchema` e marca duplicados por CPF ou
  telefone (contra a base e dentro do arquivo). Resultado por linha: `valid` | `error` (mensagens)
  | `duplicate`. Testes em `patient-import.test.ts` (inclui um XLSX gerado em memória com exceljs).
- **Gate:** `npm exec -w @crm/api -- vitest run src/patient-import.test.ts`
- **Depende de:** —
- **Status:** TODO

### T016 — Endpoints de importação de clientes
- **Escopo:** `POST /patients/import/preview` (`{ fileName, contentBase64 }`, CSV ou XLSX, até
  2 MB) devolve as linhas analisadas; `POST /patients/import` cria as linhas válidas numa única
  transação, ignora duplicadas e devolve contagem de criados/ignorados. Acesso comercial.
  Interface + memória + PostgreSQL; testes em `app.test.ts`.
- **Gate:** `npm exec -w @crm/api -- vitest run src/app.test.ts`
- **Depende de:** T015
- **Status:** TODO

### T017 — Tela de importação de clientes
- **Escopo:** botão "Importar" na página de Clientes; modal com envio de arquivo (.csv/.xlsx),
  prévia em tabela com contagem de válidos/erros/duplicados, confirmação e link para baixar um CSV
  modelo gerado no navegador. Após importar, recarrega a lista. Teste web.
- **Gate:** `npm exec -w @crm/web -- vitest run src/App.test.tsx`
- **Depende de:** T016
- **Status:** TODO

### T018 — Documentação final
- **Escopo:** incrementos em `docs/STATUS_IMPLEMENTACAO.md` para CREFITO, NPS, histórico do
  cliente e importação; atualizar a lista de funcionalidades do `README.md`.
- **Gate:** `npm run build`
- **Depende de:** T008, T009, T011, T012, T014, T017
- **Status:** TODO
