-- Campanhas automáticas promocionais: a promoção vale por alguns dias a partir da data
-- programada da primeira mensagem e é usada ao agendar. Quem usa pode ficar fora da
-- campanha por um tempo. Cancelar o atendimento desfaz o uso (lido pelo status dele).

-- { "validDays": inteiro, "cooldown": { "amount": inteiro, "unit": "days"|"weeks"|"months" } }
ALTER TABLE auto_campaigns ADD COLUMN promotion jsonb;

-- Último dia em que a promoção vale para o cliente que recebeu a mensagem.
ALTER TABLE auto_campaign_deliveries ADD COLUMN promotion_valid_until date;

CREATE TABLE auto_campaign_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  campaign_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  occurrence_key text NOT NULL CHECK (char_length(occurrence_key) BETWEEN 1 AND 200),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  redeemed_on date NOT NULL,
  blocked_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, campaign_id) REFERENCES auto_campaigns(clinic_id, id)
);

CREATE INDEX auto_campaign_redemptions_clinic_idx
  ON auto_campaign_redemptions (clinic_id, campaign_id, patient_id);
