-- Serviço não tem preço: só compõe planos, e o atendimento avulso é vendido como plano avulso.
-- Antes de remover o preço, cada serviço ativo com preço e sem plano avulso ativo ganha um
-- plano avulso de 1 sessão com esse valor (base da comissão e dos relatórios sem plano).
INSERT INTO `plan_templates`
  (`clinic_id`, `name`, `total_value_in_cents`, `service_id`, `kind`, `total_sessions`, `plan_type`, `max_installments`)
SELECT s.`clinic_id`, LEFT(CONCAT(TRIM(s.`name`), ' (avulso)'), 120), s.`price_in_cents`, s.`id`,
       'single', 1, 'single', NULL
FROM `services` s
WHERE s.`active` = 1
  AND s.`price_in_cents` > 0
  AND NOT EXISTS (
    SELECT 1 FROM `plan_template_services` pts
    JOIN `plan_templates` pt ON pt.`id` = pts.`template_id` AND pt.`clinic_id` = pts.`clinic_id`
    WHERE pts.`clinic_id` = s.`clinic_id` AND pts.`service_id` = s.`id` AND pt.`active` = 1
      AND (pt.`plan_type` = 'single' OR (pt.`plan_type` IS NULL AND pt.`kind` = 'single'))
  );

-- Os planos criados acima são os únicos modelos ainda sem serviços.
INSERT INTO `plan_template_services`
  (`clinic_id`, `template_id`, `service_id`, `position`, `total_sessions`, `total_value_in_cents`, `sessions_per_week`)
SELECT pt.`clinic_id`, pt.`id`, pt.`service_id`, 0, 1, pt.`total_value_in_cents`, NULL
FROM `plan_templates` pt
WHERE pt.`service_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `plan_template_services` pts
    WHERE pts.`clinic_id` = pt.`clinic_id` AND pts.`template_id` = pt.`id`
  );

ALTER TABLE `services`
  DROP CONSTRAINT services_price_in_cents_check;

ALTER TABLE `services`
  DROP COLUMN `price_in_cents`;
