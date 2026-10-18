-- Período da matrícula em turma (QC4): o início é a data (fuso da clínica) de enrolled_at e o
-- cancelamento da matrícula ativa grava o fim. Encontros só listam quem estava matriculado na data.
ALTER TABLE group_enrollments ADD COLUMN ended_at timestamptz;

UPDATE group_enrollments SET ended_at = updated_at WHERE status = 'cancelled';
