-- No máximo 1 plano avulso ativo por serviço. A 0026 criou avulsos (ids de UUID()) para os
-- serviços sem avulso, e o seed demo, que roda depois das migrações, inseriu os seus próprios
-- (ids `e000000d-…`): os serviços demo ficaram com dois "<Nome> (avulso)".
--
-- Escolha do que fica, por clínica e serviço (só modelos avulsos ativos de um único serviço):
--   1. o mais usado em planos de clientes;
--   2. no empate, o do seed (`e000000d-…`, id estável dos dados demo);
--   3. depois, o cadastrado primeiro (created_at) e o menor id.
-- As cópias têm os planos de clientes e as campanhas (promotion.planTemplateIds) reapontados
-- para o que fica e depois são apagadas. Rodar de novo não muda nada (não sobra duplicata).
CREATE TEMPORARY TABLE `tmp_single_plans_0033` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `uses` INT NOT NULL,
  `is_seed` TINYINT(1) NOT NULL,
  `created_at` DATETIME(6) NOT NULL
);

INSERT INTO `tmp_single_plans_0033` (`id`, `clinic_id`, `service_id`, `uses`, `is_seed`, `created_at`)
SELECT pt.`id`, pt.`clinic_id`, pts.`service_id`,
       (SELECT COUNT(*) FROM `patient_plans` pp
        WHERE pp.`clinic_id` = pt.`clinic_id` AND pp.`plan_template_id` = pt.`id`),
       CASE WHEN pt.`id` LIKE 'e000000d-%' THEN 1 ELSE 0 END,
       pt.`created_at`
FROM `plan_templates` pt
JOIN `plan_template_services` pts ON pts.`template_id` = pt.`id` AND pts.`clinic_id` = pt.`clinic_id`
WHERE pt.`active` = 1
  AND (pt.`plan_type` = 'single' OR (pt.`plan_type` IS NULL AND pt.`kind` = 'single'))
  AND (SELECT COUNT(*) FROM `plan_template_services` x
       WHERE x.`clinic_id` = pt.`clinic_id` AND x.`template_id` = pt.`id`) = 1;

CREATE TEMPORARY TABLE `tmp_single_dupes_0033` (
  `dup_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  `keep_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
);

INSERT INTO `tmp_single_dupes_0033` (`dup_id`, `keep_id`, `clinic_id`)
SELECT ranked.`id`, ranked.`keep_id`, ranked.`clinic_id`
FROM (
  SELECT t.`id`, t.`clinic_id`,
         ROW_NUMBER() OVER (
           PARTITION BY t.`clinic_id`, t.`service_id`
           ORDER BY t.`uses` DESC, t.`is_seed` DESC, t.`created_at`, t.`id`
         ) AS `position`,
         FIRST_VALUE(t.`id`) OVER (
           PARTITION BY t.`clinic_id`, t.`service_id`
           ORDER BY t.`uses` DESC, t.`is_seed` DESC, t.`created_at`, t.`id`
         ) AS `keep_id`
  FROM `tmp_single_plans_0033` t
) ranked
WHERE ranked.`position` > 1;

UPDATE `patient_plans` pp
JOIN `tmp_single_dupes_0033` d ON d.`dup_id` = pp.`plan_template_id` AND d.`clinic_id` = pp.`clinic_id`
SET pp.`plan_template_id` = d.`keep_id`;

-- Campanhas "só nos planos marcados": a lista é remontada com o id que fica no lugar de cada
-- cópia, sem repetir id (a ordem da lista não importa para a regra).
UPDATE `auto_campaigns` c
SET c.`promotion` = JSON_SET(c.`promotion`, '$.planTemplateIds', JSON_EXTRACT((
  SELECT CONCAT('[', GROUP_CONCAT(DISTINCT JSON_QUOTE(COALESCE(d.`keep_id`, j.`id`))
                                  ORDER BY COALESCE(d.`keep_id`, j.`id`)), ']')
  FROM JSON_TABLE(c.`promotion`, '$.planTemplateIds[*]' COLUMNS (`id` VARCHAR(36) PATH '$')) j
  LEFT JOIN `tmp_single_dupes_0033` d ON d.`dup_id` = j.`id` AND d.`clinic_id` = c.`clinic_id`
), '$'))
WHERE JSON_LENGTH(c.`promotion`, '$.planTemplateIds') > 0;

UPDATE `whatsapp_campaigns` c
SET c.`promotion` = JSON_SET(c.`promotion`, '$.planTemplateIds', JSON_EXTRACT((
  SELECT CONCAT('[', GROUP_CONCAT(DISTINCT JSON_QUOTE(COALESCE(d.`keep_id`, j.`id`))
                                  ORDER BY COALESCE(d.`keep_id`, j.`id`)), ']')
  FROM JSON_TABLE(c.`promotion`, '$.planTemplateIds[*]' COLUMNS (`id` VARCHAR(36) PATH '$')) j
  LEFT JOIN `tmp_single_dupes_0033` d ON d.`dup_id` = j.`id` AND d.`clinic_id` = c.`clinic_id`
), '$'))
WHERE JSON_LENGTH(c.`promotion`, '$.planTemplateIds') > 0;

DELETE pts FROM `plan_template_services` pts
JOIN `tmp_single_dupes_0033` d ON d.`dup_id` = pts.`template_id` AND d.`clinic_id` = pts.`clinic_id`;

DELETE pt FROM `plan_templates` pt
JOIN `tmp_single_dupes_0033` d ON d.`dup_id` = pt.`id` AND d.`clinic_id` = pt.`clinic_id`;

DROP TEMPORARY TABLE `tmp_single_dupes_0033`;
DROP TEMPORARY TABLE `tmp_single_plans_0033`;
