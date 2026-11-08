-- Entrega 10 (reunião de 07/11/2026): colunas da planilha sem campo correspondente ("Outros")
-- ficam guardadas como { "título da coluna": "valor" } no cliente e no lead (participante de
-- evento). A gravação mescla com o que já existe (JSON_MERGE_PATCH), sem apagar nada.
ALTER TABLE `patients`
  ADD COLUMN `extra_fields` JSON NOT NULL DEFAULT ('{}');

ALTER TABLE `leads`
  ADD COLUMN `extra_fields` JSON NOT NULL DEFAULT ('{}');
