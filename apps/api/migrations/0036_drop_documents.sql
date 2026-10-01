-- A funcionalidade de documentos (modelos e documentos emitidos) foi removida.
-- issued_documents referencia document_templates, então sai primeiro; índices
-- e FKs das próprias tabelas caem junto. Nenhuma outra tabela aponta para elas.
DROP TABLE IF EXISTS issued_documents;
DROP TABLE IF EXISTS document_templates;
