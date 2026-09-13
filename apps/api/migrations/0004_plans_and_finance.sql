CREATE TYPE plan_kind AS ENUM ('single', 'fixed_package', 'recurring', 'custom');
CREATE TYPE plan_status AS ENUM ('active', 'paused', 'expired', 'cancelled');
CREATE TYPE session_movement_kind AS ENUM ('credit', 'consumption', 'reversal', 'adjustment');
CREATE TYPE receivable_status AS ENUM ('open', 'paid', 'cancelled');

CREATE TABLE patient_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  service_id uuid NOT NULL REFERENCES services(id),
  name text NOT NULL,
  kind plan_kind NOT NULL,
  total_sessions integer NOT NULL CHECK (total_sessions > 0),
  remaining_sessions integer NOT NULL CHECK (remaining_sessions >= 0),
  valid_from date NOT NULL,
  valid_until date,
  total_value_in_cents integer NOT NULL CHECK (total_value_in_cents >= 0),
  installments integer NOT NULL CHECK (installments BETWEEN 1 AND 36),
  first_due_date date NOT NULL,
  status plan_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX patient_plans_patient_idx
  ON patient_plans (clinic_id, patient_id, status);

CREATE TABLE session_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  plan_id uuid NOT NULL REFERENCES patient_plans(id),
  appointment_id uuid REFERENCES appointments(id),
  kind session_movement_kind NOT NULL,
  quantity integer NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity <> 0)
);

CREATE UNIQUE INDEX session_consumption_once_idx
  ON session_movements (plan_id, appointment_id)
  WHERE kind = 'consumption';
CREATE UNIQUE INDEX session_reversal_once_idx
  ON session_movements (plan_id, appointment_id)
  WHERE kind = 'reversal';

CREATE TABLE receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  plan_id uuid REFERENCES patient_plans(id),
  description text NOT NULL,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  installment_count integer NOT NULL CHECK (installment_count > 0),
  due_date date NOT NULL,
  amount_in_cents integer NOT NULL CHECK (amount_in_cents >= 0),
  status receivable_status NOT NULL DEFAULT 'open',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, installment_number)
);

CREATE INDEX receivables_due_idx ON receivables (clinic_id, status, due_date);

CREATE TABLE financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  receivable_id uuid NOT NULL REFERENCES receivables(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('created', 'payment', 'payment_reversal', 'cancellation')),
  amount_in_cents integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX financial_events_receivable_idx
  ON financial_events (clinic_id, receivable_id, created_at DESC);
