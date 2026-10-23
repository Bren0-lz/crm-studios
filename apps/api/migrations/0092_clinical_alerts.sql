-- Alertas clínicos fixados no topo do prontuário (contraindicação, alergia, cuidado).
-- Remover = arquivar (archived_at), para manter o rastro de quem registrou o quê.
CREATE TABLE clinical_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  text text NOT NULL CHECK (length(text) BETWEEN 3 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX clinical_alerts_patient_idx
  ON clinical_alerts (clinic_id, patient_id)
  WHERE archived_at IS NULL;

CREATE TRIGGER clinical_alerts_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_alerts FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.alert_created','Alerta clínico registrado','Alerta clínico');
