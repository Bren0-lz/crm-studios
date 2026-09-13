CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('owner', 'reception', 'physiotherapist', 'finance');
CREATE TYPE patient_status AS ENUM ('active', 'inactive');
CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'confirmed', 'completed', 'no_show',
  'excused_absence', 'professional_absence', 'cancelled'
);

CREATE TABLE clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  tax_id text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, email)
);

CREATE TABLE professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  user_id uuid REFERENCES users(id),
  full_name text NOT NULL,
  crefito text NOT NULL,
  specialty text NOT NULL,
  color char(7) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, crefito)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 15),
  price_in_cents integer NOT NULL CHECK (price_in_cents >= 0),
  color char(7) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  record_number text NOT NULL,
  full_name text NOT NULL,
  cpf text,
  email text,
  phone text NOT NULL,
  birth_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  status patient_status NOT NULL DEFAULT 'active',
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, record_number),
  UNIQUE NULLS NOT DISTINCT (clinic_id, cpf)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  room_id uuid NOT NULL REFERENCES rooms(id),
  service_id uuid NOT NULL REFERENCES services(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes text,
  legacy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX appointments_clinic_period_idx ON appointments (clinic_id, starts_at, ends_at);
CREATE INDEX appointments_professional_period_idx ON appointments (professional_id, starts_at, ends_at);
CREATE INDEX appointments_room_period_idx ON appointments (room_id, starts_at, ends_at);
CREATE INDEX patients_clinic_name_idx ON patients (clinic_id, lower(full_name));

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_entity_idx ON audit_events (clinic_id, entity_type, entity_id, created_at DESC);

