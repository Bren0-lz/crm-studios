CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('service','product')),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','contacted','served','cancelled')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL)
    OR (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  ),
  FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id)
);
CREATE TRIGGER waitlist_entries_default_branch BEFORE INSERT ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION fill_default_branch();
CREATE INDEX waitlist_entries_list_idx ON waitlist_entries(clinic_id, branch_id, created_at);

-- Quem consulta clientes passa a ver a lista de espera; quem cadastra clientes também a gerencia.
UPDATE users SET permissions = array_append(permissions, 'waitlist.view')
WHERE permissions @> ARRAY['patients.view']::text[]
  AND NOT permissions @> ARRAY['waitlist.view']::text[];
UPDATE users SET permissions = array_append(permissions, 'waitlist.manage')
WHERE permissions @> ARRAY['patients.create','waitlist.view']::text[]
  AND NOT permissions @> ARRAY['waitlist.manage']::text[];
