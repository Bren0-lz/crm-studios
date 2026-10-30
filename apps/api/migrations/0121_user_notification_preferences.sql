-- Preferências do sino de notificações de cada usuário (grupos, faixa, avisos, som, intervalo).
-- Sem linha, valem as preferências padrão definidas nos contratos.
CREATE TABLE user_notification_preferences (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id)
);
