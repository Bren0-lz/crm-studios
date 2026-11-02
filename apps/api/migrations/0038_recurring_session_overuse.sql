-- Plano recorrente: o cliente paga a frequência semanal (ex.: 2x por semana), e um ciclo
-- com mais aulas que o saldo nominal (9 segundas e quartas num mês) não bloqueia o
-- atendimento. O saldo pode ficar negativo nesse caso; nos demais planos a aplicação
-- continua exigindo saldo antes de consumir a sessão.
ALTER TABLE `patient_plans` DROP CONSTRAINT patient_plans_remaining_sessions_check;

ALTER TABLE `patient_plan_services` DROP CONSTRAINT patient_plan_services_remaining_sessions_check;
