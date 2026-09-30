-- Atendimento (opcional) que originou o documento, como a declaração de
-- comparecimento emitida pela agenda. Data, horário, serviço e profissional
-- ficam no snapshot do conteúdo; a coluna só registra o vínculo.
ALTER TABLE issued_documents
  ADD COLUMN appointment_id uuid REFERENCES appointments(id);
