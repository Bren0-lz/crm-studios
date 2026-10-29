-- Pró-labore do relatório financeiro (por clínica): percentual em centésimos de ponto
-- (1250 = 12,5%) sobre o lucro do caixa ou sobre as entradas do período.
ALTER TABLE clinics
  ADD COLUMN pro_labore_basis_points integer NOT NULL DEFAULT 0
    CHECK (pro_labore_basis_points BETWEEN 0 AND 10000),
  ADD COLUMN pro_labore_base text NOT NULL DEFAULT 'profit'
    CHECK (pro_labore_base IN ('profit', 'revenue')),
  ADD COLUMN pro_labore_updated_at timestamptz;
