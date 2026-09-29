# Estado do loop

- **Tarefa atual:** T002
- **Última concluída:** T001
- **Tentativas na atual:** 0/3
- **Bloqueios:** nenhum

## Diário

<!-- Uma linha por evento. O implementer lê isto: registre descobertas que
     mudam tarefas futuras, não narrativa. -->
- 2026-09-28 Estrutura autodev instalada. Gates verificados: typecheck 25s, lint 23s, test 29s, build 30s. `format:check` fora (38 arquivos já fora do padrão). Testes PostgreSQL só rodam com TEST_DATABASE_URL (indisponível nesta máquina).
- 2026-09-29 T001 DONE (verifier PASS na 1ª tentativa). Nomes para as próximas tarefas: `RelationshipSettings` com um campo inteiro por prazo (birthdayDaysAhead, singleNoReturnDays, planExpiringDays, lowBalanceSessions, expiredWithBalanceDays, treatmentPausedDays, repeatedNoShowCount/WindowDays, formerClientMin/MaxDays) + `messages` por reason; helper `saoPauloToday()` = data da clínica; `ContactSuggestion.priority` menor = mais urgente.
