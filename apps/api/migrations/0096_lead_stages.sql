-- Funil configurável: a clínica renomeia, inclui e remove etapas e escolhe a etapa final.
-- A etapa final sempre usa a chave 'won' (leads convertidos) e a de perdidos, 'lost'.
-- O CHECK de perda (0005) compara com o enum: sai antes da troca de tipo e volta depois.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%stage%'
  LOOP
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;
ALTER TABLE leads ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN stage TYPE text USING stage::text;
ALTER TABLE leads ALTER COLUMN stage SET DEFAULT 'new_contact';
ALTER TABLE leads ADD CONSTRAINT leads_stage_key
  CHECK (stage ~ '^[a-z][a-z0-9_]{0,39}$');
ALTER TABLE leads ADD CONSTRAINT leads_lost_reason
  CHECK (stage <> 'lost' OR lost_reason IS NOT NULL);
ALTER TABLE lead_stage_history
  ALTER COLUMN from_stage TYPE text USING from_stage::text,
  ALTER COLUMN to_stage TYPE text USING to_stage::text;
DROP TYPE lead_stage;

-- Sem linhas para a clínica = etapas padrão.
CREATE TABLE lead_stages (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (clinic_id, stage),
  UNIQUE (clinic_id, position)
);

-- Clínicas que já renomearam etapas (0095) passam a ter o funil completo salvo.
INSERT INTO lead_stages (clinic_id, stage, label, position)
SELECT clinics.clinic_id, defaults.stage,
       coalesce(saved.label, defaults.label), defaults.position
FROM (SELECT DISTINCT clinic_id FROM lead_stage_labels) clinics
CROSS JOIN (VALUES
  ('new_contact', 'Novos', 0),
  ('contacted', 'Em contato', 1),
  ('evaluation', 'Avaliação', 2),
  ('proposal', 'Proposta', 3),
  ('won', 'Ganhos', 4),
  ('lost', 'Perdidos', 5)
) AS defaults(stage, label, position)
LEFT JOIN lead_stage_labels saved
  ON saved.clinic_id = clinics.clinic_id AND saved.stage = defaults.stage;

DROP TABLE lead_stage_labels;
