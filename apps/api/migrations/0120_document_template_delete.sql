-- Exclusão de modelos de contrato: as versões ficam marcadas (os contratos emitidos continuam
-- apontando para elas) e saem da lista. O nome volta a ficar livre para um modelo novo.
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_clinic_id_name_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_name_version_idx
  ON document_templates (clinic_id, name, version) WHERE deleted_at IS NULL;
UPDATE users SET permissions = array_append(permissions, 'contracts.templates_delete')
WHERE permissions @> ARRAY['contracts.templates_create']::text[]
  AND NOT permissions @> ARRAY['contracts.templates_delete']::text[];
