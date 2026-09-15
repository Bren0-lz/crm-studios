CREATE TABLE appointment_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  previous_starts_at timestamptz NOT NULL,
  previous_ends_at timestamptz NOT NULL,
  previous_professional_id uuid NOT NULL REFERENCES professionals(id),
  previous_room_id uuid NOT NULL REFERENCES rooms(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  professional_id uuid NOT NULL REFERENCES professionals(id),
  room_id uuid NOT NULL REFERENCES rooms(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_ends_at > previous_starts_at),
  CHECK (ends_at > starts_at)
);

CREATE INDEX appointment_reschedules_history_idx
  ON appointment_reschedules (clinic_id, appointment_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_appointment_reschedule_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'appointment reschedule history is immutable';
END;
$$;

CREATE TRIGGER appointment_reschedules_immutable
BEFORE UPDATE OR DELETE ON appointment_reschedules
FOR EACH ROW EXECUTE FUNCTION prevent_appointment_reschedule_mutation();
