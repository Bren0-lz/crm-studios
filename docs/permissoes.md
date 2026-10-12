# Permissões por operação

O Studios mantém os tipos **Admin** e **Usuário comum**. Administradores têm acesso total, incluindo Administração. Usuários comuns começam sem permissões e recebem operações individuais, válidas para os registros da sua clínica. Cargo e vínculo profissional não concedem acesso.

Em Configurações → Usuários, o editor permite pesquisar, selecionar um bloco, limpar e copiar permissões. Selecionar uma operação marca suas dependências; remover uma dependência remove as operações que dependem dela. Cópia altera apenas o formulário do usuário de destino, até salvar.

## Contratos e autorização

- `UserSummary` e `AdminUser` retornam `permissions`, com as chaves efetivas do catálogo de `@crm/contracts`.
- Criação e atualização aceitam `permissions: PermissionKey[]`. Na atualização, omitir preserva a lista; `[]` remove todos os acessos do usuário comum. Rebaixar um admin sem informar permissões começa sem acesso.
- Chaves desconhecidas e listas sem as dependências necessárias recebem 400. Não é permitido enviar `permissions` junto com `modules` ou `editModules`.
- As entradas antigas `modules`/`editModules` continuam aceitas e são traduzidas. Nas respostas, são projeções de compatibilidade: um módulo aparece em `editModules` somente quando todas as operações antigas de edição desse módulo estão liberadas. Elas não autorizam operações na API nova.
- O backend relê o usuário ativo em cada requisição. Revogação e desativação valem para tokens já emitidos. A interface consulta `/me` ao montar, voltar à aba ou receber 403, com deduplicação de consultas e proteção contra respostas antigas após logout.
- Toda rota possui política explícita; rotas sem política impedem a inicialização. HEAD herda a proteção de GET. Erros 403 identificam a permissão ou alternativas ausentes em `details`.
- Administração, gestão de usuários, promoção para admin, feriados e dados da clínica permanecem exclusivos de administradores. Não há perfis reutilizáveis nem escopo “próprios/todos”.

## Leituras e operações combinadas

O dashboard omite campos de agenda e clientes sem autorização, em vez de retornar zeros. A página inicial continua acessível sem módulos. As opções de clientes e de atendimentos clínicos retornam somente os campos necessários à seleção. O histórico do cliente filtra os eventos conforme os módulos de origem autorizados.

Cancelar atendimento, plano ou contrato exige a permissão de cancelamento correspondente, independentemente das outras transições. Cadastro guiado valida criação do cliente e todas as operações do próximo passo antes de gravar. Converter lead exige também criar cliente; agendar atendimento de lead exige também agendar atendimento. Os efeitos internos normais de uma operação — como gerar recebíveis ao contratar plano — continuam pertencendo à operação autorizada.

Mudanças de permissões registram autor, destino e listas anteriores/posteriores na mesma transação. Alterações de tipo de usuário também são auditadas. No PostgreSQL, criação/alteração de usuários trava a clínica antes dos usuários, serializando alterações e protegendo o último administrador ativo.

## Migração e implantação

1. Executar testes, typecheck, lint e build; preparar uma cópia de segurança do banco antes de implantar.
2. Pausar gravações da API antiga e aplicar `npm run db:migrate` no ambiente de destino. A migration `0045_operation_permissions.sql` transforma os acessos existentes sem editar migrations anteriores. Administradores continuam irrestritos; acessos antes liberados apenas por login passam a respeitar os módulos.
3. Publicar API e frontend novos na mesma janela e retirar todas as instâncias antigas antes de retomar gravações. Verificar `/me`, dashboard, editor e uma operação permitida/negada com usuário comum.
4. As colunas antigas permanecem no banco. O backfill só preenche `permissions IS NULL`, preservando escolhas granulares em uma segunda execução. Novas permissões futuras começam desmarcadas para usuários comuns.

Após configurar permissões granulares, **não retornar à API antiga usando o banco atual**: ela não conhece as restrições por operação. Um rollback precisa restaurar a versão anterior dos dados e aplicações de forma coordenada, considerando gravações feitas depois da cópia de segurança.

Os testes PostgreSQL usam `TEST_DATABASE_URL`; utilize exclusivamente um banco descartável local. A implementação foi validada em cluster temporário separado do banco da aplicação.

## Mapa de operações e rotas

O catálogo abaixo é definido em `packages/contracts/src/permissions.ts`; as políticas de rotas ficam em `apps/api/src/route-access.ts`. Permissões de visualização são `<módulo>.view`. As dependências adicionais e condições por conteúdo são indicadas nas seções anteriores e no catálogo.

<!-- permission-map -->

| Permissão | Módulo | Operação | Rotas |
| --- | --- | --- | --- |
| `agenda.view` | Agenda | Visualizar módulo | `GET /holidays`<br>`GET /professionals`<br>`GET /rooms`<br>`GET /services`<br>`GET /appointments`<br>`GET /appointments/:id/reschedules`<br>`GET /schedule-blocks`<br>`GET /group-sessions`<br>`GET /satisfaction`<br>`GET /patients/options`<br>`GET /patient-tags` |
| `agenda.create` | Agenda | Agendar atendimento | `POST /appointments`<br>`POST /leads/:id/appointments` |
| `agenda.recurring` | Agenda | Agendar atendimentos recorrentes | `POST /appointments/recurring` |
| `agenda.reschedule` | Agenda | Reagendar atendimento | `PUT /appointments/:id/schedule` |
| `agenda.attendance` | Agenda | Registrar presença e conclusão | `PATCH /appointments/:id/status` |
| `agenda.cancel` | Agenda | Cancelar atendimento | `PATCH /appointments/:id/status` |
| `agenda.blocks_create` | Agenda | Criar bloqueio de agenda | `POST /schedule-blocks` |
| `agenda.blocks_cancel` | Agenda | Cancelar bloqueio | `POST /schedule-blocks/:id/cancel` |
| `agenda.professionals_create` | Agenda | Cadastrar profissional | `POST /professionals` |
| `agenda.rooms_create` | Agenda | Cadastrar sala | `POST /rooms` |
| `agenda.services_create` | Agenda | Cadastrar serviço | `POST /services` |
| `agenda.satisfaction_create` | Agenda | Registrar pesquisa de satisfação | `POST /satisfaction` |
| `groups.view` | Turmas | Visualizar módulo | `GET /holidays`<br>`GET /professionals`<br>`GET /rooms`<br>`GET /services`<br>`GET /group-sessions`<br>`GET /groups/workspace`<br>`GET /patients/options`<br>`GET /patient-tags` |
| `groups.create` | Turmas | Criar turma | `POST /groups` |
| `groups.update` | Turmas | Editar turma | `PUT /groups/:id` |
| `groups.enroll` | Turmas | Matricular cliente | `POST /group-enrollments` |
| `groups.cancel_enrollment` | Turmas | Cancelar matrícula | `POST /group-enrollments/:id/cancel` |
| `groups.attendance` | Turmas | Registrar presença na turma | `PUT /group-sessions/:sessionId/attendance/:patientId` |
| `groups.complete` | Turmas | Concluir aula | `POST /group-sessions/:id/complete` |
| `groups.replacement` | Turmas | Agendar reposição | `POST /group-replacements/book` |
| `patients.view` | Clientes | Visualizar módulo | `GET /patients`<br>`GET /patients/options`<br>`GET /patient-tags` |
| `patients.create` | Clientes | Cadastrar cliente | `POST /patients`<br>`POST /patients/guided`<br>`POST /leads/:id/convert` |
| `patients.update` | Clientes | Editar cliente | `PUT /patients/:id` |
| `patients.import` | Clientes | Importar clientes | `POST /patients/import/preview`<br>`POST /patients/import` |
| `patients.export` | Clientes | Exportar clientes | `GET /patients/export` |
| `patients.timeline` | Clientes | Consultar histórico do cliente | `GET /patients/:id/timeline` |
| `patients.inventory_view` | Clientes | Consultar estoque e comandas | `GET /inventory/workspace` |
| `patients.products_create` | Clientes | Cadastrar produto | `POST /inventory/products` |
| `patients.stock_move` | Clientes | Movimentar estoque | `POST /inventory/movements` |
| `patients.tabs_create` | Clientes | Abrir comanda | `POST /patient-tabs` |
| `patients.tabs_items` | Clientes | Adicionar itens à comanda | `POST /patient-tabs/:id/items` |
| `patients.tabs_close` | Clientes | Fechar comanda | `POST /patient-tabs/:id/close` |
| `patients.tabs_cancel` | Clientes | Cancelar comanda | `POST /patient-tabs/:id/cancel` |
| `plans.view` | Planos e sessões | Visualizar módulo | `GET /services`<br>`GET /patients/options`<br>`GET /plans`<br>`GET /plans/:id/movements` |
| `plans.create` | Planos e sessões | Contratar plano ou sessão | `POST /plans` |
| `plans.status` | Planos e sessões | Alterar situação do plano | `PATCH /plans/:id/status` |
| `plans.cancel` | Planos e sessões | Cancelar plano | `PATCH /plans/:id/status` |
| `plans.renew` | Planos e sessões | Renovar plano | `POST /plans/:id/renew` |
| `plans.auto_renew` | Planos e sessões | Configurar renovação automática | `PATCH /plans/:id/auto-renew` |
| `crm.view` | CRM comercial | Visualizar módulo | `GET /holidays`<br>`GET /professionals`<br>`GET /rooms`<br>`GET /services`<br>`GET /leads`<br>`GET /leads/:id/activity` |
| `crm.create` | CRM comercial | Cadastrar lead | `POST /leads` |
| `crm.stage` | CRM comercial | Movimentar lead no funil | `PATCH /leads/:id/stage` |
| `crm.convert` | CRM comercial | Converter lead em cliente | `POST /leads/:id/convert` |
| `crm.contacts_create` | CRM comercial | Registrar contato do lead | `POST /leads/:id/contacts` |
| `crm.tasks_create` | CRM comercial | Criar tarefa | `POST /leads/:id/tasks` |
| `crm.appointments_create` | CRM comercial | Agendar atendimento do lead | `POST /leads/:id/appointments` |
| `crm.tasks_status` | CRM comercial | Alterar situação da tarefa | `PATCH /lead-tasks/:id/status` |
| `relationship.view` | Contatos sugeridos | Visualizar módulo | `GET /relationship/settings`<br>`GET /relationship/suggestions`<br>`GET /relationship/birthdays`<br>`GET /relationship/activities` |
| `relationship.activities_create` | Contatos sugeridos | Registrar contato com cliente | `POST /relationship/activities` |
| `communications.view` | Comunicações | Visualizar módulo | `GET /patients/options`<br>`GET /patient-tags`<br>`GET /communications` |
| `communications.preferences` | Comunicações | Editar preferências de comunicação | `PUT /communications/preferences` |
| `communications.messages` | Comunicações | Enviar mensagem individual | `POST /communications/messages` |
| `communications.broadcast` | Comunicações | Preparar e enviar mensagens em massa | `POST /communications/broadcast/preview`<br>`POST /communications/broadcast` |
| `communications.reminders` | Comunicações | Gerar lembretes | `POST /communications/reminders/generate` |
| `contracts.view` | Contratos | Visualizar módulo | `GET /professionals`<br>`GET /patients/options`<br>`GET /patient-tags`<br>`GET /document-templates`<br>`GET /documents` |
| `contracts.templates_create` | Contratos | Criar modelo de contrato | `POST /document-templates` |
| `contracts.templates_version` | Contratos | Versionar modelo de contrato | `POST /document-templates/:id/versions` |
| `contracts.issue` | Contratos | Emitir contrato | `POST /documents` |
| `contracts.status` | Contratos | Alterar situação do contrato | `PATCH /documents/:id/status` |
| `contracts.cancel` | Contratos | Cancelar contrato | `PATCH /documents/:id/status` |
| `clinical.view` | Prontuários | Visualizar módulo | `GET /holidays`<br>`GET /professionals`<br>`GET /appointments/options`<br>`GET /patients/options`<br>`GET /clinical-records`<br>`GET /clinical-records/:id/revisions`<br>`GET /clinical-workspace/:patientId` |
| `clinical.export` | Prontuários | Exportar prontuário | `GET /clinical-workspace/:patientId/export` |
| `clinical.access_events` | Prontuários | Consultar acessos ao prontuário | `GET /clinical-workspace/:patientId/access-events` |
| `clinical.attachments_read` | Prontuários | Baixar anexo clínico | `GET /clinical-attachments/:id/content` |
| `clinical.records_create` | Prontuários | Registrar evolução | `POST /clinical-records` |
| `clinical.records_update` | Prontuários | Editar evolução em rascunho | `POST /clinical-records` |
| `clinical.finalize` | Prontuários | Finalizar evolução | `POST /clinical-records/:id/finalize` |
| `clinical.attachments_create` | Prontuários | Anexar documento clínico | `POST /clinical-attachments` |
| `clinical.addenda_create` | Prontuários | Registrar adendo | `POST /clinical-addenda` |
| `clinical.templates_create` | Prontuários | Criar modelo de avaliação | `POST /assessment-templates` |
| `clinical.assessments_create` | Prontuários | Registrar avaliação | `POST /clinical-assessments` |
| `clinical.goals_create` | Prontuários | Criar objetivo terapêutico | `POST /therapeutic-goals` |
| `clinical.goals_status` | Prontuários | Alterar objetivo terapêutico | `PATCH /therapeutic-goals/:id/status` |
| `clinical.measurements_create` | Prontuários | Registrar medida clínica | `POST /clinical-measurements` |
| `clinical.closures_create` | Prontuários | Registrar alta ou encerramento | `POST /treatment-closures` |
| `finance.view` | Financeiro | Visualizar módulo | `GET /professionals`<br>`GET /finance/summary`<br>`GET /finance/receivables/:id/receipt`<br>`GET /finance/workspace`<br>`GET /finance/daily-cash`<br>`GET /finance/forecast`<br>`GET /finance/recurring-payables` |
| `finance.receive` | Financeiro | Receber pagamento | `POST /finance/receivables/:id/pay` |
| `finance.adjust` | Financeiro | Ajustar recebível | `PATCH /finance/receivables/:id/adjust` |
| `finance.recurring_create` | Financeiro | Criar conta recorrente | `POST /finance/recurring-payables` |
| `finance.recurring_update` | Financeiro | Editar conta recorrente | `PUT /finance/recurring-payables/:id` |
| `finance.recurring_delete` | Financeiro | Excluir conta recorrente | `DELETE /finance/recurring-payables/:id` |
| `finance.renegotiate` | Financeiro | Renegociar recebíveis | `POST /finance/renegotiations` |
| `finance.commission_rules` | Financeiro | Configurar regra de comissão | `POST /finance/commission-rules` |
| `finance.commissions_generate` | Financeiro | Gerar comissões | `POST /finance/commissions/generate` |
| `finance.commissions_pay` | Financeiro | Pagar comissão | `POST /finance/commissions/:id/pay` |
| `finance.commissions_reverse` | Financeiro | Estornar comissão | `POST /finance/commissions/:id/reverse` |
| `finance.categories_create` | Financeiro | Cadastrar categoria financeira | `POST /finance/categories` |
| `finance.cost_centers_create` | Financeiro | Cadastrar centro de custo | `POST /finance/cost-centers` |
| `finance.payables_create` | Financeiro | Cadastrar conta a pagar | `POST /finance/payables` |
| `finance.payables_pay` | Financeiro | Pagar conta | `POST /finance/payables/:id/pay` |
| `finance.payables_reverse` | Financeiro | Estornar conta paga | `POST /finance/payables/:id/reverse` |
| `finance.receivables_reverse` | Financeiro | Estornar recebimento | `POST /finance/receivables/:id/reverse` |
| `reports.view` | Relatórios | Visualizar módulo | Condição dentro da operação |
| `reports.management` | Relatórios | Consultar relatório gerencial | `GET /reports/management`<br>`GET /reports/management.csv` |
| `reports.retention` | Relatórios | Consultar retenção | `GET /reports/retention` |
| `reports.clients` | Relatórios | Consultar relatório de clientes | `GET /reports/clients` |
| `reports.sales` | Relatórios | Consultar vendas | `GET /reports/sales`<br>`GET /reports/sales.xlsx` |
| `reports.export` | Relatórios | Exportar relatórios | `GET /reports/sales.xlsx`<br>`GET /reports/management.csv` |
| `settings.view` | Configurações | Visualizar módulo | `GET /patient-tags`<br>`GET /relationship/settings` |
| `settings.tags_create` | Configurações | Criar etiqueta | `POST /patient-tags` |
| `settings.tags_update` | Configurações | Editar etiqueta | `PATCH /patient-tags/:id` |
| `settings.tags_delete` | Configurações | Excluir etiqueta | `DELETE /patient-tags/:id` |
