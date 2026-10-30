import type { ProductSize } from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import { stockKey } from "../../modules/finance/product-stock.js";
import { DomainError } from "../../repository.js";
import { writeAndRead } from "./sql.js";

/** Saldo atual de uma chave de estoque do produto (0 quando ainda não existe). */
export async function productStockOf(
  client: PoolClient,
  productId: string,
  size: ProductSize | undefined,
) {
  const result = await client.query<{ stock: number }>(
    "SELECT current_stock AS stock FROM product_stock WHERE product_id=$1 AND size=$2",
    [productId, stockKey(size)],
  );
  return result.rows[0]?.stock ?? 0;
}

/**
 * Soma `delta` ao saldo do tamanho e ao total do produto (recusa saldo negativo) e devolve o
 * novo saldo do tamanho. Quem chama já travou a linha do produto na mesma transação.
 */
export async function changeProductStock(
  client: PoolClient,
  clinicId: string,
  productId: string,
  size: ProductSize | undefined,
  delta: number,
) {
  await client.query(
    "INSERT INTO product_stock(clinic_id,product_id,size) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE product_id=product_id",
    [clinicId, productId, stockKey(size)],
  );
  const result = await writeAndRead<{ balance: number }>(
    client,
    "UPDATE product_stock SET current_stock=current_stock+$3 WHERE product_id=$1 AND size=$2 AND current_stock+$3>=0",
    [productId, stockKey(size), delta],
    "SELECT current_stock AS balance FROM product_stock WHERE product_id=$1 AND size=$2",
  );
  if (!result.rows[0])
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      "O estoque disponível é insuficiente.",
      409,
    );
  await client.query(
    "UPDATE products SET current_stock=current_stock+$3,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
    [clinicId, productId, delta],
  );
  return result.rows[0].balance;
}
