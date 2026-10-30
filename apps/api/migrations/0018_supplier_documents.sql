-- Documento para assinatura também com fornecedor: quem assina é um cliente ou um fornecedor.
ALTER TABLE `issued_documents` MODIFY COLUMN `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE `issued_documents`
  ADD COLUMN `supplier_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD KEY issued_documents_supplier_idx (`clinic_id`, `supplier_id`, `created_at`),
  ADD CONSTRAINT issued_documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  ADD CONSTRAINT issued_document_signer CHECK (((patient_id IS NULL) <> (supplier_id IS NULL))),
  ADD CONSTRAINT issued_document_supplier_without_plan CHECK (((supplier_id IS NULL) OR (plan_id IS NULL)));
