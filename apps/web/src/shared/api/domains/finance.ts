import type {
  PayrollEmployee,
  PayrollEmployeeInput,
  PayrollLaunchInput,
  PayrollLaunchResult,
  PayrollSummary,
} from "@crm/contracts";
import type {
  CommissionReconciliationPreview,
  CommissionReconciliationInput,
  CommissionReconciliation,
  CommissionAccountPayment,
} from "@crm/contracts";
import type {
  ExternalOperation,
  ExternalOperationInput,
  ExternalOperationContent,
} from "@crm/contracts";
import type {
  ReceivableContact,
  PaymentTiming,
  FinancialDatesInput,
  SettlementAdjustments,
} from "@crm/contracts";
import type {
  InventoryWorkspace,
  Product,
  ProductInput,
  ProductUpdateInput,
  StockMovement,
  StockMovementInput,
  PatientTab,
  PatientTabInput,
  PatientTabItemInput,
  PatientTabItemUpdate,
  PatientTabServiceInput,
  PatientTabCloseInput,
  ProductSaleInput,
  TabAppointmentOption,
  AppointmentInput,
  Supplier,
  SupplierInput,
  ManualReceivableInput,
  Receivable,
  FinancialClassification,
  DreGroup,
  DreReport,
} from "@crm/contracts";
import type {
  AdminUser,
  AdminUserCommissionInput,
  CommissionEntry,
  CommissionRule,
  CommissionRuleInput,
  CostCenter,
  CostCenterInput,
  DailyCash,
  FinanceForecast,
  FinancialCategory,
  FinancialCategoryInput,
  FinancialSummary,
  FinancialWorkspace,
  Payable,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  ReceivableRenegotiation,
  ReceivableRenegotiationInput,
  RecurringPayable,
  RecurringPayableInput,
} from "@crm/contracts";
import { request } from "../transport";

export const financeApi = {
  commissionReconciliation: (id: string) =>
    request<CommissionReconciliationPreview>(
      `/finance/commissions/${id}/reconciliation`,
    ),
  reconcileCommission: (id: string, input: CommissionReconciliationInput) =>
    request<CommissionReconciliation>(
      `/finance/commissions/${id}/reconciliation`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  reverseCommissionAccountPayment: (id: string) =>
    request<CommissionAccountPayment>(
      `/finance/commission-account-payments/${id}/reverse`,
      { method: "POST" },
    ),
  externalOperations: (patientId?: string) =>
    request<ExternalOperation[]>(
      `/finance/external-operations${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`,
    ),
  createExternalOperation: (input: ExternalOperationInput) =>
    request<ExternalOperation>("/finance/external-operations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  externalOperationContent: (id: string) =>
    request<ExternalOperationContent>(
      `/finance/external-operations/${id}/content`,
    ),
  setFinancialDates: (
    kind: "receivable" | "payable",
    id: string,
    input: FinancialDatesInput,
  ) =>
    request<Receivable | Payable>(`/finance/entries/${kind}/${id}/dates`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `options`: `allBranches` na ficha do cliente (comandas de todas as filiais). */
  inventoryWorkspace: (options?: RequestInit) =>
    request<InventoryWorkspace>("/inventory/workspace", options),
  createProduct: (input: ProductInput) =>
    request<Product>("/inventory/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (id: string, input: ProductUpdateInput) =>
    request<Product>(`/inventory/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createStockMovement: (input: StockMovementInput) =>
    request<StockMovement>("/inventory/movements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  openPatientTab: (input: PatientTabInput) =>
    request<PatientTab>("/patient-tabs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addPatientTabItem: (id: string, input: PatientTabItemInput) =>
    request<PatientTab>(`/patient-tabs/${id}/items`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePatientTabItem: (
    id: string,
    itemId: string,
    input: PatientTabItemUpdate,
  ) =>
    request<PatientTab>(`/patient-tabs/${id}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  removePatientTabItem: (id: string, itemId: string) =>
    request<PatientTab>(`/patient-tabs/${id}/items/${itemId}`, {
      method: "DELETE",
    }),
  tabAppointmentOptions: (id: string, from: string, to: string) =>
    request<TabAppointmentOption[]>(
      `/patient-tabs/${id}/appointment-options?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  addPatientTabService: (id: string, input: PatientTabServiceInput) =>
    request<PatientTab>(`/patient-tabs/${id}/services`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removePatientTabService: (id: string, itemId: string) =>
    request<PatientTab>(`/patient-tabs/${id}/services/${itemId}`, {
      method: "DELETE",
    }),
  createPatientTabAppointment: (
    id: string,
    input: Omit<AppointmentInput, "patientId">,
  ) =>
    request<PatientTab>(`/patient-tabs/${id}/appointments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  closePatientTab: (id: string, input: PatientTabCloseInput) =>
    request<PatientTab>(`/patient-tabs/${id}/close`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelPatientTab: (id: string) =>
    request<PatientTab>(`/patient-tabs/${id}/cancel`, { method: "POST" }),
  /** Venda de produtos em uma etapa (abre, preenche e fecha a comanda). */
  createProductSale: (input: ProductSaleInput) =>
    request<PatientTab>("/product-sales", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  suppliers: () => request<Supplier[]>("/finance/suppliers"),
  saveSupplier: (input: SupplierInput, id?: string) =>
    request<Supplier>(id ? `/finance/suppliers/${id}` : "/finance/suppliers", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(input),
    }),
  createManualReceivable: (input: ManualReceivableInput) =>
    request<Receivable>("/finance/receivables", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  classifyFinancialEntry: (
    kind: "receivable" | "payable",
    id: string,
    input: FinancialClassification,
  ) =>
    request<Receivable | Payable>(`/finance/classifications/${kind}/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  setCategoryDreGroup: (id: string, dreGroup: DreGroup) =>
    request<FinancialCategory>(`/finance/categories/${id}/dre`, {
      method: "PUT",
      body: JSON.stringify({ dreGroup }),
    }),
  dreReport: (
    from: string,
    to: string,
    costCenterId?: string,
    exporting = false,
  ) =>
    request<DreReport>(
      `/reports/dre${exporting ? "/export" : ""}?from=${from}&to=${to}${costCenterId ? `&costCenterId=${costCenterId}` : ""}`,
    ),
  setUserCommission: (id: string, input: AdminUserCommissionInput) =>
    request<AdminUser>(`/admin/users/${id}/commission`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `options`: `allBranches` na ficha do cliente (cobranças de todas as filiais). */
  financialSummary: (options?: RequestInit) =>
    request<FinancialSummary>("/finance/summary", options),
  settleReceivable: (
    id: string,
    paymentMethod: PaymentMethod = "pix",
    timing?: PaymentTiming,
    adjustments?: SettlementAdjustments,
  ) =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/pay`,
      {
        method: "POST",
        body: JSON.stringify({ paymentMethod, ...timing, ...adjustments }),
      },
    ),
  reverseReceivable: (id: string) =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/reverse`,
      { method: "POST" },
    ),
  adjustReceivable: (id: string, amountInCents: number, reason: string) =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/adjust`,
      {
        method: "PATCH",
        body: JSON.stringify({ amountInCents, reason }),
      },
    ),
  receivableContact: (id: string) =>
    request<ReceivableContact>(`/finance/receivables/${id}/contact`),
  paymentReceipt: (id: string) =>
    request<PaymentReceipt>(`/finance/receivables/${id}/receipt`),
  financialWorkspace: () => request<FinancialWorkspace>("/finance/workspace"),
  renegotiateReceivables: (input: ReceivableRenegotiationInput) =>
    request<ReceivableRenegotiation>("/finance/renegotiations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCommissionRule: (input: CommissionRuleInput) =>
    request<CommissionRule>("/finance/commission-rules", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  generateCommissions: (competence: string) =>
    request<CommissionEntry[]>("/finance/commissions/generate", {
      method: "POST",
      body: JSON.stringify({ competence }),
    }),
  /** Folha da competência; `branchIds` vazio = todas as filiais acessíveis. */
  payroll: (competence: string, branchIds: string[], options?: RequestInit) =>
    request<PayrollSummary>(
      `/finance/payroll?competence=${competence}${branchIds.length ? `&branchIds=${branchIds.join(",")}` : ""}`,
      options,
    ),
  payrollEmployees: (options?: RequestInit) =>
    request<PayrollEmployee[]>("/finance/payroll/employees", options),
  savePayrollEmployee: (input: PayrollEmployeeInput, id?: string) =>
    request<PayrollEmployee>(
      id ? `/finance/payroll/employees/${id}` : "/finance/payroll/employees",
      { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
    ),
  launchPayroll: (input: PayrollLaunchInput, options?: RequestInit) =>
    request<PayrollLaunchResult>("/finance/payroll/launch", {
      ...options,
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelPayrollLaunch: (payableId: string, options?: RequestInit) =>
    request<Payable>(`/finance/payroll/payables/${payableId}/cancel`, {
      ...options,
      method: "POST",
    }),
  createFinancialCategory: (input: FinancialCategoryInput) =>
    request<FinancialCategory>("/finance/categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createCostCenter: (input: CostCenterInput) =>
    request<CostCenter>("/finance/cost-centers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createPayable: (input: PayableInput) =>
    request<Payable>("/finance/payables", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  settlePayable: (
    id: string,
    paymentMethod: PaymentMethod = "pix",
    timing?: PaymentTiming,
  ) =>
    request<Payable>(`/finance/payables/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod, ...timing }),
    }),
  setPayableAmount: (id: string, amountInCents: number) =>
    request<Payable>(`/finance/payables/${id}/amount`, {
      method: "PUT",
      body: JSON.stringify({ amountInCents }),
    }),
  reversePayable: (id: string) =>
    request<Payable>(`/finance/payables/${id}/reverse`, { method: "POST" }),
  dailyCash: (date: string) =>
    request<DailyCash>(`/finance/daily-cash?date=${encodeURIComponent(date)}`),
  financeForecast: (months: number) =>
    request<FinanceForecast>(`/finance/forecast?months=${months}`),
  recurringPayables: () =>
    request<RecurringPayable[]>("/finance/recurring-payables"),
  createRecurringPayable: (input: RecurringPayableInput) =>
    request<RecurringPayable>("/finance/recurring-payables", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRecurringPayable: (id: string, input: RecurringPayableInput) =>
    request<RecurringPayable>(`/finance/recurring-payables/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};
