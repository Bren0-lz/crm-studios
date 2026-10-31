-- Colaborador da folha passa a nascer do cadastro do usuário ("recebe salário" e quanto): a
-- folha não cadastra mais ninguém. Um colaborador por usuário (NULL = cadastro anterior).
ALTER TABLE `payroll_employees`
  ADD COLUMN `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  ADD UNIQUE KEY payroll_employees_user_idx (`clinic_id`, `user_id`),
  ADD CONSTRAINT payroll_employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
