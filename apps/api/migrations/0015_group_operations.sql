CREATE TABLE group_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  service_id uuid NOT NULL REFERENCES services(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  room_id uuid NOT NULL REFERENCES rooms(id),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE TABLE group_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  group_id uuid NOT NULL REFERENCES group_classes(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  status text NOT NULL CHECK (status IN ('active', 'waitlisted', 'cancelled')),
  queue_position integer,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX group_enrollment_current_idx
  ON group_enrollments (group_id, patient_id)
  WHERE status IN ('active', 'waitlisted');
CREATE INDEX group_waitlist_idx
  ON group_enrollments (clinic_id, group_id, status, queue_position);

CREATE TABLE group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  group_id uuid NOT NULL REFERENCES group_classes(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  series_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (group_id, starts_at)
);

CREATE INDEX group_sessions_period_idx
  ON group_sessions (clinic_id, starts_at, ends_at);

CREATE TABLE group_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  session_id uuid NOT NULL REFERENCES group_sessions(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  status text NOT NULL
    CHECK (status IN ('present', 'absent', 'excused_absence', 'replacement')),
  notes text,
  recorded_by_user_id uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, patient_id)
);

CREATE TABLE replacement_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  source_session_id uuid NOT NULL REFERENCES group_sessions(id),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'used', 'cancelled')),
  used_session_id uuid REFERENCES group_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  UNIQUE (patient_id, source_session_id)
);

CREATE INDEX replacement_credits_patient_idx
  ON replacement_credits (clinic_id, patient_id, status, created_at);
