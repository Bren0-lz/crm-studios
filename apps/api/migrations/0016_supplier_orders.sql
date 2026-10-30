-- Preço de venda opcional: produto recebido de fornecedor entra sem preço e só pode ser vendido depois de definido.
ALTER TABLE `products` MODIFY COLUMN `sale_price_in_cents` INT NULL;

-- Pedidos feitos aos fornecedores: valor total e itens, que entram no estoque como compra.
CREATE TABLE `supplier_orders` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `ordered_on` DATE NOT NULL,
  `number` LONGTEXT NOT NULL DEFAULT (''),
  `total_in_cents` INT NOT NULL,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY supplier_orders_supplier_idx (`clinic_id`, `supplier_id`, `ordered_on`),
  CONSTRAINT supplier_orders_total_in_cents_check CHECK ((total_in_cents >= 0)),
  CONSTRAINT supplier_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT supplier_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT supplier_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT supplier_orders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE `supplier_order_items` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `position` INT NOT NULL,
  `product_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `size` VARCHAR(191) NOT NULL DEFAULT '',
  `quantity` INT NOT NULL,
  `unit_cost_in_cents` INT,
  `created_product` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY supplier_order_items_order_idx (`clinic_id`, `order_id`, `position`),
  CONSTRAINT supplier_order_items_quantity_check CHECK ((quantity > 0)),
  CONSTRAINT supplier_order_items_unit_cost_in_cents_check CHECK ((unit_cost_in_cents >= 0)),
  CONSTRAINT supplier_order_items_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT supplier_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES supplier_orders(id),
  CONSTRAINT supplier_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);
