CREATE TABLE communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id, channel)
);

CREATE TABLE outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  appointment_id uuid REFERENCES appointments(id),
  receivable_id uuid REFERENCES receivables(id),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  kind text NOT NULL CHECK (kind IN ('appointment_reminder', 'payment_reminder', 'manual')),
  recipient text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, idempotency_key)
);

CREATE INDEX outbound_messages_queue_idx
  ON outbound_messages (clinic_id, status, scheduled_for);
CREATE INDEX outbound_messages_patient_idx
  ON outbound_messages (clinic_id, patient_id, created_at DESC);
