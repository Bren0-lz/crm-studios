ALTER TABLE assessment_templates ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published'));
ALTER TABLE assessment_templates ADD COLUMN family_id uuid REFERENCES assessment_templates(id);
UPDATE assessment_templates t SET family_id=(SELECT first.id FROM assessment_templates first WHERE first.clinic_id=t.clinic_id AND first.name=t.name ORDER BY first.version,first.created_at,first.id LIMIT 1);
CREATE INDEX assessment_templates_family_idx ON assessment_templates(clinic_id,family_id,version);
