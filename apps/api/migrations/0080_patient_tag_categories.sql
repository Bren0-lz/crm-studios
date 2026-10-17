-- V3: categoria opcional da etiqueta (financeiro, serviço, status). A cor da categoria só vale
-- quando a etiqueta não tem cor própria; a cor manual continua valendo.
ALTER TABLE patient_tags
  ADD COLUMN category text CHECK (category IN ('financial', 'service', 'status'));
