import { receiptWithClinic } from "../../modules/finance/receipt.js";
import {
  prepareTabServiceCredits,
  assertTabCreditsReversible,
  cancelTabCredits,
} from "./tab-service-credits.js";
import type { PaymentTiming, SettlementAdjustments } from "@crm/contracts";
import {
  formatSequenceNumber,
  recurringPayableCompetences,
  recurringPayableDueDate,
  saoPauloToday,
  settlementBreakdown,
  tabReceivableDescription,
  type AdminUserCommissionInput,
  type CommissionRule,
  type CommissionRuleInput,
  type CostCenter,
  type CostCenterInput,
  type DailyCash,
  type FinancialCategory,
  type FinancialCategoryInput,
  type FinancialSummary,
  type FinancialWorkspace,
  type InventoryWorkspace,
  type PatientTab,
  type PatientTabCloseInput,
  type PatientTabInput,
  type PatientTabItemInput,
  type Payable,
  type PayableInput,
  type PaymentMethod,
  type PaymentReceipt,
  type Product,
  type ProductInput,
  type Receivable,
  type ReceivableRenegotiation,
  type ReceivableRenegotiationInput,
  type RecurringPayableInput,
  type StockMovementInput,
} from "@crm/contracts";
import {
  buildDailyCash,
  clinicDateOf,
} from "../../modules/finance/daily-cash.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { addMonths, now, today, uuid } from "./helpers.js";

export function createFinanceRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async setAdminUserCommission(
      clinicId: string,
      actorUserId: string,
      userId: string,
      input: AdminUserCommissionInput,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return null;
      repositoryContext.addUserCommissionRule(
        clinicId,
        actorUserId,
        userId,
        input,
      );
      return repositoryContext.toAdminUser(user);
    },

    async getInventoryWorkspace(clinicId: string): Promise<InventoryWorkspace> {
      const products = repositoryContext.products.filter(
        (item) =>
          item.clinicId === clinicId && repositoryContext.inBranchScope(item),
      );
      const productIds = new Set(products.map((item) => item.id));
      const tabs = repositoryContext.patientTabs.filter(
        (item) =>
          item.clinicId === clinicId && repositoryContext.inBranchScope(item),
      );
      return {
        products,
        movements: repositoryContext.stockMovements
          .filter(
            (item) =>
              item.clinicId === clinicId && productIds.has(item.productId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        tabs: tabs.sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
        lowStockCount: products.filter((item) => item.lowStock).length,
        inventoryCostInCents: products.reduce(
          (sum, item) => sum + item.currentStock * item.costInCents,
          0,
        ),
        openTabsInCents: tabs
          .filter((item) => item.status === "open")
          .reduce((sum, item) => sum + item.totalInCents, 0),
      };
    },

    async createProduct(
      clinicId: string,
      _actorUserId: string,
      input: ProductInput,
    ) {
      const branchId = repositoryContext.writeBranchId(clinicId);
      if (
        repositoryContext.products.some(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.branchOf(item) === branchId &&
            item.sku.toLocaleLowerCase() === input.sku.toLocaleLowerCase(),
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
          !(
            await repositoryContext.operations.listClinicCatalog(clinicId, kind)
          ).some((entry) => entry.id === input[key] && entry.active)
        )
          throw new DomainError(
            "CATALOG_NOT_FOUND",
            "Classificação do produto não encontrada.",
            404,
          );
      const timestamp = now();
      const product: Product = {
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        costInCents: input.costInCents,
        salePriceInCents: input.salePriceInCents,
        branchId,
        id: uuid(),
        clinicId,
        currentStock: input.initialStock,
        lowStock: input.initialStock <= 0,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.products.push(product);
      if (input.initialStock > 0)
        repositoryContext.pushStockMovement(
          product,
          "initial_stock",
          input.initialStock,
          "Estoque inicial",
        );
      return product;
    },

    async createStockMovement(
      clinicId: string,
      _actorUserId: string,
      input: StockMovementInput,
    ) {
      const product = repositoryContext.products.find(
        (item) => item.clinicId === clinicId && item.id === input.productId,
      );
      if (!product)
        throw new DomainError(
          "PRODUCT_NOT_FOUND",
          "Produto não encontrado.",
          404,
        );
      const quantity = ["adjustment_out", "loss"].includes(input.kind)
        ? -input.quantity
        : input.quantity;
      if (product.currentStock + quantity < 0)
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "O estoque disponível é insuficiente.",
          409,
        );
      product.currentStock += quantity;
      product.lowStock = product.currentStock <= 0;
      product.updatedAt = now();
      return repositoryContext.pushStockMovement(
        product,
        input.kind,
        quantity,
        input.notes,
      );
    },

    async openPatientTab(
      clinicId: string,
      _actorUserId: string,
      input: PatientTabInput,
    ) {
      const patient = repositoryContext.patients.find(
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
      const tab: PatientTab = {
        ...input,
        branchId: repositoryContext.writeBranchId(clinicId),
        id: uuid(),
        clinicId,
        patientName: patient.fullName,
        status: "open",
        paymentStatus: "pending",
        totalInCents: 0,
        items: [],
        openedAt: now(),
      };
      repositoryContext.patientTabs.push(tab);
      return tab;
    },

    async addPatientTabItem(
      clinicId: string,
      _actorUserId: string,
      tabId: string,
      input: PatientTabItemInput,
    ) {
      const tab = repositoryContext.patientTabs.find(
        (item) => item.clinicId === clinicId && item.id === tabId,
      );
      if (!tab) return null;
      if (tab.status !== "open")
        throw new DomainError(
          "PATIENT_TAB_NOT_OPEN",
          "Somente comandas abertas podem receber itens.",
          409,
        );
      const product = repositoryContext.products.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.productId &&
          item.active,
      );
      if (!product)
        throw new DomainError(
          "PRODUCT_NOT_FOUND",
          "Produto não encontrado.",
          404,
        );
      repositoryContext.sameBranch(
        "O produto é de outra filial que não a da comanda.",
        tab,
        product,
      );
      if (product.currentStock < input.quantity)
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "O estoque disponível é insuficiente.",
          409,
        );
      const existing = tab.items.find((item) => item.productId === product.id);
      if (existing) {
        existing.quantity += input.quantity;
        existing.totalInCents = existing.quantity * existing.unitPriceInCents;
      } else {
        tab.items.push({
          id: uuid(),
          productId: product.id,
          productName: product.name,
          quantity: input.quantity,
          unitPriceInCents: product.salePriceInCents,
          unitCostInCents: product.costInCents,
          totalInCents: input.quantity * product.salePriceInCents,
        });
      }
      product.currentStock -= input.quantity;
      product.lowStock = product.currentStock <= 0;
      product.updatedAt = now();
      repositoryContext.pushStockMovement(
        product,
        "sale",
        -input.quantity,
        `Reserva na comanda de ${tab.patientName}`,
        tab.id,
      );
      tab.totalInCents =
        tab.items.reduce((sum, item) => sum + item.totalInCents, 0) +
        (tab.services ?? []).reduce((sum, item) => sum + item.amountInCents, 0);
      return tab;
    },

    async closePatientTab(
      clinicId: string,
      _actorUserId: string,
      tabId: string,
      input: PatientTabCloseInput,
    ) {
      const tab = repositoryContext.patientTabs.find(
        (item) => item.clinicId === clinicId && item.id === tabId,
      );
      if (!tab) return null;
      if (
        tab.status !== "open" ||
        (tab.items.length === 0 && !tab.services?.length) ||
        tab.totalInCents <= 0
      )
        throw new DomainError(
          "PATIENT_TAB_CANNOT_CLOSE",
          "A comanda precisa estar aberta e conter ao menos um item.",
          409,
        );
      if (
        (input.categoryId &&
          !repositoryContext.financialCategories.some(
            (item) =>
              item.clinicId === clinicId && item.id === input.categoryId,
          )) ||
        (input.costCenterId &&
          !repositoryContext.costCenters.some(
            (item) =>
              item.clinicId === clinicId && item.id === input.costCenterId,
          ))
      )
        throw new DomainError(
          "FINANCE_CONTEXT_NOT_FOUND",
          "Categoria ou centro de custo não encontrado.",
          404,
        );
      const plans = prepareTabServiceCredits(repositoryContext, tab);
      const timestamp = now();
      const receivable: Receivable = {
        competence: clinicDateOf(
          new Date(timestamp),
          repositoryContext.clinicSettings.timezone,
        ).slice(0, 7),
        postedOn: clinicDateOf(
          new Date(timestamp),
          repositoryContext.clinicSettings.timezone,
        ),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.costCenterId ? { costCenterId: input.costCenterId } : {}),
        id: uuid(),
        clinicId,
        branchId: repositoryContext.branchOf(tab),
        patientId: tab.patientId,
        patientName: tab.patientName,
        description: tabReceivableDescription(
          tab.patientName,
          clinicDateOf(
            new Date(tab.openedAt),
            repositoryContext.clinicSettings.timezone,
          ),
        ),
        installmentNumber: 1,
        installmentCount: 1,
        dueDate: input.dueDate,
        amountInCents: tab.totalInCents,
        status: input.settlement === "paid" ? "paid" : "open",
        ...(input.settlement === "paid"
          ? { paidAt: timestamp, paymentMethod: input.paymentMethod! }
          : {}),
        overdue: input.settlement === "receivable" && input.dueDate < today(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.patientPlans.push(...plans);
      for (const plan of plans)
        repositoryContext.sessionMovements.push({
          id: uuid(),
          planId: plan.id,
          serviceId: plan.serviceId,
          serviceName: plan.serviceName,
          kind: "credit",
          quantity: 1,
          reason: "Crédito do serviço vendido na comanda",
          createdAt: timestamp,
        });
      repositoryContext.receivables.push(receivable);
      if (receivable.status === "paid")
        repositoryContext.receiptEvents.push({
          id: uuid(),
          receivableId: receivable.id,
          kind: "payment",
          occurredAt: timestamp,
          amountInCents: receivable.amountInCents,
          paymentMethod: input.paymentMethod!,
        });
      tab.status = "closed";
      tab.paymentStatus = input.settlement;
      tab.receivableId = receivable.id;
      tab.closedAt = timestamp;
      return tab;
    },

    async cancelPatientTab(
      clinicId: string,
      _actorUserId: string,
      tabId: string,
    ) {
      const tab = repositoryContext.patientTabs.find(
        (item) => item.clinicId === clinicId && item.id === tabId,
      );
      if (!tab) return null;
      if (tab.status === "cancelled")
        throw new DomainError(
          "PATIENT_TAB_ALREADY_CANCELLED",
          "A comanda já foi cancelada.",
          409,
        );
      if (
        tab.receivableId &&
        repositoryContext.receivables.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id === tab.receivableId &&
            item.status === "paid",
        )
      )
        throw new DomainError(
          "PATIENT_TAB_PAYMENT_REVERSAL_REQUIRED",
          "Estorne o pagamento no Financeiro antes de cancelar a comanda.",
          409,
        );
      assertTabCreditsReversible(repositoryContext, tab);
      cancelTabCredits(repositoryContext, tab);
      for (const item of tab.items) {
        const product = repositoryContext.products.find(
          (candidate) => candidate.id === item.productId,
        )!;
        product.currentStock += item.quantity;
        product.lowStock = product.currentStock <= 0;
        product.updatedAt = now();
        repositoryContext.pushStockMovement(
          product,
          "sale_reversal",
          item.quantity,
          `Estorno da comanda de ${tab.patientName}`,
          tab.id,
        );
      }
      if (tab.receivableId) {
        const receivable = repositoryContext.receivables.find(
          (item) => item.id === tab.receivableId,
        );
        if (receivable) {
          receivable.status = "cancelled";
          delete receivable.paidAt;
          delete receivable.paymentMethod;
          receivable.overdue = false;
          receivable.updatedAt = now();
        }
      }
      tab.status = "cancelled";
      tab.paymentStatus = "cancelled";
      tab.cancelledAt = now();
      return tab;
    },

    async getFinancialSummary(clinicId: string): Promise<FinancialSummary> {
      const currentDate = clinicDateOf(
        new Date(),
        repositoryContext.clinicSettings.timezone,
      );
      const month = currentDate.slice(0, 7);
      const receivables = repositoryContext.receivables
        .filter(
          (item) =>
            item.clinicId === clinicId && repositoryContext.inBranchScope(item),
        )
        .map((item) => ({
          ...item,
          overdue: item.status === "open" && item.dueDate < currentDate,
        }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return {
        openInCents: receivables
          .filter((item) => item.status === "open")
          .reduce((sum, item) => sum + item.amountInCents, 0),
        overdueInCents: receivables
          .filter((item) => item.overdue)
          .reduce((sum, item) => sum + item.amountInCents, 0),
        paidThisMonthInCents:
          repositoryContext
            .receivedPayments(clinicId)
            .filter(
              (item) =>
                clinicDateOf(
                  new Date(item.occurredAt),
                  repositoryContext.clinicSettings.timezone,
                ).slice(0, 7) === month,
            )
            .reduce((sum, item) => sum + item.amountInCents, 0) +
          receivables
            .filter(
              (item) =>
                item.status === "paid" &&
                item.paidAt &&
                clinicDateOf(
                  new Date(item.paidAt),
                  repositoryContext.clinicSettings.timezone,
                ).slice(0, 7) === month &&
                !repositoryContext.receiptEvents.some(
                  (event) => event.receivableId === item.id,
                ),
            )
            .reduce((sum, item) => sum + item.amountInCents, 0),
        receivables,
      };
    },

    async settleReceivable(
      clinicId: string,
      _actorUserId: string,
      receivableId: string,
      paymentMethod: PaymentMethod,
      timing?: PaymentTiming,
      adjustments: SettlementAdjustments = {},
    ) {
      const receivable = repositoryContext.receivables.find(
        (item) => item.clinicId === clinicId && item.id === receivableId,
      );
      if (!receivable) return null;
      if (receivable.status !== "open") {
        throw new DomainError(
          "RECEIVABLE_NOT_OPEN",
          "Somente contas abertas podem ser baixadas.",
          409,
        );
      }
      const breakdown = settlementBreakdown(
        receivable.amountInCents,
        adjustments,
      );
      if (breakdown.error)
        throw new DomainError("INVALID_SETTLEMENT", breakdown.error, 400);
      // Pagamento parcial: o saldo vira uma nova parcela aberta do mesmo plano.
      let balanceReceivableId: string | undefined;
      if (breakdown.balanceInCents > 0) {
        const {
          paidAt: _paidAt,
          paymentMethod: _method,
          cashAvailableAt: _available,
          ...base
        } = receivable;
        void _paidAt;
        void _method;
        void _available;
        const dueDate = adjustments.balanceDueDate ?? receivable.dueDate;
        const balance: Receivable = {
          ...base,
          id: uuid(),
          installmentNumber: receivable.planId
            ? Math.max(
                ...repositoryContext.receivables
                  .filter((item) => item.planId === receivable.planId)
                  .map((item) => item.installmentNumber),
              ) + 1
            : receivable.installmentNumber,
          description: `${receivable.description} · saldo`,
          dueDate,
          amountInCents: breakdown.balanceInCents,
          status: "open",
          overdue: dueDate < today(),
          createdAt: now(),
          updatedAt: now(),
        };
        repositoryContext.receivables.push(balance);
        balanceReceivableId = balance.id;
      }
      // A parcela fica com o valor efetivamente quitado nela (DRE por competência).
      receivable.amountInCents = breakdown.receivedInCents;
      receivable.status = "paid";
      receivable.paidAt = timing?.paidAt ?? now();
      if (timing?.availableAt) receivable.cashAvailableAt = timing.availableAt;
      receivable.paymentMethod = paymentMethod;
      receivable.overdue = false;
      receivable.updatedAt = now();
      repositoryContext.receiptEvents.push({
        id: uuid(),
        receivableId,
        kind: "payment",
        occurredAt: receivable.paidAt,
        ...((timing?.availableAt ?? receivable.cashAvailableAt)
          ? { availableAt: timing?.availableAt ?? receivable.cashAvailableAt }
          : {}),
        amountInCents: receivable.amountInCents,
        paymentMethod,
        discountInCents: adjustments.discountInCents ?? 0,
        interestInCents: adjustments.interestInCents ?? 0,
        ...(balanceReceivableId ? { balanceReceivableId } : {}),
      });
      return receivable;
    },

    async reverseReceivablePayment(
      clinicId: string,
      _actorUserId: string,
      receivableId: string,
    ) {
      const receivable = repositoryContext.receivables.find(
        (item) => item.clinicId === clinicId && item.id === receivableId,
      );
      if (!receivable) return null;
      if (receivable.status !== "paid") {
        throw new DomainError(
          "RECEIVABLE_NOT_PAID",
          "Somente pagamentos confirmados podem ser estornados.",
          409,
        );
      }
      receivable.status = "open";
      repositoryContext.receiptEvents.push({
        id: uuid(),
        receivableId,
        kind: "reversal",
        occurredAt: now(),
        amountInCents: -receivable.amountInCents,
      });
      // Estorno de baixa com desconto/juros: a parcela volta a valer sem eles.
      const payment = repositoryContext.receiptEvents
        .filter(
          (item) =>
            item.receivableId === receivableId && item.kind === "payment",
        )
        .at(-1);
      receivable.amountInCents +=
        (payment?.discountInCents ?? 0) - (payment?.interestInCents ?? 0);
      delete receivable.paidAt;
      delete receivable.paymentMethod;
      receivable.overdue = receivable.dueDate < today();
      receivable.updatedAt = now();
      return receivable;
    },

    async adjustReceivable(
      clinicId: string,
      _actorUserId: string,
      receivableId: string,
      amountInCents: number,
      _reason: string,
    ) {
      // The PostgreSQL implementation persists the reason in the immutable
      // financial event. The in-memory adapter still consumes it so both
      // implementations keep the same observable command contract.
      void _reason;
      const receivable = repositoryContext.receivables.find(
        (item) => item.clinicId === clinicId && item.id === receivableId,
      );
      if (!receivable) return null;
      if (receivable.status !== "open")
        throw new DomainError(
          "RECEIVABLE_NOT_OPEN",
          "Somente contas abertas podem ser ajustadas.",
          409,
        );
      receivable.amountInCents = amountInCents;
      receivable.updatedAt = now();
      return receivable;
    },

    async getPaymentReceipt(
      clinicId: string,
      receivableId: string,
    ): Promise<PaymentReceipt | null> {
      const receivable = repositoryContext.receivables.find(
        (item) => item.clinicId === clinicId && item.id === receivableId,
      );
      if (!receivable) return null;
      if (
        receivable.status !== "paid" ||
        !receivable.paidAt ||
        !receivable.paymentMethod
      )
        throw new DomainError(
          "RECEIPT_NOT_AVAILABLE",
          "O recibo fica disponível após a baixa.",
          409,
        );
      const clinic = repositoryContext.clinicSettings;
      const patient = repositoryContext.patients.find(
        (item) =>
          item.clinicId === clinicId && item.id === receivable.patientId,
      );
      const payment = repositoryContext.receiptEvents
        .filter(
          (item) =>
            item.receivableId === receivableId && item.kind === "payment",
        )
        .at(-1);
      // Número do recibo: atribuído na primeira emissão e repetido nas reemissões (QM15).
      let issued = repositoryContext.receiptNumbers.find(
        (item) =>
          item.clinicId === clinicId && item.receivableId === receivableId,
      );
      if (!issued) {
        issued = {
          clinicId,
          receivableId,
          number:
            Math.max(
              0,
              ...repositoryContext.receiptNumbers
                .filter((item) => item.clinicId === clinicId)
                .map((item) => item.number),
            ) + 1,
        };
        repositoryContext.receiptNumbers.push(issued);
      }
      return receiptWithClinic({
        receiptNumber: formatSequenceNumber("REC", issued.number),
        patientName: receivable.patientName,
        patientPhone: patient?.whatsapp || patient?.phone || "",
        description: receivable.description,
        amountInCents: receivable.amountInCents,
        paymentMethod: receivable.paymentMethod,
        paidAt: receivable.paidAt,
        clinicName: clinic.name,
        clinicLegalName: clinic.legalName ?? "",
        clinicTaxId: clinic.taxId ?? "",
        clinicAddress: clinic.address ?? "",
        discountInCents: payment?.discountInCents ?? 0,
        interestInCents: payment?.interestInCents ?? 0,
      });
    },

    async getFinancialWorkspace(clinicId: string): Promise<FinancialWorkspace> {
      const summary =
        await repositoryContext.operations.getFinancialSummary(clinicId);
      const currentDate = clinicDateOf(
        new Date(),
        repositoryContext.clinicSettings.timezone,
      );
      const month = currentDate.slice(0, 7);
      const payables = repositoryContext.payables
        .filter(
          (item) =>
            item.clinicId === clinicId && repositoryContext.inBranchScope(item),
        )
        .map((item) => ({
          ...item,
          overdue: item.status === "open" && item.dueDate < currentDate,
        }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const inMonth = (value: string) =>
        clinicDateOf(
          new Date(value),
          repositoryContext.clinicSettings.timezone,
        ).slice(0, 7) === month;
      const receiptCashInCents =
        repositoryContext
          .receivedPayments(clinicId)
          .filter((item) => inMonth(item.availableAt ?? item.occurredAt))
          .reduce((sum, item) => sum + item.amountInCents, 0) +
        repositoryContext.receivables
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              repositoryContext.inBranchScope(item) &&
              item.status === "paid" &&
              item.paidAt &&
              inMonth(item.cashAvailableAt ?? item.paidAt) &&
              !repositoryContext.receiptEvents.some(
                (event) => event.receivableId === item.id,
              ),
          )
          .reduce((sum, item) => sum + item.amountInCents, 0);
      const payableIds = new Set(payables.map((item) => item.id));
      const expenseEvents = repositoryContext.payablePaymentEvents
        .filter(
          (item) =>
            item.clinicId === clinicId && payableIds.has(item.payableId),
        )
        .map((event) => {
          const correction = repositoryContext.financialDateCorrections
            .filter(
              (item) =>
                item.clinicId === clinicId &&
                item.kind === "payable" &&
                item.eventId === event.id,
            )
            .at(-1);
          return {
            ...event,
            occurredAt: correction?.occurredAt ?? event.occurredAt,
            availableAt:
              correction?.availableAt ?? event.availableAt ?? event.occurredAt,
          };
        });
      const legacyExpenses = payables.filter(
        (item) =>
          item.status === "paid" &&
          item.paidAt &&
          !expenseEvents.some((event) => event.payableId === item.id),
      );
      const paidExpensesThisMonthInCents =
        expenseEvents
          .filter((item) => inMonth(item.occurredAt))
          .reduce((sum, item) => sum + item.amountInCents, 0) +
        legacyExpenses
          .filter((item) => inMonth(item.paidAt!))
          .reduce((sum, item) => sum + item.amountInCents, 0);
      const expenseCashOutInCents =
        expenseEvents
          .filter((item) => inMonth(item.availableAt))
          .reduce((sum, item) => sum + item.amountInCents, 0) +
        legacyExpenses
          .filter((item) => inMonth(item.cashAvailableAt ?? item.paidAt!))
          .reduce((sum, item) => sum + item.amountInCents, 0);
      const commissions = repositoryContext.commissions.filter(
        (item) =>
          item.clinicId === clinicId &&
          repositoryContext.professionalInBranchScope(item.professionalId),
      );
      const commissionIds = new Set(commissions.map((item) => item.id));
      const commissionAdjustments =
        repositoryContext.commissionAdjustments.filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.professionalInBranchScope(item.professionalId),
        );
      const commissionAccountPayments =
        repositoryContext.commissionAccountPayments.filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.professionalInBranchScope(item.professionalId),
        );
      const commissionEvents = repositoryContext.commissionPaymentEvents.filter(
          (item) =>
            item.clinicId === clinicId && commissionIds.has(item.commissionId),
        ),
        tracked = new Set(commissionEvents.map((item) => item.commissionId));
      const paidCommissionsThisMonthInCents =
        commissionEvents
          .filter(
            (item) =>
              clinicDateOf(
                new Date(item.occurredAt),
                repositoryContext.clinicSettings.timezone,
              ).slice(0, 7) === month,
          )
          .reduce((sum, item) => sum + item.amountInCents, 0) +
        commissions
          .filter(
            (item) =>
              item.status === "paid" &&
              item.paidAt &&
              clinicDateOf(
                new Date(item.paidAt),
                repositoryContext.clinicSettings.timezone,
              ).slice(0, 7) === month &&
              !tracked.has(item.id) &&
              !payables.some(
                (expense) =>
                  expense.commissionId === item.id &&
                  expense.status !== "cancelled",
              ),
          )
          .reduce((sum, item) => sum + item.amountInCents, 0);
      return {
        summary,
        categories: repositoryContext.financialCategories.filter(
          (item) => item.clinicId === clinicId && item.active,
        ),
        costCenters: repositoryContext.costCenters.filter(
          (item) => item.clinicId === clinicId && item.active,
        ),
        payables,
        payableOpenInCents: payables
          .filter((item) => item.status === "open")
          .reduce((sum, item) => sum + item.amountInCents, 0),
        payableOverdueInCents: payables
          .filter((item) => item.overdue)
          .reduce((sum, item) => sum + item.amountInCents, 0),
        paidExpensesThisMonthInCents,
        cashBalanceThisMonthInCents:
          receiptCashInCents -
          expenseCashOutInCents -
          paidCommissionsThisMonthInCents,
        ...(commissionAdjustments.length
          ? { commissionAdjustments: structuredClone(commissionAdjustments) }
          : {}),
        ...(commissionAccountPayments.length
          ? {
              commissionAccountPayments: structuredClone(
                commissionAccountPayments,
              ),
            }
          : {}),
        commissionRules: repositoryContext.commissionRules.filter(
          (item) => item.clinicId === clinicId && item.active,
        ),
        commissions,
        paidCommissionsThisMonthInCents,
        commissionOpenInCents:
          commissions
            .filter((item) => item.status === "open")
            .reduce((sum, item) => sum + item.amountInCents, 0) +
          commissionAdjustments
            .filter((item) => item.status === "open")
            .reduce((sum, item) => sum + item.amountInCents, 0),
      };
    },

    async createFinancialCategory(
      clinicId: string,
      input: FinancialCategoryInput,
    ) {
      if (
        repositoryContext.financialCategories.some(
          (item) =>
            item.clinicId === clinicId &&
            item.kind === input.kind &&
            item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
        )
      )
        throw new DomainError(
          "FINANCIAL_CATEGORY_DUPLICATE",
          "Esta categoria já existe.",
          409,
        );
      const category: FinancialCategory = {
        ...input,
        id: uuid(),
        clinicId,
        active: true,
      };
      repositoryContext.financialCategories.push(category);
      return category;
    },

    async createCostCenter(clinicId: string, input: CostCenterInput) {
      if (
        repositoryContext.costCenters.some(
          (item) =>
            item.clinicId === clinicId &&
            item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
        )
      )
        throw new DomainError(
          "COST_CENTER_DUPLICATE",
          "Este centro de custo já existe.",
          409,
        );
      const costCenter: CostCenter = {
        ...input,
        id: uuid(),
        clinicId,
        active: true,
      };
      repositoryContext.costCenters.push(costCenter);
      return costCenter;
    },

    async createPayable(
      clinicId: string,
      _actorUserId: string,
      input: PayableInput,
    ) {
      if (
        input.supplierId &&
        !repositoryContext.suppliers.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.supplierId &&
            item.active,
        )
      )
        throw new DomainError(
          "SUPPLIER_NOT_FOUND",
          "Fornecedor não encontrado.",
          404,
        );
      const category = repositoryContext.financialCategories.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.categoryId &&
          item.kind === "expense" &&
          item.active,
      );
      // Centro de custo é opcional; se informado, precisa existir e estar ativo.
      const costCenter = input.costCenterId
        ? repositoryContext.costCenters.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === input.costCenterId &&
              item.active,
          )
        : undefined;
      if (!category || (input.costCenterId && !costCenter))
        throw new DomainError(
          "FINANCIAL_CLASSIFICATION_NOT_FOUND",
          "Categoria de despesa ou centro de custo não encontrado.",
          404,
        );
      const commission = input.commissionId
        ? repositoryContext.commissions.find(
            (item) =>
              item.clinicId === clinicId && item.id === input.commissionId,
          )
        : undefined;
      if (
        input.commissionId &&
        (!commission ||
          commission.status !== "open" ||
          commission.amountInCents !== input.amountInCents ||
          repositoryContext.payables.some(
            (item) =>
              item.clinicId === clinicId &&
              item.commissionId === input.commissionId &&
              item.status !== "cancelled",
          ))
      )
        throw new DomainError(
          "COMMISSION_EXPENSE_INVALID",
          "Selecione uma comissão aberta, sem despesa vinculada, e preserve seu valor.",
          409,
        );
      if (
        commission &&
        input.dreCompetence &&
        input.dreCompetence !== commission.competence
      )
        throw new DomainError(
          "COMMISSION_COMPETENCE_MISMATCH",
          "A despesa de comissão deve preservar a competência da origem.",
          400,
        );
      const timestamp = now();
      // Despesa de comissão fica na filial do profissional; as demais, na da requisição.
      const professional = commission
        ? repositoryContext.professionals.find(
            (item) => item.id === commission.professionalId,
          )
        : undefined;
      const payable: Payable = {
        ...input,
        ...(commission ? { dreCompetence: commission.competence } : {}),
        branchId: professional
          ? repositoryContext.branchOf(professional)
          : repositoryContext.writeBranchId(clinicId),
        id: uuid(),
        clinicId,
        categoryName: category.name,
        ...(costCenter ? { costCenterName: costCenter.name } : {}),
        postedOn:
          input.postedOn ??
          clinicDateOf(
            new Date(timestamp),
            repositoryContext.clinicSettings.timezone,
          ),
        dreCompetence:
          commission?.competence ??
          input.dreCompetence ??
          clinicDateOf(
            new Date(timestamp),
            repositoryContext.clinicSettings.timezone,
          ).slice(0, 7),
        status: "open",
        overdue: input.dueDate < today(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.payables.push(payable);
      return payable;
    },

    async settlePayable(
      clinicId: string,
      _actorUserId: string,
      payableId: string,
      paymentMethod: PaymentMethod,
      timing?: PaymentTiming,
    ) {
      return repositoryContext.changePayable(
        clinicId,
        payableId,
        "payment",
        paymentMethod,
        timing,
      );
    },

    async reversePayablePayment(
      clinicId: string,
      _actorUserId: string,
      payableId: string,
    ) {
      return repositoryContext.changePayable(
        clinicId,
        payableId,
        "payment_reversal",
      );
    },

    async listRecurringPayables(clinicId: string) {
      return repositoryContext.recurringPayables
        .filter(
          (item) =>
            item.clinicId === clinicId && repositoryContext.inBranchScope(item),
        )
        .map((item) => repositoryContext.toRecurringPayable(item))
        .sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));
    },

    async createRecurringPayable(
      clinicId: string,
      _actorUserId: string,
      input: RecurringPayableInput,
    ) {
      repositoryContext.findExpenseClassification(
        clinicId,
        input.categoryId,
        input.costCenterId,
      );
      const timestamp = now();
      const model = {
        id: uuid(),
        clinicId,
        branchId: repositoryContext.writeBranchId(clinicId),
        ...repositoryContext.recurringPayableFields(input),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.recurringPayables.push(model);
      return repositoryContext.toRecurringPayable(model);
    },

    async updateRecurringPayable(
      clinicId: string,
      _actorUserId: string,
      recurringPayableId: string,
      input: RecurringPayableInput,
    ) {
      const index = repositoryContext.recurringPayables.findIndex(
        (item) => item.clinicId === clinicId && item.id === recurringPayableId,
      );
      const current = repositoryContext.recurringPayables[index];
      if (!current) return null;
      if (
        current.categoryId !== input.categoryId ||
        current.costCenterId !== input.costCenterId
      )
        repositoryContext.findExpenseClassification(
          clinicId,
          input.categoryId,
          input.costCenterId,
        );
      const resumedFromMonth =
        input.active && !current.active
          ? saoPauloToday().slice(0, 7)
          : current.resumedFromMonth;
      const updated = {
        id: current.id,
        clinicId,
        branchId: repositoryContext.branchOf(current),
        ...repositoryContext.recurringPayableFields(input),
        ...(resumedFromMonth ? { resumedFromMonth } : {}),
        createdAt: current.createdAt,
        updatedAt: now(),
      };
      repositoryContext.recurringPayables[index] = updated;
      return repositoryContext.toRecurringPayable(updated);
    },

    async deleteRecurringPayable(clinicId: string, recurringPayableId: string) {
      const index = repositoryContext.recurringPayables.findIndex(
        (item) => item.clinicId === clinicId && item.id === recurringPayableId,
      );
      if (index < 0) return false;
      if (
        repositoryContext.payables.some(
          (item) => item.recurringPayableId === recurringPayableId,
        )
      )
        throw new DomainError(
          "RECURRING_PAYABLE_IN_USE",
          "Esta despesa fixa já gerou contas a pagar. Pause ou encerre em vez de excluir.",
          409,
        );
      repositoryContext.recurringPayables.splice(index, 1);
      return true;
    },

    async generateDueRecurringPayables(clinicId: string) {
      const currentMonth = saoPauloToday().slice(0, 7);
      const currentDate = today();
      let created = 0;
      for (const model of repositoryContext.recurringPayables) {
        if (model.clinicId !== clinicId) continue;
        const generated = new Set(
          repositoryContext.payables
            .filter((item) => item.recurringPayableId === model.id)
            .map((item) => item.competence),
        );
        const category = repositoryContext.financialCategories.find(
          (item) => item.id === model.categoryId,
        );
        const costCenter = repositoryContext.costCenters.find(
          (item) => item.id === model.costCenterId,
        );
        if (!category || !costCenter) continue;
        for (const competence of recurringPayableCompetences(
          model,
          currentMonth,
        )) {
          if (generated.has(competence)) continue;
          const timestamp = now();
          const dueDate = recurringPayableDueDate(competence, model.dayOfMonth);
          repositoryContext.payables.push({
            id: uuid(),
            clinicId,
            branchId: repositoryContext.branchOf(model),
            description: model.description,
            ...(model.supplier ? { supplier: model.supplier } : {}),
            categoryId: model.categoryId,
            costCenterId: model.costCenterId,
            categoryName: category.name,
            costCenterName: costCenter.name,
            dueDate,
            amountInCents: model.amountInCents,
            status: "open",
            overdue: dueDate < currentDate,
            recurringPayableId: model.id,
            competence,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          created += 1;
        }
      }
      return created;
    },

    async renegotiateReceivables(
      clinicId: string,
      _actorUserId: string,
      input: ReceivableRenegotiationInput,
    ) {
      const ids = [...new Set(input.receivableIds)];
      if (ids.length !== input.receivableIds.length)
        throw new DomainError(
          "RENEGOTIATION_DUPLICATE_ITEM",
          "Há parcelas repetidas.",
        );
      const originals = repositoryContext.receivables.filter(
        (item) => item.clinicId === clinicId && ids.includes(item.id),
      );
      if (
        originals.length !== ids.length ||
        originals.some((item) => item.status !== "open")
      )
        throw new DomainError(
          "RENEGOTIATION_INVALID_ITEMS",
          "Selecione somente parcelas abertas.",
          409,
        );
      const patientId = originals[0]!.patientId;
      if (originals.some((item) => item.patientId !== patientId))
        throw new DomainError(
          "RENEGOTIATION_PATIENT_MISMATCH",
          "As parcelas devem pertencer ao mesmo cliente.",
        );
      const branchId = repositoryContext.sameBranch(
        "As parcelas devem ser da mesma filial.",
        ...originals,
      );
      const timestamp = now();
      originals.forEach((item) => {
        item.status = "cancelled";
        item.updatedAt = timestamp;
      });
      const base = Math.floor(input.totalAmountInCents / input.installments);
      const remainder = input.totalAmountInCents % input.installments;
      const patientName = originals[0]!.patientName;
      const renegotiationId = uuid();
      const newReceivables = Array.from(
        { length: input.installments },
        (_, index) => ({
          id: uuid(),
          clinicId,
          branchId,
          patientId,
          patientName,
          description: `Renegociação · ${input.reason}`,
          installmentNumber: index + 1,
          installmentCount: input.installments,
          dueDate: addMonths(input.firstDueDate, index),
          amountInCents: base + (index < remainder ? 1 : 0),
          status: "open" as const,
          overdue: addMonths(input.firstDueDate, index) < today(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
      repositoryContext.receivables.push(...newReceivables);
      const renegotiation: ReceivableRenegotiation = {
        id: renegotiationId,
        clinicId,
        patientId,
        originalAmountInCents: originals.reduce(
          (sum, item) => sum + item.amountInCents,
          0,
        ),
        renegotiatedAmountInCents: input.totalAmountInCents,
        reason: input.reason,
        originalReceivableIds: ids,
        newReceivables,
        createdAt: timestamp,
      };
      repositoryContext.receivableRenegotiations.push(renegotiation);
      return renegotiation;
    },

    async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
      const professional = repositoryContext.professionals.find(
        (item) =>
          item.clinicId === clinicId && item.id === input.professionalId,
      );
      if (!professional)
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
      if (
        repositoryContext.commissionRules.some(
          (item) =>
            item.professionalId === input.professionalId &&
            item.effectiveFrom === input.effectiveFrom,
        )
      )
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Já existe uma regra nesta vigência.",
          409,
        );
      const rule: CommissionRule = {
        ...input,
        id: uuid(),
        clinicId,
        professionalName: professional.fullName,
        active: true,
        createdAt: now(),
      };
      repositoryContext.commissionRules.push(rule);
      return rule;
    },

    async generateCommissions(clinicId: string, competence: string) {
      // Atendimento de lead (experimental/avaliação sem cliente) não gera comissão.
      for (const appointment of repositoryContext.appointments.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.patientId !== undefined &&
          item.status === "completed" &&
          item.startsAt.slice(0, 7) === competence,
      )) {
        if (
          repositoryContext.commissions.some(
            (item) => item.appointmentId === appointment.id,
          )
        )
          continue;
        // Regra do usuário ligado ao profissional, vigente na data; sem ela, a do profissional.
        const linkedUserId = repositoryContext.professionalUsers.get(
          appointment.professionalId,
        );
        const rule =
          (linkedUserId
            ? repositoryContext.userCommissionRuleOn(
                clinicId,
                linkedUserId,
                appointment.startsAt.slice(0, 10),
              )
            : undefined) ??
          repositoryContext.commissionRules
            .filter(
              (item) =>
                item.professionalId === appointment.professionalId &&
                item.effectiveFrom <= appointment.startsAt.slice(0, 10),
            )
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
        const service = repositoryContext.services.find(
          (item) => item.id === appointment.serviceId,
        );
        if (!rule || !service) continue;
        repositoryContext.commissionEntryRuleIds.add(rule.id);
        repositoryContext.commissions.push({
          id: uuid(),
          clinicId,
          professionalId: appointment.professionalId,
          professionalName: appointment.professionalName,
          appointmentId: appointment.id,
          competence,
          baseAmountInCents: service.priceInCents,
          percentage: rule.percentage,
          amountInCents: Math.round(
            (service.priceInCents * rule.percentage) / 100,
          ),
          status: "open",
          createdAt: now(),
        });
      }
      return repositoryContext.commissions.filter(
        (item) => item.clinicId === clinicId && item.competence === competence,
      );
    },

    async settleCommission(
      clinicId: string,
      _actorUserId: string,
      commissionId: string,
    ) {
      const item = repositoryContext.commissions.find(
        (entry) => entry.clinicId === clinicId && entry.id === commissionId,
      );
      if (!item) return null;
      if (
        repositoryContext.payables.some(
          (payable) =>
            payable.clinicId === clinicId &&
            payable.commissionId === commissionId &&
            payable.status !== "cancelled",
        )
      )
        throw new DomainError(
          "COMMISSION_EXPENSE_MANAGED",
          "Registre o pagamento ou estorno na despesa vinculada à comissão.",
          409,
        );
      if (
        repositoryContext.commissionAdjustments.some(
          (entry) =>
            entry.clinicId === clinicId && entry.commissionId === commissionId,
        )
      )
        throw new DomainError(
          "COMMISSION_ACCOUNT_MANAGED",
          "Registre a baixa na conta conciliada desta comissão.",
          409,
        );
      if (item.status !== "open")
        throw new DomainError(
          "COMMISSION_NOT_OPEN",
          "A comissão já foi paga.",
          409,
        );
      item.status = "paid";
      item.paidAt = now();
      repositoryContext.commissionPaymentEvents.push({
        id: uuid(),
        clinicId,
        commissionId,
        kind: "payment",
        amountInCents: item.amountInCents,
        occurredAt: item.paidAt,
      });
      return item;
    },

    async reverseCommission(
      clinicId: string,
      commissionId: string,
      actorUserId?: string,
    ) {
      const item = repositoryContext.commissions.find(
        (entry) => entry.clinicId === clinicId && entry.id === commissionId,
      );
      if (!item) return null;
      if (
        repositoryContext.payables.some(
          (payable) =>
            payable.clinicId === clinicId &&
            payable.commissionId === commissionId &&
            payable.status !== "cancelled",
        )
      )
        throw new DomainError(
          "COMMISSION_EXPENSE_MANAGED",
          "Registre o pagamento ou estorno na despesa vinculada à comissão.",
          409,
        );
      if (
        repositoryContext.commissionAdjustments.some(
          (entry) =>
            entry.clinicId === clinicId && entry.commissionId === commissionId,
        )
      )
        throw new DomainError(
          "COMMISSION_ACCOUNT_MANAGED",
          "Registre o estorno na conta conciliada desta comissão.",
          409,
        );
      if (item.status !== "paid")
        throw new DomainError(
          "COMMISSION_NOT_PAID",
          "A comissão ainda não foi paga.",
          409,
        );
      repositoryContext.commissionPaymentEvents.push({
        id: uuid(),
        clinicId,
        commissionId,
        kind: "reversal",
        amountInCents: -item.amountInCents,
        occurredAt: now(),
      });
      item.status = "open";
      delete item.paidAt;
      if (actorUserId)
        repositoryContext.recordAudit(
          clinicId,
          actorUserId,
          "commission.payment_reversed",
          "commission",
          { amountInCents: item.amountInCents },
          item.id,
        );
      return item;
    },

    async getDailyCash(clinicId: string, date: string): Promise<DailyCash> {
      const payables = repositoryContext.payables.filter(
        (item) =>
          item.clinicId === clinicId && repositoryContext.inBranchScope(item),
      );
      const payableIds = new Set(payables.map((item) => item.id));
      const commissions = repositoryContext.commissions.filter(
        (item) =>
          item.clinicId === clinicId &&
          repositoryContext.professionalInBranchScope(item.professionalId),
      );
      const commissionIds = new Set(commissions.map((item) => item.id));
      // A função pura filtra pela data do evento no fuso da clínica.
      return buildDailyCash(
        date,
        {
          receipts: repositoryContext.receivedPayments(clinicId),
          commissionEvents: repositoryContext.commissionPaymentEvents.filter(
            (item) =>
              item.clinicId === clinicId &&
              commissionIds.has(item.commissionId),
          ),
          payableEvents: repositoryContext.payablePaymentEvents
            .filter(
              (item) =>
                item.clinicId === clinicId && payableIds.has(item.payableId),
            )
            .map((item) => {
              const correction = repositoryContext.financialDateCorrections
                .filter(
                  (correction) =>
                    correction.clinicId === clinicId &&
                    correction.kind === "payable" &&
                    correction.eventId === item.id,
                )
                .at(-1);
              return {
                ...item,
                ...(correction
                  ? {
                      occurredAt: correction.occurredAt,
                      availableAt: correction.availableAt,
                    }
                  : {}),
              };
            }),
          payables,
          commissions,
        },
        repositoryContext.clinicSettings.timezone,
      );
    },

    async listReceivedPayments(clinicId: string, from: string, to: string) {
      return repositoryContext
        .receivedPayments(clinicId)
        .filter((item) => {
          const date = clinicDateOf(
            item.occurredAt,
            repositoryContext.clinicSettings.timezone,
          );
          return date >= from && date <= to;
        })
        .sort(
          (a, b) =>
            Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
            a.id.localeCompare(b.id),
        );
    },
  };
}
