-- Preço de venda opcional: produto recebido de fornecedor entra sem preço e só pode ser vendido depois de definido.
ALTER TABLE products ALTER COLUMN sale_price_in_cents DROP NOT NULL;

-- Pedidos feitos aos fornecedores: valor total e itens, que entram no estoque como compra.
CREATE TABLE supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  ordered_on date NOT NULL,
  number text NOT NULL DEFAULT '',
  total_in_cents integer NOT NULL CHECK (total_in_cents >= 0),
  notes text NOT NULL DEFAULT '',
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_orders_supplier_idx ON supplier_orders(clinic_id, supplier_id, ordered_on DESC);

CREATE TABLE supplier_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  order_id uuid NOT NULL REFERENCES supplier_orders(id),
  position integer NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  size text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost_in_cents integer CHECK (unit_cost_in_cents >= 0),
  created_product boolean NOT NULL DEFAULT false
);
CREATE INDEX supplier_order_items_order_idx ON supplier_order_items(clinic_id, order_id, position);
