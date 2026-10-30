-- Exclusão de modelos de contrato: as versões ficam marcadas (os contratos emitidos continuam
-- apontando para elas) e saem da lista. O nome volta a ficar livre para um modelo novo
-- (no Postgres, índice único parcial; aqui, coluna gerada que fica NULL na excluída).
ALTER TABLE `document_templates`
  ADD COLUMN `deleted_at` DATETIME(6),
  ADD COLUMN `live_name` VARCHAR(191) AS (IF(deleted_at IS NULL, name, NULL)) VIRTUAL,
  ADD UNIQUE KEY document_templates_name_version_idx (`clinic_id`, `live_name`, `version`);
ALTER TABLE `document_templates` DROP INDEX document_templates_clinic_id_name_version_key;
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'contracts.templates_delete')
WHERE JSON_CONTAINS(permissions, '"contracts.templates_create"')
  AND NOT JSON_CONTAINS(permissions, '"contracts.templates_delete"');
