ALTER TABLE appointments ADD COLUMN series_id uuid;

CREATE TABLE schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  professional_id uuid REFERENCES professionals(id),
  room_id uuid REFERENCES rooms(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (professional_id IS NOT NULL OR room_id IS NOT NULL),
  CHECK (ends_at > starts_at)
);

ALTER TABLE schedule_blocks
  ADD CONSTRAINT schedule_blocks_professional_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'active' AND professional_id IS NOT NULL);

ALTER TABLE schedule_blocks
  ADD CONSTRAINT schedule_blocks_room_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'active' AND room_id IS NOT NULL);

CREATE OR REPLACE FUNCTION prevent_appointment_on_schedule_block()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'cancelled' AND EXISTS (
    SELECT 1 FROM schedule_blocks b
    WHERE b.clinic_id = NEW.clinic_id AND b.status = 'active'
      AND (b.professional_id = NEW.professional_id OR b.room_id = NEW.room_id)
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'appointment conflicts with schedule block' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_schedule_block_guard
BEFORE INSERT OR UPDATE OF professional_id, room_id, starts_at, ends_at, status
ON appointments FOR EACH ROW EXECUTE FUNCTION prevent_appointment_on_schedule_block();

CREATE OR REPLACE FUNCTION prevent_block_on_appointment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.clinic_id = NEW.clinic_id AND a.status <> 'cancelled'
      AND (
        (NEW.professional_id IS NOT NULL AND a.professional_id = NEW.professional_id)
        OR (NEW.room_id IS NOT NULL AND a.room_id = NEW.room_id)
      )
      AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'schedule block conflicts with appointment' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_blocks_appointment_guard
BEFORE INSERT OR UPDATE OF professional_id, room_id, starts_at, ends_at, status
ON schedule_blocks FOR EACH ROW EXECUTE FUNCTION prevent_block_on_appointment();

CREATE INDEX schedule_blocks_range_idx
  ON schedule_blocks (clinic_id, starts_at, ends_at) WHERE status = 'active';
