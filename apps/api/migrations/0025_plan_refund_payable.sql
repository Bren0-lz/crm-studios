-- Estorno do cancelamento lançado no Financeiro: conta paga ligada ao plano cancelado.
ALTER TABLE `patient_plans`
  ADD COLUMN `refund_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT patient_plans_refund_payable_id_fkey FOREIGN KEY (refund_payable_id) REFERENCES payables(id);
