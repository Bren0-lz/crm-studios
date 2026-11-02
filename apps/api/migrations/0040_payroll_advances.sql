-- Vales da folha: adiantamento dado ao colaborador. O vale é um lançamento da folha
-- (`kind = 'advance'`, sempre em reais) que desconta o valor do pagamento da competência e
-- fica ligado à despesa já paga na entrega (`advance_payable_id`), que sai do caixa no dia.
-- O motivo é opcional só no vale.
ALTER TABLE `payroll_entries` DROP CONSTRAINT payroll_entries_kind_check;
ALTER TABLE `payroll_entries`
  ADD CONSTRAINT payroll_entries_kind_check CHECK ((kind IN ('bonus', 'discount', 'advance')));

ALTER TABLE `payroll_entries` DROP CONSTRAINT payroll_entries_reason_check;
ALTER TABLE `payroll_entries`
  ADD CONSTRAINT payroll_entries_reason_check CHECK (
    (CHAR_LENGTH(TRIM(reason)) BETWEEN 3 AND 300)
    OR ((kind = 'advance') AND (CHAR_LENGTH(TRIM(reason)) <= 300))
  );

ALTER TABLE `payroll_entries`
  ADD COLUMN `advance_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE `payroll_entries`
  ADD CONSTRAINT payroll_entries_advance_payable_id_fkey
    FOREIGN KEY (advance_payable_id) REFERENCES payables(id);
ALTER TABLE `payroll_entries`
  ADD UNIQUE KEY payroll_entries_advance_payable_idx (`advance_payable_id`);
ALTER TABLE `payroll_entries`
  ADD CONSTRAINT payroll_entries_advance_check CHECK (
    ((kind = 'advance') = (advance_payable_id IS NOT NULL))
    AND ((kind <> 'advance') OR (mode = 'amount'))
  );
