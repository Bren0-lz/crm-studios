-- Nome e cor personalizados das etiquetas automáticas (AT1). A regra de cada etiqueta fica na
-- aplicação; aqui só o que a clínica trocou (NULL = padrão). Sem linha = tudo padrão.
CREATE TABLE `patient_automatic_tags` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tag_key` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NULL,
  `color` VARCHAR(7) NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`clinic_id`, `tag_key`),
  CONSTRAINT `patient_automatic_tags_clinic_id_fkey` FOREIGN KEY (`clinic_id`) REFERENCES `clinics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `patient_automatic_tags_key_check` CHECK (`tag_key` IN ('overdue_payment', 'missing_cpf', 'invalid_cpf', 'incomplete_registration', 'missing_email')),
  CONSTRAINT `patient_automatic_tags_name_check` CHECK (`name` IS NULL OR TRIM(`name`) <> ''),
  CONSTRAINT `patient_automatic_tags_color_check` CHECK (`color` IS NULL OR `color` REGEXP '^#[0-9a-fA-F]{6}$')
);
