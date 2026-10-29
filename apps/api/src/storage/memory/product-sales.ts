import type { PatientTab, ProductSaleInput } from "@crm/contracts";
import { DomainError, type ClinicRepository } from "../../repository.js";
import {
  assertSalePrice,
  assertStockSize,
} from "../../modules/finance/product-stock.js";
import type { MemoryRepositoryContext } from "./context.js";

type TabOperations = Pick<
  ClinicRepository,
  | "openPatientTab"
  | "addPatientTabItem"
  | "updatePatientTabItem"
  | "closePatientTab"
>;

/**
 * Venda de produtos em uma etapa: valida tudo antes de mutar e depois reaproveita as operações
 * da comanda (abrir → itens → preço → fechar), para não deixar comanda pela metade em erro.
 */
export function createProductSalesRepository(
  context: MemoryRepositoryContext,
  tabs: TabOperations,
) {
  return {
    async createProductSale(
      clinicId: string,
      actorUserId: string,
      input: ProductSaleInput,
    ): Promise<PatientTab> {
      const patient = context.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.patientId &&
          item.status === "active",
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      const branchId = context.writeBranchId(clinicId);
      let totalInCents = 0;
      for (const item of input.items) {
        const product = context.products.find(
          (candidate) =>
            candidate.clinicId === clinicId &&
            candidate.id === item.productId &&
            candidate.active,
        );
        if (!product)
          throw new DomainError(
            "PRODUCT_NOT_FOUND",
            "Produto não encontrado.",
            404,
          );
        context.sameBranch(
          "O produto é de outra filial que não a da comanda.",
          { clinicId, branchId },
          product,
        );
        assertSalePrice(product);
        assertStockSize(product, item.size);
        if (context.productStockOf(product.id, item.size) < item.quantity)
          throw new DomainError(
            "INSUFFICIENT_STOCK",
            "O estoque disponível é insuficiente.",
            409,
          );
        totalInCents +=
          item.quantity * (item.unitPriceInCents ?? product.salePriceInCents);
      }
      if (totalInCents <= 0)
        throw new DomainError(
          "PATIENT_TAB_CANNOT_CLOSE",
          "A venda precisa ter valor maior que zero.",
          409,
        );
      if (totalInCents > 2147483647)
        throw new DomainError(
          "TAB_TOTAL_TOO_LARGE",
          "O valor da comanda excede o limite permitido.",
          400,
        );
      if (
        (input.categoryId &&
          !context.financialCategories.some(
            (item) =>
              item.clinicId === clinicId && item.id === input.categoryId,
          )) ||
        (input.costCenterId &&
          !context.costCenters.some(
            (item) =>
              item.clinicId === clinicId && item.id === input.costCenterId,
          ))
      )
        throw new DomainError(
          "FINANCE_CONTEXT_NOT_FOUND",
          "Categoria ou centro de custo não encontrado.",
          404,
        );
      const tab = await tabs.openPatientTab(clinicId, actorUserId, {
        patientId: input.patientId,
        notes: input.notes ?? "",
      });
      for (const item of input.items) {
        const updated = (await tabs.addPatientTabItem(
          clinicId,
          actorUserId,
          tab.id,
          {
            productId: item.productId,
            quantity: item.quantity,
            ...(item.size ? { size: item.size } : {}),
          },
        ))!;
        const line = updated.items.find(
          (entry) =>
            entry.productId === item.productId && entry.size === item.size,
        )!;
        if (
          item.unitPriceInCents !== undefined &&
          item.unitPriceInCents !== line.unitPriceInCents
        )
          await tabs.updatePatientTabItem(
            clinicId,
            actorUserId,
            tab.id,
            line.id,
            {
              quantity: item.quantity,
              unitPriceInCents: item.unitPriceInCents,
            },
          );
      }
      const closed = await tabs.closePatientTab(clinicId, actorUserId, tab.id, {
        settlement: input.settlement,
        dueDate: input.dueDate,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.costCenterId ? { costCenterId: input.costCenterId } : {}),
      });
      return structuredClone(closed!);
    },
  };
}
