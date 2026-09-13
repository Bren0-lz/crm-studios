ALTER TABLE receivables ADD COLUMN payment_method text
  CHECK (payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other'));

ALTER TABLE financial_events DROP CONSTRAINT financial_events_kind_check;
ALTER TABLE financial_events ADD CONSTRAINT financial_events_kind_check
  CHECK (kind IN ('created', 'payment', 'payment_reversal', 'cancellation', 'adjustment'));

CREATE TABLE financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (clinic_id, name, kind)
);

CREATE TABLE cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (clinic_id, name)
);

CREATE TABLE payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  description text NOT NULL,
  supplier text,
  category_id uuid NOT NULL REFERENCES financial_categories(id),
  cost_center_id uuid NOT NULL REFERENCES cost_centers(id),
  due_date date NOT NULL,
  amount_in_cents integer NOT NULL CHECK (amount_in_cents > 0),
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  payment_method text CHECK (payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other')),
  paid_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  paid_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payable_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  payable_id uuid NOT NULL REFERENCES payables(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('created', 'payment', 'payment_reversal', 'cancellation')),
  amount_in_cents integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payables_due_idx ON payables (clinic_id, status, due_date);
CREATE INDEX payable_events_idx ON payable_events (clinic_id, payable_id, created_at DESC);

INSERT INTO financial_categories (clinic_id, name, kind)
SELECT id, 'Despesas administrativas', 'expense' FROM clinics
ON CONFLICT DO NOTHING;
INSERT INTO financial_categories (clinic_id, name, kind)
SELECT id, 'Materiais clínicos', 'expense' FROM clinics
ON CONFLICT DO NOTHING;
INSERT INTO cost_centers (clinic_id, name)
SELECT id, 'Administrativo' FROM clinics ON CONFLICT DO NOTHING;
INSERT INTO cost_centers (clinic_id, name)
SELECT id, 'Operação clínica' FROM clinics ON CONFLICT DO NOTHING;
