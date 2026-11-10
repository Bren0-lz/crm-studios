-- Saldo de baixa parcial: a parcela nova guarda o número da parcela de origem (o
-- `installment_number` continua único no plano). "Parcela 1 de 3 · saldo", em vez de
-- "Parcela 4 de 3", e o resumo do plano conta as parcelas originais.
ALTER TABLE `receivables` ADD COLUMN `balance_of_installment` INT NULL;

-- Saldos já criados: a baixa que gerou o saldo aponta para ele (`balance_receivable_id`).
-- Duas passadas cobrem o saldo de um saldo (a origem já resolvida na primeira).
UPDATE `receivables` b
JOIN `financial_events` e ON e.`balance_receivable_id` = b.`id` AND e.`clinic_id` = b.`clinic_id`
JOIN `receivables` o ON o.`id` = e.`receivable_id` AND o.`clinic_id` = b.`clinic_id`
SET b.`balance_of_installment` = COALESCE(o.`balance_of_installment`, o.`installment_number`)
WHERE b.`plan_id` IS NOT NULL;

UPDATE `receivables` b
JOIN `financial_events` e ON e.`balance_receivable_id` = b.`id` AND e.`clinic_id` = b.`clinic_id`
JOIN `receivables` o ON o.`id` = e.`receivable_id` AND o.`clinic_id` = b.`clinic_id`
SET b.`balance_of_installment` = COALESCE(o.`balance_of_installment`, o.`installment_number`)
WHERE b.`plan_id` IS NOT NULL;
