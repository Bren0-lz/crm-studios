CREATE TABLE document_signature_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES issued_documents(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (length(token) >= 32),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Validade do link (7 dias). Vencido sem assinatura, um novo envio troca o token e o prazo.
  expires_at timestamptz NOT NULL,
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  views jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_at timestamptz,
  signature jsonb,
  signature_image text,
  UNIQUE (clinic_id, document_id),
  CHECK (expires_at > created_at),
  CHECK ((signed_at IS NULL) = (signature IS NULL)),
  CHECK ((signed_at IS NULL) = (signature_image IS NULL))
);
