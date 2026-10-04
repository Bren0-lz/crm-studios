-- Comissão direto no usuário (T057): uma regra de comissão pode pertencer a um profissional da
-- agenda (como até aqui, tela do Financeiro) OU a um usuário (Administração), nunca aos dois.
--
-- Na geração, um atendimento de profissional ligado a um usuário (professionals.user_id) usa a
-- regra do usuário vigente na data; sem regra do usuário nessa data, usa a do profissional.
--
-- Regras existentes: nada é apagado nem alterado. As regras de profissional já ligado a um
-- usuário são COPIADAS como regras do usuário (mesmo percentual, vigência, ativa e criação), para
-- que a comissão exibida no usuário continue a mesma; as de profissional sem usuário seguem só
-- como regra do profissional. commission_entries continua apontando para as regras de origem.
--
-- Roda dentro de uma transação (runMigrations). Todos os passos podem ser repetidos sem erro.

-- 1) Dono da regra: profissional ou usuário (exatamente um dos dois).
ALTER TABLE commission_rules ALTER COLUMN professional_id DROP NOT NULL;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_owner_check;
ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_owner_check
  CHECK ((professional_id IS NULL) <> (user_id IS NULL));

-- 2) Uma regra por vigência e usuário (a de profissional já tem UNIQUE desde a 0014).
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_user_effective_idx
  ON commission_rules (clinic_id, user_id, effective_from)
  WHERE user_id IS NOT NULL;

-- 3) Copia as regras dos profissionais já ligados a um usuário (sem duplicar ao repetir).
INSERT INTO commission_rules (clinic_id, user_id, percentage, effective_from, active, created_at)
SELECT cr.clinic_id, p.user_id, cr.percentage, cr.effective_from, cr.active, cr.created_at
FROM commission_rules cr
JOIN professionals p ON p.id = cr.professional_id AND p.clinic_id = cr.clinic_id
WHERE p.user_id IS NOT NULL
ON CONFLICT (clinic_id, user_id, effective_from) WHERE user_id IS NOT NULL DO NOTHING;
