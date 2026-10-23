ALTER TABLE document_templates ADD COLUMN content jsonb;
ALTER TABLE issued_documents ADD COLUMN snapshot_content jsonb;
ALTER TABLE issued_documents ADD COLUMN branding jsonb;
