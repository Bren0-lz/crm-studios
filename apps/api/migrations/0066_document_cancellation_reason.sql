-- Motivo do cancelamento de contrato (E7c): informado ao cancelar e mostrado no Histórico.
-- Nulo nos contratos cancelados antes desta migração.
ALTER TABLE `issued_documents`
  ADD COLUMN `cancellation_reason` LONGTEXT NULL;
