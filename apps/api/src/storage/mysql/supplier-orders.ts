import type {
  ProductSize,
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderItem,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  assertStockSize,
  stockKey,
} from "../../modules/finance/product-stock.js";
import {
  orderStockNotes,
  supplierOrderSku,
} from "../../modules/finance/supplier-orders.js";
import { DomainError } from "../../repository.js";
import type { MysqlRepositoryContext } from "./context.js";
import { bool, json } from "./helpers.js";
import { changeProductStock } from "./product-stock.js";

type OrderRow = Omit<SupplierOrder, "items" | "createdAt"> & {
  createdAt: Date;
};
type OrderItemRow = Omit<SupplierOrderItem, "size"> & {
  orderId: string;
  size: string;
};
type ProductRef = { id: string; name: string; sizes: ProductSize[] };

const orderColumns = `id,clinic_id AS "clinicId",supplier_id AS "supplierId",branch_id AS "branchId",ordered_on AS "orderedOn",number,total_in_cents AS "totalInCents",notes,created_at AS "createdAt"`;
const itemColumns = `i.id,i.order_id AS "orderId",i.product_id AS "productId",p.name AS "productName",i.size,i.quantity,i.unit_cost_in_cents AS "unitCostInCents",i.created_product AS "createdProduct"`;

const mapItem = (row: OrderItemRow): SupplierOrderItem => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  ...(row.size ? { size: row.size as ProductSize } : {}),
  quantity: row.quantity,
  unitCostInCents: row.unitCostInCents,
  createdProduct: Boolean(row.createdProduct),
});

export function createSupplierOrdersRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async listSupplierOrders(clinicId: string, supplierId: string) {
      const supplier = await context.pool.query(
        "SELECT id FROM suppliers WHERE clinic_id=$1 AND id=$2",
        [clinicId, supplierId],
      );
      if (!supplier.rowCount) return null;
      const [orders, items] = await Promise.all([
        context.pool.query<OrderRow>(
          `SELECT ${orderColumns} FROM supplier_orders WHERE clinic_id=$1 AND supplier_id=$2 ORDER BY ordered_on DESC,created_at DESC`,
          [clinicId, supplierId],
        ),
        context.pool.query<OrderItemRow>(
          `SELECT ${itemColumns} FROM supplier_order_items i JOIN supplier_orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 AND o.supplier_id=$2 ORDER BY i.position`,
          [clinicId, supplierId],
        ),
      ]);
      return orders.rows.map((row): SupplierOrder => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        items: items.rows
          .filter((item) => item.orderId === row.id)
          .map(mapItem),
      }));
    },

    async createSupplierOrder(
      clinicId: string,
      actorUserId: string,
      supplierId: string,
      input: SupplierOrderInput,
    ) {
      return context.inTransaction(async (client) => {
        const supplier = await client.query<{ name: string }>(
          "SELECT name FROM suppliers WHERE clinic_id=$1 AND id=$2",
          [clinicId, supplierId],
        );
        if (!supplier.rows[0]) return null;
        // Sem filial na requisição, grava na padrão.
        const branchId = (
          await client.query<{ id: string }>(
            "SELECT id FROM branches WHERE clinic_id=$1 AND (id=$2 OR ($2 IS NULL AND is_default))",
            [clinicId, context.branchWriteId()],
          )
        ).rows[0]?.id;
        if (!branchId)
          throw new DomainError(
            "BRANCH_NOT_FOUND",
            "Filial não encontrada.",
            404,
          );
        const orderId = randomUUID();
        await client.query(
          "INSERT INTO supplier_orders(clinic_id,branch_id,supplier_id,ordered_on,number,total_in_cents,notes,created_by_user_id,id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            clinicId,
            branchId,
            supplierId,
            input.orderedOn,
            input.number,
            input.totalInCents,
            input.notes,
            actorUserId,
            orderId,
          ],
        );
        const notes = orderStockNotes(supplier.rows[0].name, input.number);
        const created = new Map<string, ProductRef>();
        for (const [position, item] of input.items.entries()) {
          let product: ProductRef | undefined;
          let createdProduct = false;
          if (item.productId) {
            const found = await client.query<
              ProductRef & { sameBranch: unknown }
            >(
              `SELECT id,name,sizes,branch_id=$3 AS "sameBranch" FROM products WHERE clinic_id=$1 AND id=$2 AND active FOR UPDATE`,
              [clinicId, item.productId, branchId],
            );
            const row = found.rows[0];
            if (!row)
              throw new DomainError(
                "PRODUCT_NOT_FOUND",
                "Produto não encontrado.",
                404,
              );
            if (!bool(row.sameBranch))
              throw new DomainError(
                "BRANCH_MISMATCH",
                "O produto é de outra filial que não a do pedido.",
                409,
              );
            product = { ...row, sizes: json<ProductSize[]>(row.sizes) };
          } else {
            const key = item.productName!.toLocaleLowerCase("pt-BR");
            const existing = created.has(key)
              ? undefined
              : (
                  await client.query<ProductRef>(
                    `SELECT id,name,sizes FROM products WHERE clinic_id=$1 AND branch_id=$2 AND active AND lower(name)=lower($3) ORDER BY created_at LIMIT 1 FOR UPDATE`,
                    [clinicId, branchId, item.productName],
                  )
                ).rows[0];
            product =
              created.get(key) ??
              (existing
                ? { ...existing, sizes: json<ProductSize[]>(existing.sizes) }
                : undefined);
            if (!product) {
              assertStockSize({ sizes: [] }, item.size);
              const productId = randomUUID();
              await client.query(
                `INSERT INTO products(clinic_id,name,sku,unit,cost_in_cents,sale_price_in_cents,current_stock,branch_id,sizes,id) VALUES($1,$2,$3,'un',$4,NULL,0,$5,'[]',$6)`,
                [
                  clinicId,
                  item.productName,
                  supplierOrderSku(randomUUID()),
                  item.unitCostInCents ?? 0,
                  branchId,
                  productId,
                ],
              );
              product = { id: productId, name: item.productName!, sizes: [] };
              created.set(key, product);
              createdProduct = true;
            }
          }
          assertStockSize(product, item.size);
          const balance = await changeProductStock(
            client,
            clinicId,
            product.id,
            item.size,
            item.quantity,
          );
          await client.query(
            `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id,size) VALUES($1,$2,'purchase',$3,$4,$5,$6,$7)`,
            [
              clinicId,
              product.id,
              item.quantity,
              balance,
              notes,
              actorUserId,
              stockKey(item.size),
            ],
          );
          await client.query(
            "INSERT INTO supplier_order_items(clinic_id,order_id,position,product_id,size,quantity,unit_cost_in_cents,created_product) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              clinicId,
              orderId,
              position,
              product.id,
              stockKey(item.size),
              item.quantity,
              item.unitCostInCents ?? null,
              createdProduct,
            ],
          );
        }
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "supplier.order_created",
          "supplier",
          supplierId,
          { name: supplier.rows[0].name, totalInCents: input.totalInCents },
        );
        const [row] = await client
          .query<OrderRow>(
            `SELECT ${orderColumns} FROM supplier_orders WHERE id=$1`,
            [orderId],
          )
          .then((result) => result.rows);
        const items = await client.query<OrderItemRow>(
          `SELECT ${itemColumns} FROM supplier_order_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 AND i.order_id=$2 ORDER BY i.position`,
          [clinicId, orderId],
        );
        return {
          ...row!,
          createdAt: row!.createdAt.toISOString(),
          items: items.rows.map(mapItem),
        };
      });
    },
  };
}
