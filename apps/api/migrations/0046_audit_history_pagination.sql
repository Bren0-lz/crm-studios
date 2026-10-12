CREATE INDEX IF NOT EXISTS audit_events_history_idx
  ON audit_events (clinic_id, created_at DESC, id DESC);
