-- Motivo informado ao cancelar uma venda (comanda); opcional nas vendas antigas.
ALTER TABLE `patient_tabs`
  ADD COLUMN `cancellation_reason` LONGTEXT NULL;
