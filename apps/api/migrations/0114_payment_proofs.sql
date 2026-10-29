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
-- Estorno da baixa: os comprovantes ficam no histórico, marcados como da baixa estornada.
ALTER TABLE payment_proofs ADD COLUMN reversed_at timestamptz;
-- Comprovante enviado por engano: sai da lista, mas o registro fica para auditoria.
ALTER TABLE payment_proofs
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id uuid REFERENCES users(id),
  ADD COLUMN deletion_reason text CHECK (deletion_reason IS NULL OR length(deletion_reason) BETWEEN 5 AND 500),
  ADD CONSTRAINT payment_proofs_deletion CHECK ((deleted_at IS NULL) = (deleted_by_user_id IS NULL));
