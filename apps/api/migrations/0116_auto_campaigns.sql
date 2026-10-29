-- Campanhas automáticas: eventos já detectados pelo sistema (aniversário, plano
-- acabando, parcela vencida…) com várias mensagens, cada uma num momento. Nada é
-- disparado: a equipe envia pelo WhatsApp e registra o envio ou o motivo de não enviar.

CREATE TABLE auto_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  trigger text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- [{ "id": uuid, "offset": inteiro, "message": texto }]
  steps jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (clinic_id, id)
);

CREATE INDEX auto_campaigns_clinic_idx
  ON auto_campaigns (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE auto_campaign_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  campaign_id uuid NOT NULL,
  step_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  occurrence_key text NOT NULL CHECK (char_length(occurrence_key) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('sent', 'skipped')),
  skip_reason text,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  message text NOT NULL,
  handled_by uuid REFERENCES users(id),
  handled_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, campaign_id) REFERENCES auto_campaigns(clinic_id, id),
  UNIQUE (campaign_id, step_id, occurrence_key)
);

CREATE INDEX auto_campaign_deliveries_clinic_idx
  ON auto_campaign_deliveries (clinic_id, campaign_id);
