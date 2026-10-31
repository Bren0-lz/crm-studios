-- Estorno no cancelamento do plano: valor devolvido ao cliente e observação (opcionais).
ALTER TABLE `patient_plans`
  ADD COLUMN `refunded_in_cents` INT NOT NULL DEFAULT 0,
  ADD COLUMN `refund_note` LONGTEXT NULL,
  ADD CONSTRAINT patient_plans_refunded_in_cents_check CHECK ((refunded_in_cents >= 0));
