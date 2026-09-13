ALTER TABLE clinics ADD COLUMN phone text;
ALTER TABLE clinics ADD COLUMN email text;
ALTER TABLE clinics ADD COLUMN address text;

CREATE INDEX audit_events_actor_idx
  ON audit_events (clinic_id, actor_user_id, created_at DESC);
