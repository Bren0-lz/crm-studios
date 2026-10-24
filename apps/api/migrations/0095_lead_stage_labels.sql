-- Nomes das etapas do funil renomeados pela clínica (vale para toda a rede).
-- Etapas sem linha usam o nome padrão definido nos contratos.
CREATE TABLE lead_stage_labels (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('new_contact','contacted','evaluation','proposal','won','lost')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, stage)
);
