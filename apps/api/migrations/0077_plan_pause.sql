-- Pausa do plano: quando começou, motivo e previsão de retorno. Ao reativar, a validade
-- avança os dias em pausa (decisão do dono, U29).
ALTER TABLE patient_plans
  ADD COLUMN paused_at timestamptz,
  ADD COLUMN pause_reason text,
  ADD COLUMN pause_expected_return date;
