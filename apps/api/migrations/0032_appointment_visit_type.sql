-- Tipo do atendimento: normal, aula experimental ou avaliação.
ALTER TABLE appointments
  ADD COLUMN visit_type text NOT NULL DEFAULT 'regular'
  CHECK (visit_type IN ('regular', 'trial', 'evaluation'));
