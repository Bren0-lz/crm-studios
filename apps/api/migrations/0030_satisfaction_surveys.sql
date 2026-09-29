-- Pesquisa de satisfação (NPS): nota 0–10 do cliente, opcionalmente ligada a
-- um atendimento concluído (no máximo uma pesquisa por atendimento).
CREATE TABLE satisfaction_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  appointment_id uuid REFERENCES appointments(id),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX satisfaction_surveys_appointment_idx
  ON satisfaction_surveys (clinic_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX satisfaction_surveys_clinic_created_idx
  ON satisfaction_surveys (clinic_id, created_at DESC);
