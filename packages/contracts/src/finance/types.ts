import { paymentTimingSchema, financialDatesSchema } from "./model.js";
import { z } from "zod";
import type { ProductSize, ProductSizeStock } from "./model.js";
import {
  productUpdateSchema,
  patientTabItemUpdateSchema,
  patientTabServiceInputSchema,
  productSaleInputSchema,
  supplierInputSchema,
  manualReceivableInputSchema,
  financialClassificationSchema,
  categoryDreInputSchema,
} from "./model.js";
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type PatientTabItemUpdate = z.infer<typeof patientTabItemUpdateSchema>;
export type ProductSaleInput = z.infer<typeof productSaleInputSchema>;
export type PatientTabServiceInput = z.infer<
  typeof patientTabServiceInputSchema
>;
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export interface Supplier extends SupplierInput {
  id: string;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}
export type ManualReceivableInput = z.infer<typeof manualReceivableInputSchema>;
export type FinancialClassification = z.infer<
  typeof financialClassificationSchema
>;
export type DreGroup = z.infer<typeof categoryDreInputSchema>["dreGroup"];
export interface DreReport {
  from: string;
  to: string;
  months: Array<{
    month: string;
    serviceRevenueInCents: number;
    productRevenueInCents: number;
    otherRevenueInCents: number;
    expenses: Record<DreGroup, number>;
    resultInCents: number;
  }>;
  totals: {
    revenueInCents: number;
    expensesInCents: number;
    resultInCents: number;
  };
  categories: Array<{
    id: string;
    name: string;
    group: DreGroup;
    amountInCents: number;
  }>;
}
import {
  adminUserCommissionInputSchema,
  adminUserServiceCommissionInputSchema,
  commissionRuleInputSchema,
  costCenterInputSchema,
  dailyCashFilterSchema,
  financeForecastFilterSchema,
  financialCategoryInputSchema,
  patientTabCloseInputSchema,
  patientTabInputSchema,
  patientTabItemInputSchema,
  payableInputSchema,
  paymentMethodSchema,
  productInputSchema,
  receivableRenegotiationInputSchema,
  receivableSettlementSchema,
  receivableStatusSchema,
  recurringPayableInputSchema,
  stockMovementInputSchema,
} from "./model.js";

export type AdminUserCommissionInput = z.infer<
  typeof adminUserCommissionInputSchema
>;

export type AdminUserServiceCommissionInput = z.infer<
  typeof adminUserServiceCommissionInputSchema
>;

/** Regra de serviço gravada (vigente ou agendada), como a lista de usuários devolve. */
export interface AdminUserServiceCommission {
  serviceId: string;
  serviceName: string;
  kind: "percentage" | "fixed";
  percentage: number;
  fixedAmountInCents?: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export type ProductInput = z.infer<typeof productInputSchema>;

export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

export type PatientTabInput = z.infer<typeof patientTabInputSchema>;

export type PatientTabItemInput = z.infer<typeof patientTabItemInputSchema>;

export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export type PatientTabCloseInput = z.infer<typeof patientTabCloseInputSchema>;

export type ReceivableRenegotiationInput = z.infer<
  typeof receivableRenegotiationInputSchema
>;

export type CommissionRuleInput = z.infer<typeof commissionRuleInputSchema>;

export type FinancialCategoryInput = z.infer<
  typeof financialCategoryInputSchema
>;

export type CostCenterInput = z.infer<typeof costCenterInputSchema>;

export type PayableInput = z.infer<typeof payableInputSchema>;

export type RecurringPayableInput = z.infer<typeof recurringPayableInputSchema>;

export interface PayablePaymentEvent {
  id: string;
  clinicId: string;
  payableId: string;
  kind: "payment" | "reversal";
  occurredAt: string;
  availableAt?: string | undefined;
  amountInCents: number;
  paymentMethod?: PaymentMethod | undefined;
}
export interface FinancialDateCorrection {
  id: string;
  clinicId: string;
  kind: "receivable" | "payable";
  eventId: string;
  occurredAt: string;
  availableAt: string;
  reason: string;
  actorId: string;
  createdAt: string;
}
export interface ReceivedPayment {
  availableAt?: string;
  id: string;
  receivableId: string;
  kind: "payment" | "reversal";
  sourceId?: string;
  occurredAt: string;
  patientId: string;
  patientName: string;
  description: string;
  amountInCents: number;
  paymentMethod?: PaymentMethod;
}

export interface Product extends Omit<
  ProductInput,
  "initialStock" | "initialSizeStock" | "sizes"
> {
  /** Vazio = produto sem distinção por tamanhos. */
  sizes: ProductSize[];
  /** Saldo por tamanho (ver `productSizeStock`); `currentStock` é a soma de todas as chaves. */
  sizeStock: ProductSizeStock[];
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  currentStock: number;
  lowStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  clinicId: string;
  productId: string;
  productName: string;
  kind:
    | "initial_stock"
    | "purchase"
    | "adjustment_in"
    | "adjustment_out"
    | "loss"
    | "sale"
    | "sale_reversal";
  /** Ausente = estoque sem tamanho. */
  size?: ProductSize;
  quantity: number;
  /** Saldo da chave movimentada (do tamanho, quando houver) logo após o movimento. */
  balanceAfter: number;
  notes: string;
  patientTabId?: string;
  createdAt: string;
}

export interface PatientTabItem {
  id: string;
  productId: string;
  productName: string;
  size?: ProductSize;
  quantity: number;
  unitPriceInCents: number;
  unitCostInCents: number;
  totalInCents: number;
}

export interface PatientTabServiceItem {
  id: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  amountInCents: number;
}

export interface PatientTab extends PatientTabInput {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  services?: PatientTabServiceItem[];
  id: string;
  clinicId: string;
  patientName: string;
  status: "open" | "closed" | "cancelled";
  paymentStatus: "pending" | "paid" | "receivable" | "cancelled";
  totalInCents: number;
  items: PatientTabItem[];
  receivableId?: string;
  openedAt: string;
  closedAt?: string;
  cancelledAt?: string;
}

export interface InventoryWorkspace {
  products: Product[];
  movements: StockMovement[];
  tabs: PatientTab[];
  lowStockCount: number;
  inventoryCostInCents: number;
  openTabsInCents: number;
}

export type PaymentTiming = z.infer<typeof paymentTimingSchema>;
/** Ajustes da baixa (U39); sem eles a parcela é paga pelo valor cheio. */
export type SettlementAdjustments = Pick<
  z.input<typeof receivableSettlementSchema>,
  "discountInCents" | "interestInCents" | "receivedInCents" | "balanceDueDate"
>;
export type FinancialDatesInput = z.infer<typeof financialDatesSchema>;
export interface Receivable {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  postedOn?: string | undefined;
  cashAvailableAt?: string | undefined;
  source?: "plan" | "tab" | "manual";
  competence?: string;
  categoryId?: string | undefined;
  costCenterId?: string | undefined;
  id: string;
  clinicId: string;
  patientId: string;
  planId?: string;
  patientName: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: PaymentMethod;
}

export interface FinancialSummary {
  openInCents: number;
  overdueInCents: number;
  paidThisMonthInCents: number;
  receivables: Receivable[];
}

export interface FinancialCategory extends FinancialCategoryInput {
  dreGroup?: DreGroup | undefined;
  id: string;
  clinicId: string;
  active: boolean;
}

export interface CostCenter extends CostCenterInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Payable extends PayableInput {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  cashAvailableAt?: string;
  dreCompetence?: string | undefined;
  commissionId?: string | undefined;
  id: string;
  clinicId: string;
  categoryName: string;
  /** Ausente quando a despesa foi lançada sem centro de custo. */
  costCenterName?: string;
  status: "open" | "paid" | "cancelled";
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  /** Despesa fixa que gerou esta conta, com a competência (AAAA-MM). */
  recurringPayableId?: string;
  competence?: string;
}

export interface RecurringPayable {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  description: string;
  supplier?: string;
  categoryId: string;
  costCenterId: string;
  categoryName: string;
  costCenterName: string;
  amountInCents: number;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string;
  active: boolean;
  /** Mês da última reativação: competências pausadas antes dele não são geradas. */
  resumedFromMonth?: string;
  /** Última competência já gerada como conta a pagar. */
  lastCompetence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialWorkspace {
  commissionAdjustments?: import("./commission-reconciliation.js").CommissionAdjustment[];
  commissionAccountPayments?: import("./commission-reconciliation.js").CommissionAccountPayment[];
  summary: FinancialSummary;
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  payables: Payable[];
  payableOpenInCents: number;
  payableOverdueInCents: number;
  paidExpensesThisMonthInCents: number;
  cashBalanceThisMonthInCents: number;
  commissionRules: CommissionRule[];
  commissions: CommissionEntry[];
  commissionOpenInCents: number;
  paidCommissionsThisMonthInCents: number;
}

export interface ReceivableRenegotiation {
  id: string;
  clinicId: string;
  patientId: string;
  originalAmountInCents: number;
  renegotiatedAmountInCents: number;
  reason: string;
  originalReceivableIds: string[];
  newReceivables: Receivable[];
  createdAt: string;
}

export interface CommissionRule extends CommissionRuleInput {
  id: string;
  clinicId: string;
  professionalName: string;
  active: boolean;
  createdAt: string;
}

export interface CommissionEntry {
  groupAttendanceId?: string;
  sourceType?: "appointment" | "group_attendance";
  ruleId?: string;
  serviceId?: string;
  ruleSnapshot?: AdminUserCommissionInput;
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  appointmentId?: string;
  competence: string;
  baseAmountInCents: number;
  percentage: number;
  amountInCents: number;
  status: "open" | "paid";
  paidAt?: string;
  createdAt: string;
}

export type DailyCashFilter = z.infer<typeof dailyCashFilterSchema>;

/**
 * Forma de pagamento do caixa. `unspecified` agrupa o que não tem forma
 * registrada (comissões pagas e estornos sem pagamento de origem).
 */
export type DailyCashPaymentMethod = PaymentMethod | "unspecified";

export type DailyCashMovementKind =
  "receipt" | "receipt_reversal" | "payable" | "commission";

export interface DailyCashMovement {
  /** `<kind>:<id da origem>`. */
  id: string;
  kind: DailyCashMovementKind;
  direction: "in" | "out";
  /** ISO 8601 do evento (pagamento, estorno ou baixa). */
  occurredAt: string;
  description: string;
  /** Cliente, fornecedor ou profissional. */
  counterpart?: string;
  paymentMethod: DailyCashPaymentMethod;
  /**
   * Valor com sinal dentro da sua direção: entradas positivas e estornos
   * negativos; saídas positivas (valor pago).
   */
  amountInCents: number;
}

export interface DailyCashMethodTotal {
  paymentMethod: DailyCashPaymentMethod;
  inflowInCents: number;
  outflowInCents: number;
  balanceInCents: number;
}

export interface DailyCash {
  /** Data (aaaa-mm-dd) no fuso da clínica. */
  date: string;
  generatedAt: string;
  /** Só as formas com movimento, na ordem de `paymentMethodSchema` + `unspecified`. */
  byPaymentMethod: DailyCashMethodTotal[];
  totalInflowInCents: number;
  totalOutflowInCents: number;
  balanceInCents: number;
  /** Movimentos em ordem cronológica. */
  movements: DailyCashMovement[];
}

export type FinanceForecastFilter = z.infer<typeof financeForecastFilterSchema>;

/** Entradas, saídas e saldo (entradas − saídas), em centavos. */
export interface FinanceForecastFlow {
  inflowInCents: number;
  outflowInCents: number;
  balanceInCents: number;
}

export interface FinanceForecastMonth {
  /** Mês (AAAA-MM). */
  month: string;
  /** Parcelas a receber e contas a pagar já lançadas e em aberto, pelo vencimento. */
  confirmed: FinanceForecastFlow;
  /**
   * Ainda não lançado: parcelas das renovações automáticas futuras e
   * competências futuras das despesas fixas.
   */
  projected: FinanceForecastFlow;
  /** Saldo confirmado + projetado do mês. */
  balanceInCents: number;
}

export interface FinanceForecast {
  generatedAt: string;
  /** Primeiro mês (o atual, no fuso da clínica) e último mês do horizonte. */
  startMonth: string;
  endMonth: string;
  months: FinanceForecastMonth[];
  /**
   * Em atraso: parcelas e contas em aberto com vencimento antes do primeiro
   * mês. Ficam fora dos meses e dos totais.
   */
  overdue: FinanceForecastFlow;
  /** Soma dos meses do horizonte. */
  totals: {
    confirmed: FinanceForecastFlow;
    projected: FinanceForecastFlow;
    balanceInCents: number;
  };
}

/**
 * Contato do cliente de uma parcela (`GET /finance/receivables/:id/contact`): só o necessário
 * para cobrar, sem exigir acesso ao módulo Clientes.
 */
export interface ReceivableContact {
  receivableId: string;
  patientId: string;
  patientName: string;
  phone: string;
  whatsapp?: string | undefined;
}

export interface PaymentReceipt {
  receiptNumber: string;
  patientName: string;
  /** WhatsApp do cliente (ou telefone) para enviar o recibo (U40). */
  patientPhone?: string;
  description: string;
  amountInCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  /** Dados da clínica (Configurações › Dados da clínica). */
  clinicName: string;
  clinicLegalName?: string;
  clinicTaxId?: string;
  clinicAddress?: string;
  /** Desconto e juros aplicados na baixa (U39). */
  discountInCents?: number;
  interestInCents?: number;
}

export interface TabAppointmentOption {
  id: string;
  serviceName: string;
  professionalName: string;
  startsAt: string;
}

export interface CommissionPaymentEvent {
  professionalName?: string;
  id: string;
  clinicId: string;
  commissionId: string;
  kind: "payment" | "reversal";
  amountInCents: number;
  occurredAt: string;
}
