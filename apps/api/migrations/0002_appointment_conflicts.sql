CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_professional_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled');

ALTER TABLE appointments
  ADD CONSTRAINT appointments_room_no_overlap
  EXCLUDE USING gist (
    clinic_id WITH =,
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
