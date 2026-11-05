import { paymentTimingSchema, financialDatesSchema } from "./model.js";
import { z } from "zod";
import type { PaymentPart } from "./payment-parts.js";
import type { ReceiptSignatureSummary } from "./receipt-signatures.js";
import type { ProductSize, ProductSizeStock } from "./model.js";
import {
  productUpdateSchema,
  patientTabItemUpdateSchema,
  productSaleInputSchema,
  supplierInputSchema,
  supplierBillingCycleSchema,
  supplierOrderInputSchema,
  manualReceivableInputSchema,
  financialClassificationSchema,
  categoryDreInputSchema,
} from "./model.js";
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type PatientTabItemUpdate = z.infer<typeof patientTabItemUpdateSchema>;
export type ProductSaleInput = z.infer<typeof productSaleInputSchema>;
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierBillingCycle = z.infer<typeof supplierBillingCycleSchema>;
export type SupplierOrderInput = z.infer<typeof supplierOrderInputSchema>;
export interface Supplier extends SupplierInput {
  id: string;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}
export interface SupplierOrderItem {
  id: string;
  productId: string;
  productName: string;
  size?: ProductSize;
  quantity: number;
  /** Custo unitário informado no pedido; `null` quando não foi informado. */
  unitCostInCents: number | null;
  /** O produto foi cadastrado por este pedido. */
  createdProduct: boolean;
}
export interface SupplierOrder {
  id: string;
  clinicId: string;
  supplierId: string;
  /** Filial em que os itens entraram no estoque. */
  branchId?: string;
  orderedOn: string;
  number: string;
  totalInCents: number;
  notes: string;
  items: SupplierOrderItem[];
  createdAt: string;
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
    /** Descontos do cliente nas cobranças do mês (as receitas já vêm com eles descontados). */
    customerDiscountInCents?: number;
    /** Descontos dados na baixa das cobranças do mês (também já fora das receitas). */
    settlementDiscountInCents?: number;
    expenses: Record<DreGroup, number>;
    resultInCents: number;
  }>;
  totals: {
    revenueInCents: number;
    expensesInCents: number;
    resultInCents: number;
    /** Descontos do cliente no período (informativo: já fora das receitas). */
    customerDiscountInCents?: number;
    /** Descontos na baixa no período (informativo: já fora das receitas). */
    settlementDiscountInCents?: number;
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
  commissionRuleInputSchema,
  costCenterInputSchema,
  dailyCashFilterSchema,
  financeForecastFilterSchema,
  financialCategoryInputSchema,
  patientTabCloseInputSchema,
  patientTabCancelInputSchema,
  patientTabInputSchema,
  patientTabItemInputSchema,
  payableAmountInputSchema,
  payableInputSchema,
  paymentMethodSchema,
  productInputSchema,
  receivableRenegotiationInputSchema,
  receivableSettlementSchema,
  receivableStatusSchema,
  recurringPayableAmountTypeSchema,
  recurringPayableInputSchema,
  stockMovementInputSchema,
} from "./model.js";

export type AdminUserCommissionInput = z.infer<
  typeof adminUserCommissionInputSchema
>;

/**
 * Cópia da regra gravada no lançamento de comissão. Lançamentos antigos podem trazer a regra por
 * serviço ou de valor fixo, que não existem mais: `kind`, `fixedAmountInCents` e `serviceId` só
 * aparecem neles (histórico).
 */
export interface CommissionRuleSnapshot extends AdminUserCommissionInput {
  kind?: "percentage" | "fixed";
  fixedAmountInCents?: number;
  serviceId?: string;
}

export type ProductInput = z.infer<typeof productInputSchema>;

export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

export type PatientTabInput = z.infer<typeof patientTabInputSchema>;

export type PatientTabItemInput = z.infer<typeof patientTabItemInputSchema>;

export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export type PatientTabCloseInput = z.infer<typeof patientTabCloseInputSchema>;

export type PatientTabCancelInput = z.input<typeof patientTabCancelInputSchema>;

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

export type RecurringPayableAmountType = z.infer<
  typeof recurringPayableAmountTypeSchema
>;

export type PayableAmountInput = z.infer<typeof payableAmountInputSchema>;

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
  /** Pagamento: desconto dado na baixa (no picado, só na última forma). */
  discountInCents?: number;
}

export interface Product extends Omit<
  ProductInput,
  "initialStock" | "initialSizeStock" | "sizes" | "restockAlertAt" | "sku"
> {
  sku: string;
  /** Aviso de reposição; `null` = sem aviso. */
  restockAlertAt: number | null;
  /** Vazio = produto sem distinção por tamanhos. */
  sizes: ProductSize[];
  /** Saldo por tamanho (ver `productSizeStock`); `currentStock` é a soma de todas as chaves. */
  sizeStock: ProductSizeStock[];
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  currentStock: number;
  /** Pede reposição: sem estoque ou no aviso de reposição (ver `productNeedsRestock`). */
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
  /** Usuário que registrou a venda (abriu a comanda); ausente se o usuário não existe mais. */
  soldByUserId?: string;
  soldByName?: string;
  status: "open" | "closed" | "cancelled";
  paymentStatus: "pending" | "paid" | "receivable" | "cancelled";
  totalInCents: number;
  items: PatientTabItem[];
  receivableId?: string;
  openedAt: string;
  closedAt?: string;
  cancelledAt?: string;
  /** Motivo informado ao cancelar a venda. */
  cancellationReason?: string;
}

/** Pagamento da comanda (cobrança gerada no fechamento), visto sem acesso ao Financeiro. */
export interface PatientTabPayment {
  receivableId: string;
  status: ReceivableStatus;
  amountInCents: number;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  /** Parcelas na própria forma (ex.: cartão em 3x); ausente = à vista. */
  paymentInstallments?: number;
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
/**
 * Ajustes da baixa (U39); sem eles a parcela é paga pelo valor cheio, à vista.
 * `paymentInstallments`: parcelas na própria forma (ex.: cartão em 3x).
 */
export type SettlementAdjustments = Pick<
  z.input<typeof receivableSettlementSchema>,
  | "discountInCents"
  | "interestInCents"
  | "receivedInCents"
  | "balanceDueDate"
  | "paymentInstallments"
  | "payments"
>;
/** Uma forma de pagamento dentro da baixa mista. */
export type SettlementPaymentPart = NonNullable<
  SettlementAdjustments["payments"]
>[number];
export type FinancialDatesInput = z.infer<typeof financialDatesSchema>;
export interface ReceivableService {
  id: string;
  name: string;
}

export interface Receivable {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  postedOn?: string | undefined;
  cashAvailableAt?: string | undefined;
  source?: "plan" | "tab" | "manual";
  /** Nome do plano como foi vendido; só nas cobranças de plano. */
  planName?: string;
  /** Modelo do plano vendido (avulso, pacote, recorrente…); só nas cobranças de plano. */
  planKind?: "single" | "fixed_package" | "recurring" | "custom";
  /** Valor total contratado do plano; só nas cobranças de plano. */
  planTotalInCents?: number;
  /** Forma de pagamento combinada na venda do plano (ausente = a combinar). */
  planPaymentMethod?: PaymentMethod;
  /** Serviços de origem: os do plano ou os atendimentos da comanda. */
  services?: ReceivableService[];
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
  /** Saldo de baixa parcial: número da parcela de origem (exibido no lugar do próprio). */
  balanceOfInstallment?: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: PaymentMethod;
  /** Parcelas na própria forma de pagamento (ex.: cartão em 3x); ausente = à vista. */
  paymentInstallments?: number;
  /**
   * Pagamento picado: paga, as formas recebidas (a soma é `amountInCents`); aberta, as
   * previstas na venda. Ausente = uma forma só (`paymentMethod`).
   */
  paymentParts?: PaymentPart[];
  /**
   * Desconto do cliente aplicado ao gerar a cobrança do plano (`amountInCents` já é o
   * valor com desconto; o valor cheio é a soma dos dois). Ausente = sem desconto.
   * Também vale para a comanda de venda de produtos com desconto.
   */
  customerDiscountInCents?: number;
  /**
   * Valor definido à mão na venda do plano recorrente: 1º pagamento com o cálculo
   * proporcional desligado. Ausente = valor calculado pelo CRM.
   */
  manualAmount?: true;
  /**
   * Paga: desconto dado na baixa (U39), já fora de `amountInCents`. Ausente = sem desconto
   * na baixa (ou parcela não paga).
   */
  settlementDiscountInCents?: number;
  /**
   * Paga: recibo para assinatura da última baixa não estornada (enviado, visualizado,
   * assinado). Ausente = parcela sem recibo em vigor.
   */
  receiptSignature?: ReceiptSignatureSummary;
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
  /** Pagamento picado: as formas usadas (a soma é `amountInCents`). */
  paymentParts?: PaymentPart[];
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  /** Despesa fixa que gerou esta conta, com a competência (AAAA-MM). */
  recurringPayableId?: string;
  competence?: string;
  /** Despesa fixa variável: o valor do mês ainda é a estimativa e precisa ser informado. */
  amountPending?: boolean;
  /** Despesa lançada pela folha de pagamento (ver `payroll.ts`). */
  payroll?: PayablePayroll;
  /** Despesa paga de um vale da folha (ver `payrollAdvanceInputSchema`). */
  payrollAdvance?: PayablePayrollAdvance;
}

/** Vale do colaborador: o mês em que ele é descontado da folha. */
export interface PayablePayrollAdvance {
  entryId: string;
  employeeId: string;
  employeeName: string;
  competence: string;
}

/**
 * Parte de folha de uma despesa: o colaborador, a competência e quanto do valor é salário e
 * quanto é comissão (comissões + ajustes). Na DRE, a comissão segue como custo do serviço na
 * competência dela; a despesa entra só com o salário.
 */
export interface PayablePayroll {
  employeeId: string;
  employeeName: string;
  competence: string;
  salaryInCents: number;
  commissionInCents: number;
}

export interface RecurringPayable {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  description: string;
  supplier?: string;
  categoryId: string;
  costCenterId?: string | undefined;
  categoryName: string;
  /** Vazio quando a despesa fixa não tem centro de custo. */
  costCenterName: string;
  amountType: RecurringPayableAmountType;
  /** Valor mensal (fixa) ou estimativa usada até o valor do mês ser informado (variável). */
  amountInCents: number;
  dayOfMonth: number;
  /** Dias de antecedência do aviso no sino; ausente, não avisa. */
  reminderDaysBefore?: number;
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
  /** Parcelas e despesas com comprovante (inclusive de baixa estornada). */
  paymentProofEntityIds?: { receivables: string[]; payables: string[] };
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

/** Regra gravada; `kind`/`fixedAmountInCents`/`serviceId` só nas regras antigas (desativadas). */
export interface CommissionRule
  extends
    CommissionRuleInput,
    Pick<CommissionRuleSnapshot, "kind" | "fixedAmountInCents" | "serviceId"> {
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
  ruleSnapshot?: CommissionRuleSnapshot;
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
  /** Despesa da folha que inclui (e paga) esta comissão. */
  payrollPayableId?: string;
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
  /**
   * Recebimento: desconto dado na baixa (o recebido já vem sem ele; no picado, só na
   * última forma). Ausente = sem desconto.
   */
  discountInCents?: number;
}

/** Movimento do caixa com o registro de origem (relatório financeiro por período). */
export interface CashMovement extends DailyCashMovement {
  receivableId?: string;
  payableId?: string;
  commissionId?: string;
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
  /** Descontos dados nas baixas do dia (informativo: os recebimentos já vêm sem eles). */
  totalDiscountInCents?: number;
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
  /** Parcelas na própria forma de pagamento (ex.: cartão em 3x). */
  paymentInstallments?: number;
  /** Pagamento picado: as formas e valores recebidos. */
  paymentParts?: PaymentPart[];
  /** Parcela do plano/venda: "2 de 3" quando há mais de uma. */
  installmentNumber?: number;
  installmentCount?: number;
  paidAt: string;
  /** Dados da clínica (Configurações › Dados da clínica). */
  clinicName: string;
  clinicLegalName?: string;
  clinicTaxId?: string;
  clinicAddress?: string;
  /** Desconto e juros aplicados na baixa (U39). */
  discountInCents?: number;
  interestInCents?: number;
  /** Desconto do cliente já aplicado na cobrança (valor cheio = valor + desconto). */
  customerDiscountInCents?: number;
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
