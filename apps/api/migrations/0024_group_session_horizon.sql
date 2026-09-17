-- Até quando os encontros de cada turma já foram reservados na agenda.
-- NULL significa que a reserva automática ainda não rodou para a turma.
ALTER TABLE group_classes
  ADD COLUMN sessions_generated_until timestamptz;
