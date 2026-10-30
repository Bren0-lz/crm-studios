import type {
  Product,
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderItem,
} from "@crm/contracts";
import { assertStockSize } from "../../modules/finance/product-stock.js";
import {
  orderStockNotes,
  supplierOrderSku,
} from "../../modules/finance/supplier-orders.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createSupplierOrdersRepository(
  context: MemoryRepositoryContext,
) {
  return {
    async listSupplierOrders(clinicId: string, supplierId: string) {
      if (
        !context.suppliers.some(
          (item) => item.clinicId === clinicId && item.id === supplierId,
        )
      )
        return null;
      return structuredClone(
        context.supplierOrders
          .filter(
            (item) =>
              item.clinicId === clinicId && item.supplierId === supplierId,
          )
          .map((order) => ({
            ...order,
            items: order.items.map((item) => ({
              ...item,
              productName:
                context.products.find(
                  (product) => product.id === item.productId,
                )?.name ?? item.productName,
            })),
          }))
          .sort(
            (a, b) =>
              b.orderedOn.localeCompare(a.orderedOn) ||
              b.createdAt.localeCompare(a.createdAt),
          ),
      );
    },

    async createSupplierOrder(
      clinicId: string,
      actorUserId: string,
      supplierId: string,
      input: SupplierOrderInput,
    ) {
      const supplier = context.suppliers.find(
        (item) => item.clinicId === clinicId && item.id === supplierId,
      );
      if (!supplier) return null;
      const branchId = context.writeBranchId(clinicId);
      // Valida tudo antes de mutar: um item inválido não deixa produto nem estoque pela metade.
      const lines = input.items.map((item) => {
        const product = item.productId
          ? context.products.find(
              (candidate) =>
                candidate.clinicId === clinicId &&
                candidate.id === item.productId &&
                candidate.active,
            )
          : context.products.find(
              (candidate) =>
                candidate.clinicId === clinicId &&
                candidate.active &&
                context.branchOf(candidate) === branchId &&
                candidate.name.toLocaleLowerCase("pt-BR") ===
                  item.productName!.toLocaleLowerCase("pt-BR"),
            );
        if (item.productId && !product)
          throw new DomainError(
            "PRODUCT_NOT_FOUND",
            "Produto não encontrado.",
            404,
          );
        if (product) {
          context.sameBranch(
            "O produto é de outra filial que não a do pedido.",
            { clinicId, branchId },
            product,
          );
          assertStockSize(product, item.size);
        } else assertStockSize({ sizes: [] }, item.size);
        return { item, product };
      });
      const created = new Map<string, Product>();
      const timestamp = now();
      const items: SupplierOrderItem[] = lines.map(({ item, product }) => {
        let target = product;
        let createdProduct = false;
        if (!target) {
          const key = item.productName!.toLocaleLowerCase("pt-BR");
          target = created.get(key);
          if (!target) {
            target = {
              name: item.productName!,
              sku: uniqueSku(clinicId, branchId),
              unit: "un",
              costInCents: item.unitCostInCents ?? 0,
              salePriceInCents: null,
              restockAlertAt: null,
              sizes: [],
              sizeStock: [],
              branchId,
              id: uuid(),
              clinicId,
              currentStock: 0,
              lowStock: true,
              active: true,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            context.products.push(target);
            context.refreshProductStock(target);
            created.set(key, target);
            createdProduct = true;
          }
        }
        context.changeProductStock(target, item.size, item.quantity);
        context.pushStockMovement(
          target,
          "purchase",
          item.quantity,
          orderStockNotes(supplier.name, input.number),
          undefined,
          item.size,
        );
        return {
          id: uuid(),
          productId: target.id,
          productName: target.name,
          ...(item.size ? { size: item.size } : {}),
          quantity: item.quantity,
          unitCostInCents: item.unitCostInCents ?? null,
          createdProduct,
        };
      });
      const order: SupplierOrder = {
        id: uuid(),
        clinicId,
        supplierId,
        branchId,
        orderedOn: input.orderedOn,
        number: input.number,
        totalInCents: input.totalInCents,
        notes: input.notes,
        items,
        createdAt: timestamp,
      };
      context.supplierOrders.push(order);
      context.recordAudit(
        clinicId,
        actorUserId,
        "supplier.order_created",
        "supplier",
        { name: supplier.name, totalInCents: order.totalInCents },
        supplier.id,
      );
      return structuredClone(order);
    },
  };

  function uniqueSku(clinicId: string, branchId: string) {
    for (;;) {
      const sku = supplierOrderSku(uuid());
      if (
        !context.products.some(
          (item) =>
            item.clinicId === clinicId &&
            context.branchOf(item) === branchId &&
            item.sku.toLocaleLowerCase() === sku.toLocaleLowerCase(),
        )
      )
        return sku;
    }
  }
}
