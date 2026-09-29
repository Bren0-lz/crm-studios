-- Central de relacionamento: prazos e mensagens configuráveis por clínica
-- e registro dos contatos feitos a partir das sugestões.
CREATE TABLE relationship_settings (
  clinic_id uuid PRIMARY KEY REFERENCES clinics(id),
  birthday_days_ahead integer NOT NULL,
  single_no_return_days integer NOT NULL,
  plan_expiring_days integer NOT NULL,
  low_balance_sessions integer NOT NULL,
  expired_with_balance_days integer NOT NULL,
  treatment_paused_days integer NOT NULL,
  repeated_no_show_count integer NOT NULL,
  repeated_no_show_window_days integer NOT NULL,
  former_client_min_days integer NOT NULL,
  former_client_max_days integer NOT NULL,
  messages jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (former_client_min_days <= former_client_max_days)
);

CREATE TABLE contact_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  reason text NOT NULL CHECK (reason IN (
    'birthday', 'single_no_return', 'plan_expiring', 'low_balance',
    'expired_with_balance', 'treatment_paused', 'repeated_no_show',
    'former_client', 'overdue_payment', 'nps_detractor'
  )),
  reference_key text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'contacted', 'no_answer', 'scheduled', 'not_interested', 'snoozed', 'dismissed'
  )),
  notes text,
  snooze_until date,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (outcome <> 'snoozed' OR snooze_until IS NOT NULL)
);

CREATE INDEX contact_activities_reference_idx
  ON contact_activities (clinic_id, patient_id, reason, reference_key, created_at DESC);
