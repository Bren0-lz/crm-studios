CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  sku text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  cost_in_cents integer NOT NULL CHECK (cost_in_cents >= 0),
  sale_price_in_cents integer NOT NULL CHECK (sale_price_in_cents >= 0),
  current_stock integer NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock integer NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, sku)
);

CREATE TABLE patient_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'receivable', 'cancelled')),
  total_in_cents integer NOT NULL DEFAULT 0 CHECK (total_in_cents >= 0),
  receivable_id uuid REFERENCES receivables(id),
  opened_by_user_id uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX patient_tabs_status_idx ON patient_tabs (clinic_id, status, opened_at DESC);

CREATE TABLE patient_tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  tab_id uuid NOT NULL REFERENCES patient_tabs(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_in_cents integer NOT NULL CHECK (unit_price_in_cents >= 0),
  unit_cost_in_cents integer NOT NULL CHECK (unit_cost_in_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tab_id, product_id)
);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  product_id uuid NOT NULL REFERENCES products(id),
  patient_tab_id uuid REFERENCES patient_tabs(id),
  kind text NOT NULL CHECK (kind IN (
    'initial_stock', 'purchase', 'adjustment_in', 'adjustment_out',
    'loss', 'sale', 'sale_reversal'
  )),
  quantity integer NOT NULL CHECK (quantity <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  notes text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_product_idx
  ON stock_movements (clinic_id, product_id, created_at DESC);
