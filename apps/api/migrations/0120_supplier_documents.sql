-- Documento para assinatura também com fornecedor: quem assina é um cliente ou um fornecedor.
ALTER TABLE issued_documents ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE issued_documents ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE issued_documents ADD CONSTRAINT issued_document_signer
  CHECK ((patient_id IS NULL) <> (supplier_id IS NULL));
ALTER TABLE issued_documents ADD CONSTRAINT issued_document_supplier_without_plan
  CHECK (supplier_id IS NULL OR plan_id IS NULL);
CREATE INDEX issued_documents_supplier_idx
  ON issued_documents (clinic_id, supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;
