# Estado do loop

- **Tarefa atual:** T006
- **Última concluída:** T005
- **Tentativas na atual:** 0/3
- **Bloqueios:** nenhum

## Diário

<!-- Uma linha por evento. O implementer lê isto: registre descobertas que
     mudam tarefas futuras, não narrativa. -->
- 2026-09-28 Estrutura autodev instalada. Gates verificados: typecheck 25s, lint 23s, test 29s, build 30s. `format:check` fora (38 arquivos já fora do padrão). Testes PostgreSQL só rodam com TEST_DATABASE_URL (indisponível nesta máquina).
- 2026-09-29 T001 DONE (verifier PASS na 1ª tentativa). Nomes para as próximas tarefas: `RelationshipSettings` com um campo inteiro por prazo (birthdayDaysAhead, singleNoReturnDays, planExpiringDays, lowBalanceSessions, expiredWithBalanceDays, treatmentPausedDays, repeatedNoShowCount/WindowDays, formerClientMin/MaxDays) + `messages` por reason; helper `saoPauloToday()` = data da clínica; `ContactSuggestion.priority` menor = mais urgente.
- 2026-09-29 T002 DONE (verifier PASS na 1ª tentativa). `buildContactSuggestions(data, settings, today, role)` + interface `ContactSuggestionData` (patients, plans, appointments, receivables, tabs, activities, `surveys?: unknown[]` — T012 deve tipar). priority: 0 overdue_payment, 1 aniversário hoje, 2 demais aniversários, 3–9 ordem da tabela, 10 nps_detractor. overdue_payment = 1 entrada por cliente (referenceKey = parcela vencida mais antiga). low_balance ignora planos `single`. 29/02 → 28/02 em ano não bissexto.
- 2026-09-29 T003 DONE (verifier PASS na 1ª tentativa). Migração 0028 cria relationship_settings e contact_activities (CHECK de reason/outcome; snoozed exige snooze_until `date`; índice (clinic_id, patient_id, reason, reference_key, created_at DESC)). `getRelationshipSettings(clinicId)` / `updateRelationshipSettings(clinicId, input)`; memória usa Map por clinicId (seguir padrão para atividades). PUT só owner (403 OWNER_ACCESS_REQUIRED); GET nega physiotherapist. SQL não executado (sem TEST_DATABASE_URL).
- 2026-09-29 T004 DONE (verifier PASS na 1ª tentativa). Rotas GET /relationship/suggestions, POST /relationship/activities (201; 404 PATIENT_NOT_FOUND), GET /relationship/activities?patientId= (mais recentes primeiro). Testes que avançam o relógio: `vi.useFakeTimers({ toFake: ["Date"] })` + novo token via `app.jwt.sign` (o login expira). PG carrega todos os atendimentos da clínica sem janela de datas (otimização adiada, fase não funcional).
- 2026-09-29 T005 DONE (verifier PASS na 1ª tentativa). Página /relacionamento (`RelationshipPage`, `ContactActivityModal`); `{{nome}}` = primeiro nome do cliente (seguir em T006/T007). Reusar em App.tsx: `contactReasonLabels`, `contactOutcomeLabels`, `addDaysToIsoDate`, `suggestionKey`. api.ts: `relationshipSettings()`, `contactSuggestions()`, `createContactActivity()`; `updateRelationshipSettings` (PUT) ainda não existe — criar na T006.
