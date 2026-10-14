ALTER TABLE group_attendance ADD COLUMN accounting_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE group_attendance ADD COLUMN outcome text CHECK (outcome IN ('scheduled','present','absent','excused_absence','cancelled'));
ALTER TABLE group_attendance ADD COLUMN replacement_credit_id uuid REFERENCES replacement_credits(id);
ALTER TABLE group_sessions ADD COLUMN professional_id uuid REFERENCES professionals(id);
ALTER TABLE session_movements ADD COLUMN group_attendance_id uuid REFERENCES group_attendance(id);
CREATE UNIQUE INDEX group_consumption_once_idx ON session_movements(group_attendance_id) WHERE kind='consumption';
CREATE UNIQUE INDEX group_reversal_once_idx ON session_movements(group_attendance_id) WHERE kind='reversal';
