-- O atendimento avulso é vendido como plano avulso; o preço do serviço fica só como preço de
-- tabela (referência no cadastro de planos). Cada serviço ativo com preço e sem plano avulso
-- ativo ganha um plano avulso de 1 sessão com esse valor (base da comissão e dos relatórios
-- sem plano). A tabela temporária guarda os ids criados aqui, para o vínculo com o serviço
-- não alcançar modelos antigos.
CREATE TEMPORARY TABLE `tmp_single_plans_0026` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `total_value_in_cents` INT NOT NULL
);

INSERT INTO `tmp_single_plans_0026` (`id`, `clinic_id`, `service_id`, `name`, `total_value_in_cents`)
SELECT UUID(), s.`clinic_id`, s.`id`, LEFT(CONCAT(TRIM(s.`name`), ' (avulso)'), 120), s.`price_in_cents`
FROM `services` s
WHERE s.`active` = 1
  AND s.`price_in_cents` > 0
  AND NOT EXISTS (
    SELECT 1 FROM `plan_template_services` pts
    JOIN `plan_templates` pt ON pt.`id` = pts.`template_id` AND pt.`clinic_id` = pts.`clinic_id`
    WHERE pts.`clinic_id` = s.`clinic_id` AND pts.`service_id` = s.`id` AND pt.`active` = 1
      AND (pt.`plan_type` = 'single' OR (pt.`plan_type` IS NULL AND pt.`kind` = 'single'))
  );

INSERT INTO `plan_templates`
  (`id`, `clinic_id`, `name`, `total_value_in_cents`, `service_id`, `kind`, `total_sessions`, `plan_type`, `max_installments`)
SELECT t.`id`, t.`clinic_id`, t.`name`, t.`total_value_in_cents`, t.`service_id`,
       'single', 1, 'single', NULL
FROM `tmp_single_plans_0026` t;

INSERT INTO `plan_template_services`
  (`clinic_id`, `template_id`, `service_id`, `position`, `total_sessions`, `total_value_in_cents`, `sessions_per_week`)
SELECT t.`clinic_id`, t.`id`, t.`service_id`, 0, 1, t.`total_value_in_cents`, NULL
FROM `tmp_single_plans_0026` t;

DROP TEMPORARY TABLE `tmp_single_plans_0026`;
