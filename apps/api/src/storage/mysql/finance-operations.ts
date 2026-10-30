import { loadCommissionAdjustments } from "./commission-reconciliation.js";
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
  type ProductSize,
} from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import { DomainError } from "../../repository.js";
import { assertCategoryDreGroup, buildDre } from "../../modules/finance/dre.js";
import { randomUUID } from "node:crypto";
import type { MysqlRepositoryContext } from "./context.js";
import {
  branchOrDefault,
  localDate,
  localMonth,
  localToday,
  writeAndRead,
} from "./sql.js";
import {
  mapProduct,
  mapReceivable,
  mapPayable,
  mapCommissionEntry,
  receivableColumns,
  payableColumns,
  type ProductRow,
  type ReceivableRow,
  type PayableRow,
  type CommissionEntryRow,
  branchClause,
  hasDatabaseCode,
  productStockRowsColumn,
} from "./helpers.js";
import { changeProductStock, productStockOf } from "./product-stock.js";
import {
  sizeQuantityNotes,
  stockKey,
} from "../../modules/finance/product-stock.js";

const productColumns = `id,clinic_id AS "clinicId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",restock_alert_at AS "restockAlertAt",sizes,${productStockRowsColumn},active,category_id AS "categoryId",brand_id AS "brandId",created_at AS "createdAt",updated_at AS "updatedAt"`;
const supplierColumns = `id,clinic_id AS "clinicId",name,kind,document,phone,whatsapp,email,hired_on AS "hiredOn",contract_amount_in_cents AS "contractAmountInCents",billing_cycle AS "billingCycle",payment_method AS "paymentMethod",installments,payment_terms AS "paymentTerms",orders,contracts,notes,active,created_at AS "createdAt",updated_at AS "updatedAt"`;
type SupplierRow = Omit<
  Supplier,
  | "createdAt"
  | "updatedAt"
  | "hiredOn"
  | "contractAmountInCents"
  | "paymentMethod"
> & {
  hiredOn: string | null;
  contractAmountInCents: number | null;
  paymentMethod: Supplier["paymentMethod"] | null;
  createdAt: Date;
  updatedAt: Date;
};
const mapSupplier = ({
  hiredOn,
  contractAmountInCents,
  paymentMethod,
  ...row
}: SupplierRow): Supplier => ({
  ...row,
  ...(hiredOn ? { hiredOn } : {}),
  ...(contractAmountInCents !== null ? { contractAmountInCents } : {}),
  ...(paymentMethod ? { paymentMethod } : {}),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const supplierValues = (input: SupplierInput) => [
  input.name,
  input.kind,
  input.document,
  input.phone,
  input.whatsapp,
  input.email || null,
  input.hiredOn ?? null,
  input.contractAmountInCents ?? null,
  input.billingCycle,
  input.paymentMethod ?? null,
  input.installments,
  input.paymentTerms,
  input.orders,
  input.contracts,
  input.notes,
  input.active,
];
export function createFinanceOperationsRepository(
  context: MysqlRepositoryContext,
) {
  async function tab(client: PoolClient, clinicId: string, id: string) {
    const result = await client.query<{ patientId: string }>(
      `SELECT patient_id AS "patientId" FROM patient_tabs WHERE clinic_id=$1 AND id=$2 AND status='open' FOR UPDATE`,
      [clinicId, id],
    );
    if (!result.rows[0])
      throw new DomainError(
        "PATIENT_TAB_NOT_OPEN",
        "Comanda aberta não encontrada.",
        409,
      );
    return result.rows[0];
  }
  async function total(client: PoolClient, clinicId: string, id: string) {
    const projected = await client.query<{ total: string }>(
      `SELECT coalesce((SELECT sum(quantity*unit_price_in_cents) FROM patient_tab_items WHERE tab_id=$2),0)+coalesce((SELECT sum(amount_in_cents) FROM patient_tab_services WHERE clinic_id=$1 AND tab_id=$2),0) AS total`,
      [clinicId, id],
    );
    if (Number(projected.rows[0]!.total) > 2147483647)
      throw new DomainError(
        "TAB_TOTAL_TOO_LARGE",
        "O valor da comanda excede o limite permitido.",
        400,
      );
    await client.query(
      `UPDATE patient_tabs SET total_in_cents=coalesce((SELECT sum(quantity*unit_price_in_cents) FROM patient_tab_items WHERE tab_id=$2),0)+coalesce((SELECT sum(amount_in_cents) FROM patient_tab_services WHERE clinic_id=$1 AND tab_id=$2),0) WHERE clinic_id=$1 AND id=$2`,
      [clinicId, id],
    );
  }
  async function classification(
    client: PoolClient,
    clinicId: string,
    input: {
      categoryId?: string | null | undefined;
      costCenterId?: string | null | undefined;
    },
    expectedKind?: "income" | "expense",
  ) {
    if (
      input.categoryId &&
      !(
        await client.query(
          "SELECT id FROM financial_categories WHERE clinic_id=$1 AND id=$2 AND ($3 IS NULL OR kind=$3)",
          [clinicId, input.categoryId, expectedKind ?? null],
        )
      ).rowCount
    )
      throw new DomainError(
        "FINANCE_CATEGORY_NOT_FOUND",
        "Categoria não encontrada.",
        404,
      );
    if (
      input.costCenterId &&
      !(
        await client.query(
          "SELECT id FROM cost_centers WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.costCenterId],
        )
      ).rowCount
    )
      throw new DomainError(
        "COST_CENTER_NOT_FOUND",
        "Centro de custo não encontrado.",
        404,
      );
  }
  async function covered(
    client: PoolClient,
    clinicId: string,
    patientId: string,
    serviceId: string,
    startsAt: string | Date,
  ) {
    return Boolean(
      (
        await client.query(
          `SELECT pp.id FROM patient_plans pp JOIN patient_plan_services pps ON pps.plan_id=pp.id AND pps.clinic_id=pp.clinic_id WHERE pp.clinic_id=$1 AND pp.patient_id=$2 AND pps.service_id=$3 AND pp.status='active' AND pp.source_tab_id IS NULL AND pp.valid_from<=${localDate("$4")} AND (pp.valid_until IS NULL OR pp.valid_until>=${localDate("$4")}) FOR UPDATE`,
          [clinicId, patientId, serviceId, startsAt],
        )
      ).rowCount,
    );
  }
  async function addService(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    tabId: string,
    input: PatientTabServiceInput,
  ) {
    await client.lock(clinicId);
    const current = await tab(client, clinicId, tabId);
    const result = await client.query<{
      id: string;
      serviceId: string;
      serviceName: string;
      professionalId: string;
      professionalName: string;
      price: number;
      startsAt: Date;
      sameBranch: boolean;
    }>(
      `SELECT a.id,a.service_id AS "serviceId",s.name AS "serviceName",a.professional_id AS "professionalId",p.full_name AS "professionalName",s.price_in_cents AS price,a.starts_at AS "startsAt",a.branch_id=(SELECT t.branch_id FROM patient_tabs t WHERE t.clinic_id=$1 AND t.id=$4) AS "sameBranch" FROM appointments a JOIN services s ON s.id=a.service_id AND s.clinic_id=a.clinic_id JOIN professionals p ON p.id=a.professional_id AND p.clinic_id=a.clinic_id WHERE a.clinic_id=$1 AND a.id=$2 AND a.patient_id=$3 AND a.status IN ('scheduled','confirmed') FOR UPDATE`,
      [clinicId, input.appointmentId, current.patientId, tabId],
    );
    const appointment = result.rows[0];
    if (!appointment)
      throw new DomainError(
        "APPOINTMENT_NOT_FOUND",
        "Atendimento do cliente não encontrado.",
        404,
      );
    if (!appointment.sameBranch)
      throw new DomainError(
        "BRANCH_MISMATCH",
        "O atendimento é de outra filial que não a da comanda.",
        409,
      );
    if (
      await covered(
        client,
        clinicId,
        current.patientId,
        appointment.serviceId,
        appointment.startsAt,
      )
    )
      throw new DomainError(
        "APPOINTMENT_ALREADY_BILLED",
        "O atendimento pertence a um plano ou outra comanda.",
        409,
      );
    await client.query(
      `INSERT INTO patient_tab_services(clinic_id,tab_id,appointment_id,service_id,service_name,professional_id,professional_name,amount_in_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        clinicId,
        tabId,
        appointment.id,
        appointment.serviceId,
        appointment.serviceName,
        appointment.professionalId,
        appointment.professionalName,
        input.amountInCents ?? appointment.price,
      ],
    );
    await total(client, clinicId, tabId);
    await context.addAdminAudit(
      client,
      clinicId,
      actorUserId,
      "tab.service_added",
      "patient_tab",
      tabId,
      { appointmentId: appointment.id },
    );
    return (await context.findPatientTab(clinicId, tabId, client))!;
  }
  return {
    async updateProduct(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: ProductUpdateInput,
    ) {
      try {
        return await context.inTransaction(async (client) => {
          for (const [key, kind] of [
            ["categoryId", "product_category"],
            ["brandId", "product_brand"],
          ] as const)
            if (
              input[key] &&
              !(
                await client.query(
                  "SELECT id FROM clinic_catalogs WHERE clinic_id=$1 AND id=$2 AND kind=$3",
                  [clinicId, input[key], kind],
                )
              ).rowCount
            )
              throw new DomainError(
                "CATALOG_NOT_FOUND",
                "Classificação do produto não encontrada.",
                404,
              );
          const result = await writeAndRead<ProductRow>(
            client,
            `UPDATE products SET name=$3,sku=$4,unit=$5,cost_in_cents=$6,sale_price_in_cents=$7,active=$8,category_id=CASE WHEN $9 THEN $10 ELSE category_id END,brand_id=CASE WHEN $11 THEN $12 ELSE brand_id END,sizes=COALESCE($13,sizes),restock_alert_at=CASE WHEN $14 THEN $15 ELSE restock_alert_at END,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
            [
              clinicId,
              id,
              input.name,
              input.sku,
              input.unit,
              input.costInCents,
              input.salePriceInCents,
              input.active,
              input.categoryId !== undefined,
              input.categoryId ?? null,
              input.brandId !== undefined,
              input.brandId ?? null,
              input.sizes ?? null,
              input.restockAlertAt !== undefined,
              input.restockAlertAt ?? null,
            ],
            `SELECT ${productColumns} FROM products WHERE clinic_id=$1 AND id=$2`,
          );
          const updated = result.rows[0];
          if (!updated) return null;
          if (
            input.sizeQuantities?.some(
              (entry) => !updated.sizes.includes(entry.size),
            )
          )
            throw new DomainError(
              "PRODUCT_SIZE_INVALID",
              "As quantidades devem usar os tamanhos do produto.",
              400,
            );
          let stockChanged = false;
          for (const { size, quantity } of input.sizeQuantities ?? []) {
            const delta = quantity - (await productStockOf(client, id, size));
            if (!delta) continue;
            const balance = await changeProductStock(
              client,
              clinicId,
              id,
              size,
              delta,
            );
            await client.query(
              `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id,size) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                clinicId,
                id,
                delta > 0 ? "adjustment_in" : "adjustment_out",
                delta,
                balance,
                sizeQuantityNotes,
                actorUserId,
                stockKey(size),
              ],
            );
            stockChanged = true;
          }
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "product.updated",
            "product",
            id,
            { name: input.name },
          );
          if (!stockChanged) return mapProduct(updated);
          const reloaded = await client.query<ProductRow>(
            `SELECT ${productColumns} FROM products WHERE clinic_id=$1 AND id=$2`,
            [clinicId, id],
          );
          return mapProduct(reloaded.rows[0]!);
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "PRODUCT_SKU_EXISTS",
            "Já existe um produto com este SKU.",
            409,
          );
        throw error;
      }
    },
    async updatePatientTabItem(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      itemId: string,
      input: PatientTabItemUpdate | null,
    ) {
      return context.inTransaction(async (client) => {
        await tab(client, clinicId, tabId);
        if (input && input.quantity * input.unitPriceInCents > 2147483647)
          throw new DomainError(
            "TAB_TOTAL_TOO_LARGE",
            "O valor do item excede o limite permitido.",
            400,
          );
        const result = await client.query<{
          productId: string;
          size: string;
          quantity: number;
        }>(
          `SELECT product_id AS "productId",size,quantity FROM patient_tab_items WHERE tab_id=$1 AND id=$2 FOR UPDATE`,
          [tabId, itemId],
        );
        const item = result.rows[0];
        if (!item)
          throw new DomainError(
            "PATIENT_TAB_ITEM_NOT_FOUND",
            "Item não encontrado.",
            404,
          );
        await client.query(
          "SELECT id FROM products WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, item.productId],
        );
        const delta = (input?.quantity ?? 0) - item.quantity;
        const balance = await changeProductStock(
          client,
          clinicId,
          item.productId,
          (item.size || undefined) as ProductSize | undefined,
          -delta,
        );
        if (delta)
          await client.query(
            "INSERT INTO stock_movements(clinic_id,product_id,patient_tab_id,kind,quantity,balance_after,notes,actor_user_id,size) VALUES($1,$2,$3,$4,$5,$6,'Ajuste de item na comanda',$7,$8)",
            [
              clinicId,
              item.productId,
              tabId,
              delta > 0 ? "sale" : "sale_reversal",
              -delta,
              balance,
              actorUserId,
              item.size,
            ],
          );
        if (input)
          await client.query(
            "UPDATE patient_tab_items SET quantity=$3,unit_price_in_cents=$4 WHERE tab_id=$1 AND id=$2",
            [tabId, itemId, input.quantity, input.unitPriceInCents],
          );
        else
          await client.query(
            "DELETE FROM patient_tab_items WHERE tab_id=$1 AND id=$2",
            [tabId, itemId],
          );
        await total(client, clinicId, tabId);
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "tab.item_updated",
          "patient_tab",
          tabId,
          { itemId },
        );
        return (await context.findPatientTab(clinicId, tabId, client))!;
      });
    },
    async addPatientTabService(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: PatientTabServiceInput,
    ) {
      try {
        return await context.inTransaction((client) =>
          addService(client, clinicId, actorUserId, tabId, input),
        );
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "APPOINTMENT_ALREADY_BILLED",
            "O atendimento pertence a um plano ou outra comanda.",
            409,
          );
        throw error;
      }
    },
    async removePatientTabService(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      itemId: string,
    ) {
      return context.inTransaction(async (client) => {
        await tab(client, clinicId, tabId);
        const result = await client.query(
          "DELETE FROM patient_tab_services WHERE clinic_id=$1 AND tab_id=$2 AND id=$3",
          [clinicId, tabId, itemId],
        );
        if (!result.rowCount)
          throw new DomainError(
            "PATIENT_TAB_ITEM_NOT_FOUND",
            "Serviço não encontrado.",
            404,
          );
        await total(client, clinicId, tabId);
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "tab.service_removed",
          "patient_tab",
          tabId,
          { itemId },
        );
        return (await context.findPatientTab(clinicId, tabId, client))!;
      });
    },
    async createPatientTabAppointment(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: Omit<AppointmentInput, "patientId">,
    ) {
      return context.inTransaction(async (client) => {
        const current = await tab(client, clinicId, tabId);
        const service = await client.query<{ duration: number }>(
          "SELECT duration_minutes AS duration FROM services WHERE clinic_id=$1 AND id=$2 AND active",
          [clinicId, input.serviceId],
        );
        if (!service.rows[0])
          throw new DomainError(
            "SERVICE_NOT_FOUND",
            "Serviço não encontrado.",
            404,
          );
        const related = await client.query(
          "SELECT pr.id FROM professionals pr,rooms r WHERE pr.clinic_id=$1 AND pr.id=$2 AND pr.active AND r.clinic_id=$1 AND r.id=$3 AND r.active",
          [clinicId, input.professionalId, input.roomId],
        );
        if (!related.rowCount)
          throw new DomainError(
            "RELATED_RECORD_NOT_FOUND",
            "Profissional ou sala não encontrado.",
            404,
          );
        const appointment = await context.insertAppointment(
          clinicId,
          input,
          service.rows[0].duration,
          { patientId: current.patientId, leadId: null },
          client,
        );
        return addService(client, clinicId, actorUserId, tabId, {
          appointmentId: appointment.id,
        });
      });
    },
    async listSuppliers(clinicId: string) {
      const result = await context.pool.query<SupplierRow>(
        `SELECT ${supplierColumns} FROM suppliers WHERE clinic_id=$1 ORDER BY name`,
        [clinicId],
      );
      return result.rows.map(mapSupplier);
    },
    async saveSupplier(
      clinicId: string,
      actorUserId: string,
      input: SupplierInput,
      id?: string,
    ) {
      return context.inTransaction(async (client) => {
        const supplierId = id ?? randomUUID();
        const result = await writeAndRead<SupplierRow>(
          client,
          id
            ? `UPDATE suppliers SET name=$3,kind=$4,document=$5,phone=$6,whatsapp=$7,email=$8,hired_on=$9,contract_amount_in_cents=$10,billing_cycle=$11,payment_method=$12,installments=$13,payment_terms=$14,orders=$15,contracts=$16,notes=$17,active=$18,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`
            : `INSERT INTO suppliers(clinic_id,id,name,kind,document,phone,whatsapp,email,hired_on,contract_amount_in_cents,billing_cycle,payment_method,installments,payment_terms,orders,contracts,notes,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [clinicId, supplierId, ...supplierValues(input)],
          `SELECT ${supplierColumns} FROM suppliers WHERE clinic_id=$1 AND id=$2`,
        );
        if (!result.rows[0]) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "supplier.saved",
          "supplier",
          result.rows[0].id,
          { name: input.name },
        );
        return mapSupplier(result.rows[0]);
      });
    },
    async createManualReceivable(
      clinicId: string,
      actorUserId: string,
      input: ManualReceivableInput,
    ) {
      return context.inTransaction(async (client) => {
        await classification(client, clinicId, input, "income");
        const id = randomUUID();
        const result = await client.query(
          `INSERT INTO receivables(id,clinic_id,patient_id,description,installment_number,installment_count,due_date,amount_in_cents,competence,category_id,cost_center_id,posted_on,branch_id) SELECT $11,$1,p.id,$3,1,1,$4,$5,coalesce($6,${localMonth("NOW(6)")}),$7,$8,coalesce($9,${localToday()}),${branchOrDefault("$10", "$1")} FROM patients p WHERE p.clinic_id=$1 AND p.id=$2 AND p.merged_into_patient_id IS NULL`,
          [
            clinicId,
            input.patientId,
            input.description,
            input.dueDate,
            input.amountInCents,
            input.competence ?? null,
            input.categoryId ?? null,
            input.costCenterId ?? null,
            input.postedOn ?? null,
            context.branchWriteId(),
            id,
          ],
        );
        if (!result.rowCount)
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        await client.query(
          "INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents) VALUES($1,$2,$3,'created',$4)",
          [clinicId, id, actorUserId, input.amountInCents],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "receivable.created",
          "receivable",
          id,
          { amountInCents: input.amountInCents },
        );
        return (await context.findReceivable(client, clinicId, id))!;
      });
    },
    async classifyFinancialEntry(
      clinicId: string,
      actorUserId: string,
      kind: "receivable" | "payable",
      id: string,
      input: FinancialClassification,
    ) {
      return context.inTransaction(async (client) => {
        await classification(
          client,
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
        const table = kind === "receivable" ? "receivables" : "payables",
          column = kind === "receivable" ? "competence" : "dre_competence";
        if (
          kind === "payable" &&
          (
            await client.query(
              "SELECT py.id FROM payables py JOIN commission_entries ce ON ce.id=py.commission_id AND ce.clinic_id=py.clinic_id WHERE py.clinic_id=$1 AND py.id=$2 AND ce.competence<>$3",
              [clinicId, id, input.competence],
            )
          ).rowCount
        )
          throw new DomainError(
            "COMMISSION_COMPETENCE_MISMATCH",
            "A despesa de comissão deve preservar a competência da origem.",
            400,
          );
        const result = await client.query(
          `UPDATE ${table} SET ${column}=$3,category_id=CASE WHEN $4 THEN $5 ELSE category_id END,cost_center_id=CASE WHEN $6 THEN $7 ELSE cost_center_id END,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
          [
            clinicId,
            id,
            input.competence,
            input.categoryId !== undefined,
            input.categoryId ?? null,
            input.costCenterId !== undefined,
            input.costCenterId ?? null,
          ],
        );
        if (!result.rowCount)
          throw new DomainError(
            "FINANCE_ENTRY_NOT_FOUND",
            "Lançamento não encontrado.",
            404,
          );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "finance.classified",
          kind,
          id,
          { ...input },
        );
        return kind === "receivable"
          ? (await context.findReceivable(client, clinicId, id))!
          : (await context.findPayable(client, clinicId, id))!;
      });
    },
    async setCategoryDreGroup(
      clinicId: string,
      actorUserId: string,
      id: string,
      dreGroup: DreGroup,
    ) {
      return context.inTransaction(async (client) => {
        const existing = await client.query<{ kind: "income" | "expense" }>(
          "SELECT kind FROM financial_categories WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, id],
        );
        if (!existing.rows[0]) return null;
        assertCategoryDreGroup(existing.rows[0].kind, dreGroup);
        const result = await writeAndRead<{
          id: string;
          clinicId: string;
          name: string;
          kind: "income" | "expense";
          active: boolean;
          dreGroup: DreGroup;
        }>(
          client,
          `UPDATE financial_categories SET dre_group=$3 WHERE clinic_id=$1 AND id=$2`,
          [clinicId, id, dreGroup],
          `SELECT id,clinic_id AS "clinicId",name,kind,active,dre_group AS "dreGroup" FROM financial_categories WHERE clinic_id=$1 AND id=$2`,
        );
        if (!result.rows[0]) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "category.dre_group",
          "financial_category",
          id,
          { dreGroup },
        );
        return result.rows[0];
      });
    },
    async getDreReport(
      clinicId: string,
      from: string,
      to: string,
      costCenterId?: string,
    ) {
      const branchIds = context.branchReadIds();
      return context.inTransaction(async (client) => {
        const receivables = await client.query<ReceivableRow>(
          `SELECT ${receivableColumns} FROM receivables r JOIN patients p ON p.id=r.patient_id AND p.clinic_id=r.clinic_id WHERE r.clinic_id=$1 AND ${branchClause("r.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const payables = await client.query<PayableRow>(
          `SELECT ${payableColumns} FROM payables py JOIN financial_categories fc ON fc.id=py.category_id LEFT JOIN cost_centers cc ON cc.id=py.cost_center_id WHERE py.clinic_id=$1 AND ${branchClause("py.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const categories = await client.query<{
          id: string;
          clinicId: string;
          name: string;
          kind: "income" | "expense";
          active: boolean;
          dreGroup: DreGroup;
        }>(
          `SELECT id,clinic_id AS "clinicId",name,kind,active,dre_group AS "dreGroup" FROM financial_categories WHERE clinic_id=$1`,
          [clinicId],
        );
        const commissions = await client.query<CommissionEntryRow>(
          `SELECT ce.id,ce.clinic_id AS "clinicId",ce.professional_id AS "professionalId",p.full_name AS "professionalName",ce.appointment_id AS "appointmentId",ce.group_attendance_id AS "groupAttendanceId",ce.service_id AS "serviceId",ce.rule_id AS "ruleId",ce.rule_snapshot AS "ruleSnapshot",ce.competence,ce.base_amount_in_cents AS "baseAmountInCents",ce.percentage,ce.amount_in_cents AS "amountInCents",ce.status,ce.paid_at AS "paidAt",ce.created_at AS "createdAt",ce.payroll_payable_id AS "payrollPayableId" FROM commission_entries ce JOIN professionals p ON p.id=ce.professional_id WHERE ce.clinic_id=$1 AND ${branchClause("p.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const ids = await client.query<{ id: string }>(
          `SELECT id FROM patient_tabs WHERE clinic_id=$1 AND ${branchClause("branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const scopedProfessionals = new Set(
          (
            await client.query<{ id: string }>(
              `SELECT id FROM professionals WHERE clinic_id=$1 AND ${branchClause("branch_id", 2)}`,
              [clinicId, branchIds],
            )
          ).rows.map((row) => row.id),
        );
        const tabs = [];
        for (const { id } of ids.rows) {
          const item = await context.findPatientTab(clinicId, id, client);
          if (item) tabs.push(item);
        }
        const settings = await client.query<{ timezone: string }>(
          "SELECT timezone FROM clinics WHERE id=$1",
          [clinicId],
        );
        return buildDre(
          from,
          to,
          receivables.rows.map(mapReceivable),
          payables.rows.map(mapPayable),
          categories.rows,
          commissions.rows.map(mapCommissionEntry),
          tabs,
          costCenterId,
          settings.rows[0]?.timezone,
          (await loadCommissionAdjustments(client, clinicId)).filter((item) =>
            scopedProfessionals.has(item.professionalId),
          ),
        );
      });
    },
  };
}
