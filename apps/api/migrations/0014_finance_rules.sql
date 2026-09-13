CREATE TABLE receivable_renegotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  original_amount_in_cents integer NOT NULL CHECK (original_amount_in_cents >= 0),
  renegotiated_amount_in_cents integer NOT NULL CHECK (renegotiated_amount_in_cents >= 0),
  reason text NOT NULL,
  original_receivable_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receivables
  ADD COLUMN renegotiation_id uuid REFERENCES receivable_renegotiations(id);

CREATE TABLE commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  percentage numeric(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  effective_from date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, professional_id, effective_from)
);

CREATE TABLE commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  rule_id uuid NOT NULL REFERENCES commission_rules(id),
  competence char(7) NOT NULL,
  base_amount_in_cents integer NOT NULL CHECK (base_amount_in_cents >= 0),
  percentage numeric(5,2) NOT NULL,
  amount_in_cents integer NOT NULL CHECK (amount_in_cents >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  paid_at timestamptz,
  paid_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, appointment_id)
);

CREATE INDEX receivable_renegotiations_patient_idx
  ON receivable_renegotiations (clinic_id, patient_id, created_at DESC);
CREATE INDEX commission_entries_competence_idx
  ON commission_entries (clinic_id, competence, status);
