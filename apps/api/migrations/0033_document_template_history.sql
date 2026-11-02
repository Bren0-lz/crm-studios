-- Histórico dos modelos de contrato: quem criou cada versão e, na restauração, de qual versão
-- antiga o texto veio. Versões gravadas antes ficam sem autor.
ALTER TABLE `document_templates`
  ADD COLUMN `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD COLUMN `restored_from_version` INT;
