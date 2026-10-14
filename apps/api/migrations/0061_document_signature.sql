ALTER TABLE issued_documents ADD COLUMN manual_signature jsonb;
ALTER TABLE issued_documents ADD COLUMN manual_signature_content bytea;
ALTER TABLE issued_documents ADD CONSTRAINT issued_document_signature_content CHECK((manual_signature IS NULL) = (manual_signature_content IS NULL));
