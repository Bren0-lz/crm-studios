-- Finalização automática de atendimentos (por clínica): desligada por padrão, 1 hora após o término.
ALTER TABLE clinics
  ADD COLUMN auto_finalization_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_finalization_delay_minutes integer NOT NULL DEFAULT 60
    CHECK (auto_finalization_delay_minutes BETWEEN 0 AND 10080),
  ADD COLUMN auto_finalization_updated_at timestamptz;

-- Quando a finalização automática marcou o atendimento como realizado (NULL = pela equipe).
ALTER TABLE appointments ADD COLUMN auto_completed_at timestamptz;

CREATE INDEX appointments_open_ends_at_idx ON appointments (clinic_id, ends_at)
  WHERE status IN ('scheduled', 'confirmed');
