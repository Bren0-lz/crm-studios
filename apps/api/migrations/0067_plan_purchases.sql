CREATE TABLE plan_purchases (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  idempotency_key uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id,idempotency_key)
);
