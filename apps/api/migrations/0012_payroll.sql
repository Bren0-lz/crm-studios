-- Folha de pagamento: colaboradores com salário fixo (e o profissional da agenda, para as
-- comissões). Lançar a folha cria uma despesa por colaborador com salário + comissões +
-- ajustes; pagar a despesa paga as comissões e os ajustes incluídos.
CREATE TABLE `payroll_employees` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `role` LONGTEXT,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `base_salary_in_cents` INT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY payroll_employees_clinic_identity (clinic_id, id),
  KEY payroll_employees_branch_idx (`clinic_id`, `branch_id`),
  -- Um colaborador por profissional: a comissão não entra em duas folhas (NULL não repete).
  UNIQUE KEY payroll_employees_professional_idx (`clinic_id`, `professional_id`),
  CONSTRAINT payroll_employees_name_check CHECK ((CHAR_LENGTH(TRIM(name)) >= 2)),
  CONSTRAINT payroll_employees_base_salary_in_cents_check CHECK ((base_salary_in_cents >= 0)),
  CONSTRAINT payroll_employees_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT payroll_employees_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id),
  CONSTRAINT payroll_employees_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id),
  CONSTRAINT payroll_employees_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- Despesa lançada pela folha: colaborador, competência e quanto é salário e quanto é
-- comissão (comissões + ajustes). Na DRE só o salário entra pela despesa.
ALTER TABLE `payables`
  ADD COLUMN `payroll_employee_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD COLUMN `payroll_competence` CHAR(7),
  ADD COLUMN `payroll_salary_in_cents` INT,
  ADD COLUMN `payroll_commission_in_cents` INT,
  ADD KEY payables_payroll_idx (`clinic_id`, `payroll_competence`),
  ADD CONSTRAINT payables_payroll_employee_fk
    FOREIGN KEY (clinic_id, payroll_employee_id) REFERENCES payroll_employees (clinic_id, id),
  ADD CONSTRAINT payables_payroll_fields CHECK (
    ((payroll_employee_id IS NULL) AND (payroll_competence IS NULL)
      AND (payroll_salary_in_cents IS NULL) AND (payroll_commission_in_cents IS NULL))
    OR ((payroll_employee_id IS NOT NULL) AND (payroll_competence IS NOT NULL)
      AND (payroll_salary_in_cents IS NOT NULL) AND (payroll_commission_in_cents IS NOT NULL))
  );

-- Comissão e ajuste incluídos numa despesa da folha (o pagamento segue a despesa).
ALTER TABLE `commission_entries`
  ADD COLUMN `payroll_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD KEY commission_entries_payroll_idx (`payroll_payable_id`),
  ADD CONSTRAINT commission_entries_payroll_payable_id_fkey FOREIGN KEY (payroll_payable_id) REFERENCES payables(id);
ALTER TABLE `commission_adjustments`
  ADD COLUMN `payroll_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD KEY commission_adjustments_payroll_idx (`payroll_payable_id`),
  ADD CONSTRAINT commission_adjustments_payroll_payable_id_fkey FOREIGN KEY (payroll_payable_id) REFERENCES payables(id);

-- O pagamento de comissão passa a ser feito pela folha: quem pagava comissão ganha acesso à
-- folha.
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'finance.payroll_view')
WHERE JSON_CONTAINS(permissions, '"finance.commissions_pay"')
  AND NOT JSON_CONTAINS(permissions, '"finance.payroll_view"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'finance.payroll_manage')
WHERE JSON_CONTAINS(permissions, '"finance.commissions_pay"')
  AND NOT JSON_CONTAINS(permissions, '"finance.payroll_manage"');
