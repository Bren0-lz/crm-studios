import {
  type ProductUpdateInput,
  type PatientTabItemUpdate,
  type PatientTabServiceInput,
  type Supplier,
  type SupplierInput,
  type ManualReceivableInput,
  type FinancialClassification,
  type DreGroup,
  type AppointmentInput,
  type Receivable,
  type PatientTabServiceItem,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { assertCategoryDreGroup, buildDre } from "../../modules/finance/dre.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createFinanceOperationsRepository(
  context: MemoryRepositoryContext,
) {
  const suppliers = context.suppliers;
  const tab = (clinicId: string, id: string) => {
    const item = context.patientTabs.find(
      (item) => item.clinicId === clinicId && item.id === id,
    );
    if (!item)
      throw new DomainError(
        "PATIENT_TAB_NOT_FOUND",
        "Comanda não encontrada.",
        404,
      );
    if (item.status !== "open")
      throw new DomainError(
        "PATIENT_TAB_NOT_OPEN",
        "Somente comandas abertas podem ser alteradas.",
        409,
      );
    return item;
  };
  const total = (item: ReturnType<typeof tab>) => {
    item.totalInCents =
      item.items.reduce((sum, entry) => sum + entry.totalInCents, 0) +
      (item.services ?? []).reduce(
        (sum, entry) => sum + entry.amountInCents,
        0,
      );
  };
  function classification(
    clinicId: string,
    input: {
      categoryId?: string | null | undefined;
      costCenterId?: string | null | undefined;
    },
    expectedKind?: "income" | "expense",
  ) {
    if (
      input.categoryId &&
      !context.financialCategories.some(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.categoryId &&
          (!expectedKind || item.kind === expectedKind),
      )
    )
      throw new DomainError(
        "FINANCE_CATEGORY_NOT_FOUND",
        "Categoria não encontrada.",
        404,
      );
    if (
      input.costCenterId &&
      !context.costCenters.some(
        (item) => item.clinicId === clinicId && item.id === input.costCenterId,
      )
    )
      throw new DomainError(
        "COST_CENTER_NOT_FOUND",
        "Centro de custo não encontrado.",
        404,
      );
  }
  function covered(
    clinicId: string,
    patientId: string,
    serviceId: string,
    startsAt: string,
  ) {
    const date = clinicDateOf(
      new Date(startsAt),
      context.clinicSettings.timezone,
    );
    return context.patientPlans.some(
      (item) =>
        item.clinicId === clinicId &&
        item.patientId === patientId &&
        item.status === "active" &&
        !item.sourceTabId &&
        item.validFrom <= date &&
        (!item.validUntil || item.validUntil >= date) &&
        item.services.some((entry) => entry.serviceId === serviceId),
    );
  }
  const operations = {
    async updateProduct(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: ProductUpdateInput,
    ) {
      const item = context.products.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!item) return null;
      if (
        context.products.some(
          (entry) =>
            entry.clinicId === clinicId &&
            entry.id !== id &&
            context.branchOf(entry) === context.branchOf(item) &&
            entry.sku.toLocaleLowerCase() === input.sku.toLocaleLowerCase(),
        )
      )
        throw new DomainError(
          "PRODUCT_SKU_EXISTS",
          "Já existe um produto com este SKU.",
          409,
        );
      for (const [key, kind] of [
        ["categoryId", "product_category"],
        ["brandId", "product_brand"],
      ] as const)
        if (
          input[key] &&
          !(await context.operations.listClinicCatalog(clinicId, kind)).some(
            (entry) => entry.id === input[key],
          )
        )
          throw new DomainError(
            "CATALOG_NOT_FOUND",
            "Classificação do produto não encontrada.",
            404,
          );
      Object.assign(item, input, {
        updatedAt: now(),
        lowStock: item.currentStock <= 0,
      });
      context.recordAudit(
        clinicId,
        actorUserId,
        "product.updated",
        "product",
        { name: item.name },
        id,
      );
      return { ...item };
    },
    async updatePatientTabItem(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      itemId: string,
      input: PatientTabItemUpdate | null,
    ) {
      const current = tab(clinicId, tabId),
        item = current.items.find((entry) => entry.id === itemId);
      if (!item)
        throw new DomainError(
          "PATIENT_TAB_ITEM_NOT_FOUND",
          "Item não encontrado.",
          404,
        );
      const product = context.products.find(
        (entry) => entry.clinicId === clinicId && entry.id === item.productId,
      )!;
      if (input && input.quantity * input.unitPriceInCents > 2147483647)
        throw new DomainError(
          "TAB_TOTAL_TOO_LARGE",
          "O valor do item excede o limite permitido.",
          400,
        );
      const projected =
        current.totalInCents -
        item.totalInCents +
        (input ? input.quantity * input.unitPriceInCents : 0);
      if (projected > 2147483647)
        throw new DomainError(
          "TAB_TOTAL_TOO_LARGE",
          "O valor da comanda excede o limite permitido.",
          400,
        );
      const delta = (input?.quantity ?? 0) - item.quantity;
      if (delta > product.currentStock)
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "O estoque disponível é insuficiente.",
          409,
        );
      product.currentStock -= delta;
      product.lowStock = product.currentStock <= 0;
      product.updatedAt = now();
      if (delta)
        context.pushStockMovement(
          product,
          delta > 0 ? "sale" : "sale_reversal",
          -delta,
          "Ajuste de item na comanda",
          tabId,
        );
      if (input) {
        item.quantity = input.quantity;
        item.unitPriceInCents = input.unitPriceInCents;
        item.totalInCents = item.quantity * item.unitPriceInCents;
      } else current.items.splice(current.items.indexOf(item), 1);
      total(current);
      context.recordAudit(
        clinicId,
        actorUserId,
        "tab.item_updated",
        "patient_tab",
        { itemId },
        tabId,
      );
      return structuredClone(current);
    },
    async addPatientTabService(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: PatientTabServiceInput,
    ) {
      const current = tab(clinicId, tabId),
        appointment = context.appointments.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.appointmentId &&
            item.patientId === current.patientId &&
            item.status !== "cancelled",
        );
      if (
        appointment &&
        !["scheduled", "confirmed"].includes(appointment.status)
      )
        throw new DomainError(
          "TAB_SERVICE_NOT_SCHEDULED",
          "Selecione um atendimento agendado para o serviço avulso.",
          409,
        );
      if (!appointment)
        throw new DomainError(
          "APPOINTMENT_NOT_FOUND",
          "Atendimento do cliente não encontrado.",
          404,
        );
      context.sameBranch(
        "O atendimento é de outra filial que não a da comanda.",
        current,
        appointment,
      );
      if (
        covered(
          clinicId,
          current.patientId,
          appointment.serviceId,
          appointment.startsAt,
        ) ||
        context.patientTabs.some(
          (item) =>
            item.clinicId === clinicId &&
            item.services?.some(
              (entry) => entry.appointmentId === appointment.id,
            ),
        )
      )
        throw new DomainError(
          "APPOINTMENT_ALREADY_BILLED",
          "O atendimento pertence a um plano ou outra comanda.",
          409,
        );
      const service = context.services.find(
        (item) =>
          item.clinicId === clinicId && item.id === appointment.serviceId,
      )!;
      const entry: PatientTabServiceItem = {
        id: uuid(),
        appointmentId: appointment.id,
        serviceId: service.id,
        serviceName: service.name,
        professionalId: appointment.professionalId,
        professionalName: appointment.professionalName,
        amountInCents: input.amountInCents ?? service.priceInCents,
      };
      if (current.totalInCents + entry.amountInCents > 2147483647)
        throw new DomainError(
          "TAB_TOTAL_TOO_LARGE",
          "O valor da comanda excede o limite permitido.",
          400,
        );
      current.services ??= [];
      current.services.push(entry);
      total(current);
      context.recordAudit(
        clinicId,
        actorUserId,
        "tab.service_added",
        "patient_tab",
        { appointmentId: appointment.id },
        tabId,
      );
      return structuredClone(current);
    },
    async removePatientTabService(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      itemId: string,
    ) {
      const current = tab(clinicId, tabId);
      const item = current.services?.find((entry) => entry.id === itemId);
      if (!item)
        throw new DomainError(
          "PATIENT_TAB_ITEM_NOT_FOUND",
          "Serviço não encontrado.",
          404,
        );
      current.services = current.services!.filter(
        (entry) => entry.id !== itemId,
      );
      total(current);
      context.recordAudit(
        clinicId,
        actorUserId,
        "tab.service_removed",
        "patient_tab",
        { itemId },
        tabId,
      );
      return structuredClone(current);
    },
    async createPatientTabAppointment(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: Omit<AppointmentInput, "patientId">,
    ) {
      const current = tab(clinicId, tabId);
      if (covered(clinicId, current.patientId, input.serviceId, input.startsAt))
        throw new DomainError(
          "APPOINTMENT_ALREADY_BILLED",
          "Este serviço está coberto por um plano vigente.",
          409,
        );
      let insertedId: string | undefined;
      try {
        const appointment = await context.operations.createAppointment(
          clinicId,
          { ...input, patientId: current.patientId },
        );
        insertedId = appointment.id;
        return await operations.addPatientTabService(
          clinicId,
          actorUserId,
          tabId,
          { appointmentId: appointment.id },
        );
      } catch (error) {
        if (insertedId) {
          const index = context.appointments.findIndex(
            (item) => item.id === insertedId && item.clinicId === clinicId,
          );
          if (index >= 0) context.appointments.splice(index, 1);
        }
        throw error;
      }
    },
    async listSuppliers(clinicId: string) {
      return structuredClone(
        suppliers
          .filter((item) => item.clinicId === clinicId)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
    },
    async saveSupplier(
      clinicId: string,
      actorUserId: string,
      input: SupplierInput,
      id?: string,
    ) {
      const current = suppliers.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (id && !current) return null;
      const item: Supplier = {
        ...input,
        id: current?.id ?? uuid(),
        clinicId,
        createdAt: current?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (current) Object.assign(current, item);
      else suppliers.push(item);
      context.recordAudit(
        clinicId,
        actorUserId,
        "supplier.saved",
        "supplier",
        { name: item.name },
        item.id,
      );
      return { ...item };
    },
    async createManualReceivable(
      clinicId: string,
      actorUserId: string,
      input: ManualReceivableInput,
    ) {
      const patient = context.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.patientId &&
          !item.mergedIntoPatientId,
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      classification(clinicId, input, "income");
      const item: Receivable = {
        ...input,
        id: uuid(),
        clinicId,
        branchId: context.writeBranchId(clinicId),
        patientName: patient.fullName,
        source: "manual",
        postedOn:
          input.postedOn ??
          clinicDateOf(new Date(), context.clinicSettings.timezone),
        competence:
          input.competence ??
          clinicDateOf(new Date(), context.clinicSettings.timezone).slice(0, 7),
        installmentNumber: 1,
        installmentCount: 1,
        status: "open",
        overdue:
          input.dueDate <
          clinicDateOf(new Date(), context.clinicSettings.timezone),
        createdAt: now(),
        updatedAt: now(),
      };
      context.receivables.push(item);
      context.recordAudit(
        clinicId,
        actorUserId,
        "receivable.created",
        "receivable",
        { amountInCents: item.amountInCents },
        item.id,
      );
      return { ...item };
    },
    async classifyFinancialEntry(
      clinicId: string,
      actorUserId: string,
      kind: "receivable" | "payable",
      id: string,
      input: FinancialClassification,
    ) {
      classification(
        clinicId,
        input,
        kind === "receivable" ? "income" : "expense",
      );
      if (
        kind === "payable" &&
        (input.categoryId === null || input.costCenterId === null)
      )
        throw new DomainError(
          "FINANCE_CLASSIFICATION_REQUIRED",
          "Despesas exigem categoria e centro de custo.",
          400,
        );
      const item =
        kind === "receivable"
          ? context.receivables.find(
              (item) => item.clinicId === clinicId && item.id === id,
            )
          : context.payables.find(
              (item) => item.clinicId === clinicId && item.id === id,
            );
      if (!item)
        throw new DomainError(
          "FINANCE_ENTRY_NOT_FOUND",
          "Lançamento não encontrado.",
          404,
        );
      if (
        kind === "payable" &&
        "commissionId" in item &&
        item.commissionId &&
        context.commissions.find(
          (commission) =>
            commission.clinicId === clinicId &&
            commission.id === item.commissionId,
        )?.competence !== input.competence
      )
        throw new DomainError(
          "COMMISSION_COMPETENCE_MISMATCH",
          "A despesa de comissão deve preservar a competência da origem.",
          400,
        );
      if (kind === "receivable") {
        const receivable = item as Receivable;
        receivable.competence = input.competence;
        if (input.categoryId !== undefined)
          receivable.categoryId = input.categoryId ?? undefined;
        if (input.costCenterId !== undefined)
          receivable.costCenterId = input.costCenterId ?? undefined;
      } else {
        Object.assign(item, {
          dreCompetence: input.competence,
          ...(input.categoryId
            ? {
                categoryId: input.categoryId,
                categoryName: context.financialCategories.find(
                  (c) => c.clinicId === clinicId && c.id === input.categoryId,
                )!.name,
              }
            : {}),
          ...(input.costCenterId
            ? {
                costCenterId: input.costCenterId,
                costCenterName: context.costCenters.find(
                  (c) => c.clinicId === clinicId && c.id === input.costCenterId,
                )!.name,
              }
            : {}),
        });
      }
      context.recordAudit(
        clinicId,
        actorUserId,
        "finance.classified",
        kind,
        { ...input },
        id,
      );
      return { ...item };
    },
    async setCategoryDreGroup(
      clinicId: string,
      actorUserId: string,
      id: string,
      dreGroup: DreGroup,
    ) {
      const item = context.financialCategories.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!item) return null;
      assertCategoryDreGroup(item.kind, dreGroup);
      item.dreGroup = dreGroup;
      context.recordAudit(
        clinicId,
        actorUserId,
        "category.dre_group",
        "financial_category",
        { dreGroup },
        id,
      );
      return { ...item };
    },
    async getDreReport(
      clinicId: string,
      from: string,
      to: string,
      costCenterId?: string,
    ) {
      const scope = <T extends { clinicId: string }>(items: T[]) =>
        items.filter((item) => item.clinicId === clinicId);
      const inBranch = <T extends { clinicId: string; branchId?: string }>(
        items: T[],
      ) => scope(items).filter((item) => context.inBranchScope(item));
      const byProfessional = <
        T extends { clinicId: string; professionalId: string },
      >(
        items: T[],
      ) =>
        scope(items).filter((item) =>
          context.professionalInBranchScope(item.professionalId),
        );
      return buildDre(
        from,
        to,
        inBranch(context.receivables),
        inBranch(context.payables),
        scope(context.financialCategories),
        byProfessional(context.commissions),
        inBranch(context.patientTabs),
        costCenterId,
        context.clinicSettings.timezone,
        byProfessional(context.commissionAdjustments),
      );
    },
  };
  return operations;
}
