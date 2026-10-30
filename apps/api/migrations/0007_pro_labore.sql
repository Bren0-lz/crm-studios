-- Pró-labore do relatório financeiro (por clínica): percentual em centésimos de ponto
-- (1250 = 12,5%) sobre o lucro do caixa ou sobre as entradas do período.
ALTER TABLE `clinics`
  ADD COLUMN `pro_labore_basis_points` INT NOT NULL DEFAULT 0,
  ADD COLUMN `pro_labore_base` VARCHAR(191) NOT NULL DEFAULT 'profit',
  ADD COLUMN `pro_labore_updated_at` DATETIME(6),
  ADD CONSTRAINT clinics_pro_labore_basis_points_check CHECK (((pro_labore_basis_points >= 0) AND (pro_labore_basis_points <= 10000))),
  ADD CONSTRAINT clinics_pro_labore_base_check CHECK ((pro_labore_base IN ('profit', 'revenue')));
