-- Descontos e recompensas da folha: o salário fixo não muda pela folha; o que entra ou sai
-- do pagamento do mês fica aqui, com o motivo. `value` é em centavos (`amount`) ou em
-- centésimos de porcentagem do salário fixo (`percent`: 1050 = 10,5%); `amount_in_cents` é o
-- valor calculado na criação, sempre positivo (o tipo dá o sinal). Lançar a folha liga o
-- registro à despesa; desfazer o lançamento solta.
CREATE TABLE `payroll_entries` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `employee_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `competence` CHAR(7) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NOT NULL,
  `value` INT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `payroll_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY payroll_entries_competence_idx (`clinic_id`, `competence`),
  KEY payroll_entries_payable_idx (`payroll_payable_id`),
  CONSTRAINT payroll_entries_kind_check CHECK ((kind IN ('bonus', 'discount'))),
  CONSTRAINT payroll_entries_mode_check CHECK ((mode IN ('amount', 'percent'))),
  CONSTRAINT payroll_entries_value_check CHECK ((value > 0)),
  CONSTRAINT payroll_entries_amount_check CHECK ((amount_in_cents > 0)),
  CONSTRAINT payroll_entries_reason_check CHECK ((CHAR_LENGTH(TRIM(reason)) BETWEEN 3 AND 300)),
  CONSTRAINT payroll_entries_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT payroll_entries_employee_fk FOREIGN KEY (clinic_id, employee_id) REFERENCES payroll_employees (clinic_id, id),
  CONSTRAINT payroll_entries_payroll_payable_id_fkey FOREIGN KEY (payroll_payable_id) REFERENCES payables(id),
  CONSTRAINT payroll_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
