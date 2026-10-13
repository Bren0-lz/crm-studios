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
  setUserCommission: (id: string, input: AdminUserCommissionInput) =>
    request<AdminUser>(`/admin/users/${id}/commission`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  financialSummary: () => request<FinancialSummary>("/finance/summary"),
  settleReceivable: (id: string, paymentMethod: PaymentMethod = "pix") =>
    request<FinancialSummary["receivables"][number]>(
      `/finance/receivables/${id}/pay`,
      { method: "POST", body: JSON.stringify({ paymentMethod }) },
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
  settleCommission: (id: string) =>
    request<CommissionEntry>(`/finance/commissions/${id}/pay`, {
      method: "POST",
    }),
  reverseCommission: (id: string) =>
    request<CommissionEntry>(`/finance/commissions/${id}/reverse`, {
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
  settlePayable: (id: string, paymentMethod: PaymentMethod = "pix") =>
    request<Payable>(`/finance/payables/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod }),
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
