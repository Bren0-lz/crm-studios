-- Profissional (opcional) que assina o documento emitido; o nome e o CREFITO
-- ficam no snapshot do conteúdo, a coluna só registra o vínculo.
ALTER TABLE issued_documents
  ADD COLUMN professional_id uuid REFERENCES professionals(id);
