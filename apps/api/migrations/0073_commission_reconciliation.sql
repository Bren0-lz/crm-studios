ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_clinic_identity UNIQUE(clinic_id,id);
CREATE TABLE commission_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),commission_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,expected_digest char(64) NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),expected jsonb,
  actor_id uuid NOT NULL REFERENCES users(id),actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id,idempotency_key),UNIQUE(clinic_id,id),
  FOREIGN KEY(clinic_id,commission_id) REFERENCES commission_entries(clinic_id,id)
);
CREATE TABLE commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),commission_id uuid NOT NULL,reconciliation_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES professionals(id),professional_name text NOT NULL,competence char(7) NOT NULL,
  amount_in_cents integer NOT NULL CHECK(amount_in_cents<>0),reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')),paid_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(clinic_id,commission_id) REFERENCES commission_entries(clinic_id,id),FOREIGN KEY(clinic_id,reconciliation_id) REFERENCES commission_reconciliations(clinic_id,id)
);
CREATE INDEX commission_adjustments_root_idx ON commission_adjustments(clinic_id,commission_id);
CREATE TABLE commission_account_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),commission_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES professionals(id),professional_name text NOT NULL,amount_in_cents integer NOT NULL,
  original_included boolean NOT NULL,adjustment_ids uuid[] NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),reversed_at timestamptz,
  FOREIGN KEY(clinic_id,commission_id) REFERENCES commission_entries(clinic_id,id)
);
ALTER TABLE commission_payment_events ADD COLUMN professional_name text;
ALTER TABLE commission_payment_events ADD COLUMN account_payment_id uuid REFERENCES commission_account_payments(id);
