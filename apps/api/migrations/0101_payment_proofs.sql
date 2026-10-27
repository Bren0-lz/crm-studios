-- Comprovantes de pagamento/recebimento: vários arquivos por baixa de parcela, despesa paga
-- ou baixa conciliada de comissão. O vínculo é polimórfico; a existência é validada na API.
CREATE TABLE payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  entity_type text NOT NULL CHECK (entity_type IN ('receivable','payable','commission_account_payment')),
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/png','image/jpeg')),
  size_in_bytes integer NOT NULL CHECK (size_in_bytes BETWEEN 1 AND 5242880),
  sha256 text NOT NULL,
  content bytea NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id),
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_proofs_entity_idx ON payment_proofs(clinic_id,entity_type,entity_id,created_at);
