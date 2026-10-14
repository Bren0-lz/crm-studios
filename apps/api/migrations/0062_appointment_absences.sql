ALTER TABLE appointments ADD COLUMN absence_reason text;
ALTER TABLE appointments ADD COLUMN predecessor_id uuid REFERENCES appointments(id);
CREATE UNIQUE INDEX appointments_active_successor_idx ON appointments(clinic_id,predecessor_id) WHERE predecessor_id IS NOT NULL AND status <> 'cancelled';
