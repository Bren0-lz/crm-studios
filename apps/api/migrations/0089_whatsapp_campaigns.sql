-- Campanhas de WhatsApp manuais: acervo de mensagens padrão (texto + até 3
-- imagens) e campanhas com o progresso de envio de cada cliente. Nada é
-- disparado pelo sistema: a equipe envia pelo WhatsApp e marca o envio.

CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (clinic_id, id)
);

CREATE INDEX message_templates_clinic_idx
  ON message_templates (clinic_id, updated_at DESC);

-- Imagem trocada no modelo fica com `removed_at` (as campanhas antigas ainda a mostram).
CREATE TABLE message_template_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  template_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 2),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 120),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  data_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  FOREIGN KEY (clinic_id, template_id) REFERENCES message_templates(clinic_id, id)
);

CREATE INDEX message_template_images_template_idx
  ON message_template_images (clinic_id, template_id, position)
  WHERE removed_at IS NULL;

CREATE TABLE whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  template_id uuid NOT NULL,
  template_title text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  body text NOT NULL,
  image_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, template_id) REFERENCES message_templates(clinic_id, id)
);

CREATE INDEX whatsapp_campaigns_clinic_idx
  ON whatsapp_campaigns (clinic_id, created_at DESC);

CREATE TABLE whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  campaign_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id),
  position integer NOT NULL,
  patient_name text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
  handled_at timestamptz,
  handled_by uuid REFERENCES users(id),
  UNIQUE (campaign_id, patient_id),
  FOREIGN KEY (clinic_id, campaign_id) REFERENCES whatsapp_campaigns(clinic_id, id)
);

CREATE INDEX whatsapp_campaign_recipients_campaign_idx
  ON whatsapp_campaign_recipients (clinic_id, campaign_id, position);

-- Quem já envia mensagens individuais passa a poder usar o acervo e as campanhas.
UPDATE users
SET permissions = permissions || ARRAY['communications.templates', 'communications.campaigns']::text[]
WHERE 'communications.messages' = ANY(permissions)
  AND NOT ('communications.campaigns' = ANY(permissions));
