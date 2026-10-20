-- Filiais (rodada 9). A clínica (`clinics`) passa a ser a rede; cada filial tem agenda, salas,
-- profissionais, turmas, financeiro, estoque e comercial próprios. Clientes, serviços, modelos
-- de plano, etiquetas, formulários e contratos continuam compartilhados pela rede.
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  address text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  -- A filial padrão recebe o que é gravado sem filial e não pode ser desativada.
  CHECK (NOT is_default OR active)
);
CREATE UNIQUE INDEX branches_name_idx ON branches (clinic_id, lower(name));
CREATE UNIQUE INDEX branches_default_idx ON branches (clinic_id) WHERE is_default;

INSERT INTO branches (clinic_id, name, is_default)
SELECT id, 'Matriz', true FROM clinics;

-- Toda clínica nova nasce com a filial padrão.
CREATE FUNCTION create_default_branch() RETURNS trigger AS $$
BEGIN
  INSERT INTO branches (clinic_id, name, is_default) VALUES (NEW.id, 'Matriz', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER clinics_default_branch AFTER INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION create_default_branch();

-- Linha gravada sem filial fica na filial padrão da clínica.
CREATE FUNCTION fill_default_branch() RETURNS trigger AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT id INTO NEW.branch_id FROM branches
    WHERE clinic_id = NEW.clinic_id AND is_default;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  scoped text;
BEGIN
  FOREACH scoped IN ARRAY ARRAY[
    'professionals', 'rooms', 'appointments', 'schedule_blocks', 'group_classes',
    'patient_plans', 'receivables', 'payables', 'recurring_payables', 'leads',
    'products', 'patient_tabs', 'external_operations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN branch_id uuid', scoped);
    EXECUTE format(
      'UPDATE %I t SET branch_id = b.id FROM branches b WHERE b.clinic_id = t.clinic_id AND b.is_default',
      scoped
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN branch_id SET NOT NULL', scoped);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (clinic_id, branch_id) REFERENCES branches (clinic_id, id)',
      scoped, scoped || '_branch_fk'
    );
    EXECUTE format('CREATE INDEX %I ON %I (clinic_id, branch_id)', scoped || '_branch_idx', scoped);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_default_branch()',
      scoped || '_default_branch', scoped
    );
  END LOOP;
END;
$$;

-- Acesso às filiais: `all_branches` (padrão, inclusive para os usuários existentes) ou a lista
-- de `user_branches`. Admin sempre acessa todas.
ALTER TABLE users ADD COLUMN all_branches boolean NOT NULL DEFAULT true;
CREATE TABLE user_branches (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  FOREIGN KEY (clinic_id, branch_id) REFERENCES branches (clinic_id, id) ON DELETE CASCADE
);

-- Nomes e códigos únicos passam a valer dentro da filial: cada filial pode ter a sua "Sala 1",
-- o mesmo SKU com estoque próprio e o seu cadastro do profissional.
ALTER TABLE rooms DROP CONSTRAINT rooms_clinic_id_name_key;
ALTER TABLE rooms ADD CONSTRAINT rooms_branch_name_key UNIQUE (clinic_id, branch_id, name);
ALTER TABLE products DROP CONSTRAINT products_clinic_id_sku_key;
ALTER TABLE products ADD CONSTRAINT products_branch_sku_key UNIQUE (clinic_id, branch_id, sku);
ALTER TABLE professionals DROP CONSTRAINT professionals_clinic_id_crefito_key;
ALTER TABLE professionals
  ADD CONSTRAINT professionals_branch_crefito_key UNIQUE (clinic_id, branch_id, crefito);
