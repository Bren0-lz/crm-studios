CREATE TABLE commission_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  commission_id uuid NOT NULL REFERENCES commission_entries(id),
  kind text NOT NULL CHECK (kind IN ('payment','reversal')),
  amount_in_cents integer NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='payment' AND amount_in_cents>=0) OR (kind='reversal' AND amount_in_cents<=0))
);
CREATE INDEX commission_payment_events_scope_idx ON commission_payment_events(clinic_id,commission_id,occurred_at);
INSERT INTO commission_payment_events(clinic_id,commission_id,kind,amount_in_cents,actor_user_id,occurred_at)
SELECT clinic_id,id,'payment',amount_in_cents,paid_by_user_id,paid_at FROM commission_entries WHERE status='paid' AND paid_at IS NOT NULL;
