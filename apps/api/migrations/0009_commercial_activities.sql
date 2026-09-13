ALTER TABLE leads
  ADD COLUMN responsible_user_id uuid REFERENCES users(id),
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

CREATE TABLE lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  channel text NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'email', 'in_person', 'note')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  notes text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  title text NOT NULL,
  notes text,
  due_at timestamptz NOT NULL,
  assigned_user_id uuid REFERENCES users(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_contacts_timeline_idx
  ON lead_contacts (clinic_id, lead_id, occurred_at DESC);
CREATE INDEX lead_tasks_due_idx
  ON lead_tasks (clinic_id, status, due_at);
CREATE INDEX lead_tasks_lead_idx
  ON lead_tasks (clinic_id, lead_id, due_at);
