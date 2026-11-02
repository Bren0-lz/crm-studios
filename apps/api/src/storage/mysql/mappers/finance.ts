import type {
  AdminUser,
  CommissionEntry,
  CommissionRule,
  FinancialCategory,
  PatientTab,
  PatientTabItem,
  Payable,
  PaymentMethod,
  PaymentPart,
  Product,
  ProductSize,
  Receivable,
  ReceivableStatus,
  RecurringPayable,
  StockMovement,
} from "@crm/contracts";
import {
  productSizeStock,
  serviceCommissionsInForce,
  productNeedsRestock,
  sortProductSizes,
} from "@crm/contracts";
import { localToday } from "../sql.js";
import { mapAdminUser, type AdminUserRow } from "./administration.js";
import { bool, json } from "./common.js";

/** Coluna com os saldos por tamanho; exige a tabela `products` sem apelido na consulta. */
export const productStockRowsColumn = `(SELECT JSON_ARRAYAGG(JSON_OBJECT('size',s.size,'currentStock',s.current_stock)) FROM product_stock s WHERE s.product_id=products.id) AS "stockRows"`;

export interface ProductRow {
  branchId?: string;
  categoryId?: string | null;
  brandId?: string | null;
  id: string;
  clinicId: string;
  name: string;
  sku: string;
  unit: string;
  costInCents: number;
  salePriceInCents: number | null;
  currentStock: number;
  restockAlertAt: number | null;
  sizes: ProductSize[];
  /** Linhas de `product_stock` ("" = sem tamanho), via `productStockRowsColumn`. */
  stockRows?: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementRow {
  id: string;
  clinicId: string;
  productId: string;
  productName: string;
  kind: StockMovement["kind"];
  size?: string;
  quantity: number;
  balanceAfter: number;
  notes: string;
  patientTabId: string | null;
  createdAt: Date;
}

export interface PatientTabRow {
  branchId?: string;
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  soldByUserId?: string | null;
  soldByName?: string | null;
  notes: string | null;
  status: PatientTab["status"];
  paymentStatus: PatientTab["paymentStatus"];
  totalInCents: number;
  receivableId: string | null;
  openedAt: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
  /** Só nas consultas que leem a venda inteira (detalhe e histórico). */
  cancellationReason?: string | null;
}

export interface PatientTabItemRow {
  id: string;
  tabId: string;
  productId: string;
  productName: string;
  size?: string;
  quantity: number;
  unitPriceInCents: number;
  unitCostInCents: number;
}

export interface ReceivableRow {
  /** Pagamento picado (JSON); vazio = forma única. */
  paymentParts?: unknown;
  branchId?: string;
  postedOn?: string | null;
  cashAvailableAt?: Date | null;
  source?: Receivable["source"];
  competence?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  id: string;
  clinicId: string;
  patientId: string;
  planId: string | null;
  patientName: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt: Date | null;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
  paymentMethod: PaymentMethod | null;
  paymentInstallments?: number | null;
  customerDiscountInCents?: number | null;
  manualAmount?: number | boolean | null;
}

export interface FinancialCategoryRow {
  dreGroup?: FinancialCategory["dreGroup"];
  id: string;
  clinicId: string;
  name: string;
  kind: FinancialCategory["kind"];
  active: boolean;
}

export interface CostCenterRow {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
}

export interface PayableRow {
  /** Pagamento picado (JSON); vazio = forma única. */
  paymentParts?: unknown;
  payrollEmployeeId?: string | null;
  payrollEmployeeName?: string | null;
  payrollCompetence?: string | null;
  payrollSalaryInCents?: number | null;
  payrollCommissionInCents?: number | null;
  branchId?: string;
  postedOn?: string | null;
  cashAvailableAt?: Date | null;
  commissionId?: string | null;
  supplierId?: string | null;
  dreCompetence?: string | null;
  id: string;
  clinicId: string;
  description: string;
  supplier: string | null;
  categoryId: string;
  costCenterId: string | null;
  categoryName: string;
  costCenterName: string | null;
  dueDate: string;
  amountInCents: number;
  notes: string | null;
  status: Payable["status"];
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
  recurringPayableId: string | null;
  competence: string | null;
  amountPending?: boolean;
}

export interface RecurringPayableRow {
  branchId?: string;
  id: string;
  clinicId: string;
  description: string;
  supplier: string | null;
  categoryId: string;
  costCenterId: string | null;
  categoryName: string;
  costCenterName: string | null;
  amountType: RecurringPayable["amountType"];
  amountInCents: number;
  dayOfMonth: number;
  reminderDaysBefore: number | null;
  startMonth: string;
  endMonth: string | null;
  active: boolean;
  resumedFromMonth: string | null;
  lastCompetence: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionRuleRow {
  kind?: CommissionRule["kind"];
  fixedAmountInCents?: number | null;
  serviceId?: string | null;
  effectiveUntil?: string | null;
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  percentage: string;
  effectiveFrom: string;
  active: boolean;
  createdAt: Date;
}

export interface CommissionEntryRow {
  groupAttendanceId?: string | null;
  serviceId?: string | null;
  ruleId?: string;
  ruleSnapshot?: CommissionEntry["ruleSnapshot"] | null;
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  appointmentId: string | null;
  competence: string;
  baseAmountInCents: number;
  percentage: string;
  amountInCents: number;
  status: CommissionEntry["status"];
  paidAt: Date | null;
  createdAt: Date;
  payrollPayableId?: string | null;
}

/** Coluna `payment_parts`: lista vazia (ou ausente) = forma única, sem o campo. */
export function paymentPartsOf(value: unknown): {
  paymentParts?: PaymentPart[];
} {
  const parts = json<PaymentPart[] | null>(value);
  return Array.isArray(parts) && parts.length ? { paymentParts: parts } : {};
}

/** Parcelas do pagamento gravadas só quando há parcelamento (1 = à vista = NULL). */
export function paymentInstallmentsValue(value: number | undefined) {
  return value && value > 1 ? value : null;
}

export const receivableColumns = `
  r.branch_id AS "branchId",r.posted_on AS "postedOn",r.cash_available_at AS "cashAvailableAt",
  r.competence,r.category_id AS "categoryId",r.cost_center_id AS "costCenterId",CASE WHEN r.plan_id IS NOT NULL THEN 'plan' WHEN EXISTS(SELECT 1 FROM patient_tabs t WHERE t.clinic_id=r.clinic_id AND t.receivable_id=r.id) THEN 'tab' ELSE 'manual' END AS source,
  r.id, r.clinic_id AS "clinicId", r.patient_id AS "patientId",
  r.plan_id AS "planId", p.full_name AS "patientName", r.description,
  r.installment_number AS "installmentNumber",
  r.installment_count AS "installmentCount", r.due_date AS "dueDate",
  r.amount_in_cents AS "amountInCents", r.status, r.paid_at AS "paidAt",
  (r.status = 'open' AND r.due_date < ${localToday()}) AS overdue,
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"
  , r.payment_method AS "paymentMethod", r.payment_installments AS "paymentInstallments"
  , r.payment_parts AS "paymentParts"
  , r.customer_discount_in_cents AS "customerDiscountInCents"
  , r.manual_amount AS "manualAmount"
`;

export const payableColumns = `
  py.branch_id AS "branchId",py.posted_on AS "postedOn",py.cash_available_at AS "cashAvailableAt",py.commission_id AS "commissionId",
  py.supplier_id AS "supplierId",py.dre_competence AS "dreCompetence",
  py.id, py.clinic_id AS "clinicId", py.description, py.supplier,
  py.category_id AS "categoryId", py.cost_center_id AS "costCenterId",
  fc.name AS "categoryName", cc.name AS "costCenterName",
  py.due_date AS "dueDate", py.amount_in_cents AS "amountInCents",
  py.notes, py.status, py.payment_method AS "paymentMethod",
  py.payment_parts AS "paymentParts",
  py.paid_at AS "paidAt",
  (py.status = 'open' AND py.due_date < ${localToday()}) AS overdue,
  py.created_at AS "createdAt", py.updated_at AS "updatedAt",
  py.recurring_payable_id AS "recurringPayableId", py.competence,
  py.amount_pending AS "amountPending",
  py.payroll_employee_id AS "payrollEmployeeId",py.payroll_competence AS "payrollCompetence",
  py.payroll_salary_in_cents AS "payrollSalaryInCents",py.payroll_commission_in_cents AS "payrollCommissionInCents",
  (SELECT pe.name FROM payroll_employees pe WHERE pe.id=py.payroll_employee_id) AS "payrollEmployeeName"
`;

export const recurringPayableColumns = `
  rp.branch_id AS "branchId", rp.id, rp.clinic_id AS "clinicId", rp.description, rp.supplier,
  rp.category_id AS "categoryId", rp.cost_center_id AS "costCenterId",
  fc.name AS "categoryName", cc.name AS "costCenterName",
  rp.amount_type AS "amountType", rp.amount_in_cents AS "amountInCents",
  rp.day_of_month AS "dayOfMonth", rp.reminder_days_before AS "reminderDaysBefore",
  rp.start_month AS "startMonth", rp.end_month AS "endMonth", rp.active,
  rp.resumed_from_month AS "resumedFromMonth",
  (SELECT max(py.competence) FROM payables py
    WHERE py.clinic_id = rp.clinic_id AND py.recurring_payable_id = rp.id) AS "lastCompetence",
  rp.created_at AS "createdAt", rp.updated_at AS "updatedAt"
`;

export function mapAdminUserWithCommission(raw: AdminUserRow): AdminUser {
  const row = {
    ...raw,
    professional: json<AdminUserRow["professional"]>(raw.professional),
    serviceCommissions: json<AdminUserRow["serviceCommissions"]>(
      raw.serviceCommissions,
    )?.map((item) =>
      Object.fromEntries(
        Object.entries(item).filter(([, value]) => value !== null),
      ),
    ) as AdminUserRow["serviceCommissions"],
  };
  return {
    ...(row.professional ? { professional: row.professional } : {}),
    ...mapAdminUser(row),
    ...(row.professionalId
      ? {
          professionalId: row.professionalId,
          professionalName: row.professionalName ?? "",
        }
      : {}),
    ...(row.commissionPercentage !== null && row.commissionEffectiveFrom
      ? {
          ...(row.commissionKind ? { commissionKind: row.commissionKind } : {}),
          ...(row.commissionFixedAmountInCents !== undefined &&
          row.commissionFixedAmountInCents !== null
            ? { commissionFixedAmountInCents: row.commissionFixedAmountInCents }
            : {}),
          commissionPercentage: Number(row.commissionPercentage),
          commissionEffectiveFrom: row.commissionEffectiveFrom,
        }
      : {}),
    ...(row.serviceCommissions?.length && row.today
      ? {
          serviceCommissions: serviceCommissionsInForce(
            row.serviceCommissions.map((item) => ({
              ...item,
              percentage: Number(item.percentage),
            })),
            row.today,
          ),
        }
      : {}),
    ...(row.salaryInCents ? { salaryInCents: Number(row.salaryInCents) } : {}),
  };
}

export function mapProduct(row: ProductRow): Product {
  const sizes = sortProductSizes(json<ProductSize[]>(row.sizes));
  const sizeStock = productSizeStock(
    json<ProductSize[]>(row.sizes),
    (
      json<{ size: string; currentStock: number }[] | null>(row.stockRows) ?? []
    ).map((item) => ({
      size: (item.size || null) as ProductSize | null,
      currentStock: item.currentStock,
    })),
  );
  return {
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.brandId ? { brandId: row.brandId } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    costInCents: row.costInCents,
    salePriceInCents: row.salePriceInCents,
    currentStock: row.currentStock,
    restockAlertAt: row.restockAlertAt,
    sizes,
    sizeStock,
    lowStock: productNeedsRestock({
      currentStock: row.currentStock,
      restockAlertAt: row.restockAlertAt,
      sizes,
      sizeStock,
    }),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    clinicId: row.clinicId,
    productId: row.productId,
    productName: row.productName,
    kind: row.kind,
    ...(row.size ? { size: row.size as ProductSize } : {}),
    quantity: row.quantity,
    balanceAfter: row.balanceAfter,
    notes: row.notes,
    ...(row.patientTabId ? { patientTabId: row.patientTabId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPatientTabItem(row: PatientTabItemRow): PatientTabItem {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    ...(row.size ? { size: row.size as ProductSize } : {}),
    quantity: row.quantity,
    unitPriceInCents: row.unitPriceInCents,
    unitCostInCents: row.unitCostInCents,
    totalInCents: row.quantity * row.unitPriceInCents,
  };
}

export function mapPatientTab(
  row: PatientTabRow,
  items: PatientTabItem[],
): PatientTab {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    ...(row.soldByUserId && row.soldByName
      ? { soldByUserId: row.soldByUserId, soldByName: row.soldByName }
      : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalInCents: row.totalInCents,
    items,
    ...(row.receivableId ? { receivableId: row.receivableId } : {}),
    openedAt: row.openedAt.toISOString(),
    ...(row.closedAt ? { closedAt: row.closedAt.toISOString() } : {}),
    ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.toISOString() } : {}),
    ...(row.cancellationReason
      ? { cancellationReason: row.cancellationReason }
      : {}),
  };
}

export function mapReceivable(row: ReceivableRow): Receivable {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.postedOn ? { postedOn: row.postedOn } : {}),
    ...(row.cashAvailableAt
      ? { cashAvailableAt: row.cashAvailableAt.toISOString() }
      : {}),

    ...(row.competence ? { competence: row.competence } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.costCenterId ? { costCenterId: row.costCenterId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    ...(row.planId ? { planId: row.planId } : {}),
    patientName: row.patientName,
    description: row.description,
    installmentNumber: row.installmentNumber,
    installmentCount: row.installmentCount,
    dueDate: row.dueDate,
    amountInCents: row.amountInCents,
    status: row.status,
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    overdue: bool(row.overdue),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
    ...(row.paymentInstallments && row.paymentInstallments > 1
      ? { paymentInstallments: row.paymentInstallments }
      : {}),
    ...paymentPartsOf(row.paymentParts),
    ...(row.customerDiscountInCents
      ? { customerDiscountInCents: row.customerDiscountInCents }
      : {}),
    ...(bool(row.manualAmount) ? { manualAmount: true as const } : {}),
  };
}

export function mapPayable(row: PayableRow): Payable {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.postedOn ? { postedOn: row.postedOn } : {}),
    ...(row.cashAvailableAt
      ? { cashAvailableAt: row.cashAvailableAt.toISOString() }
      : {}),
    ...(row.commissionId ? { commissionId: row.commissionId } : {}),

    ...(row.dreCompetence ? { dreCompetence: row.dreCompetence } : {}),
    ...(row.supplierId ? { supplierId: row.supplierId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    description: row.description,
    ...(row.supplier ? { supplier: row.supplier } : {}),
    categoryId: row.categoryId,
    ...(row.costCenterId ? { costCenterId: row.costCenterId } : {}),
    categoryName: row.categoryName,
    ...(row.costCenterName ? { costCenterName: row.costCenterName } : {}),
    dueDate: row.dueDate,
    amountInCents: row.amountInCents,
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
    ...paymentPartsOf(row.paymentParts),
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    overdue: bool(row.overdue),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.recurringPayableId
      ? { recurringPayableId: row.recurringPayableId }
      : {}),
    ...(row.competence ? { competence: row.competence } : {}),
    ...(row.payrollEmployeeId
      ? {
          payroll: {
            employeeId: row.payrollEmployeeId,
            employeeName: row.payrollEmployeeName ?? "",
            competence: row.payrollCompetence!,
            salaryInCents: row.payrollSalaryInCents ?? 0,
            commissionInCents: row.payrollCommissionInCents ?? 0,
          },
        }
      : {}),
    ...(row.amountPending ? { amountPending: true } : {}),
  };
}

export function mapRecurringPayable(
  row: RecurringPayableRow,
): RecurringPayable {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    description: row.description,
    ...(row.supplier ? { supplier: row.supplier } : {}),
    categoryId: row.categoryId,
    ...(row.costCenterId ? { costCenterId: row.costCenterId } : {}),
    categoryName: row.categoryName,
    costCenterName: row.costCenterName ?? "",
    amountType: row.amountType,
    amountInCents: row.amountInCents,
    dayOfMonth: row.dayOfMonth,
    ...(row.reminderDaysBefore !== null
      ? { reminderDaysBefore: row.reminderDaysBefore }
      : {}),
    startMonth: row.startMonth,
    ...(row.endMonth ? { endMonth: row.endMonth } : {}),
    active: row.active,
    ...(row.resumedFromMonth ? { resumedFromMonth: row.resumedFromMonth } : {}),
    ...(row.lastCompetence ? { lastCompetence: row.lastCompetence } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapCommissionRule(row: CommissionRuleRow): CommissionRule {
  return {
    id: row.id,
    clinicId: row.clinicId,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    effectiveFrom: row.effectiveFrom,
    active: row.active,
    ...(row.kind ? { kind: row.kind } : {}),
    percentage: Number(row.percentage),
    ...(row.fixedAmountInCents !== null && row.fixedAmountInCents !== undefined
      ? { fixedAmountInCents: row.fixedAmountInCents }
      : {}),
    ...(row.serviceId ? { serviceId: row.serviceId } : {}),
    ...(row.effectiveUntil ? { effectiveUntil: row.effectiveUntil } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapCommissionEntry(row: CommissionEntryRow): CommissionEntry {
  return {
    id: row.id,
    clinicId: row.clinicId,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    ...(row.appointmentId
      ? { appointmentId: row.appointmentId, sourceType: "appointment" as const }
      : {}),
    ...(row.groupAttendanceId
      ? {
          groupAttendanceId: row.groupAttendanceId,
          sourceType: "group_attendance" as const,
        }
      : {}),
    ...(row.serviceId ? { serviceId: row.serviceId } : {}),
    ...(row.ruleId ? { ruleId: row.ruleId } : {}),
    ...(row.ruleSnapshot ? { ruleSnapshot: json(row.ruleSnapshot) } : {}),
    competence: row.competence,
    baseAmountInCents: row.baseAmountInCents,
    percentage: Number(row.percentage),
    amountInCents: row.amountInCents,
    status: row.status,
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.payrollPayableId ? { payrollPayableId: row.payrollPayableId } : {}),
  };
}

export function hasDatabaseCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
