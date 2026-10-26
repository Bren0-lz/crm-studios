import { receiptWithClinic } from "../../modules/finance/receipt.js";
import { assertPayableAmountEditable } from "../../modules/finance/payable-amount.js";
import { loadFinancialMonth, loadFinancialSummary } from "./financial-month.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  loadCommissionAdjustments,
  loadCommissionAccountPayments,
} from "./commission-reconciliation.js";
import {
  createTabServiceCredits,
  cancelTabServiceCredits,
} from "./tab-service-credits.js";
import { nextClinicSequence } from "./clinic-sequences.js";
import type { PaymentTiming, SettlementAdjustments } from "@crm/contracts";
import {
  type AdminUserCommissionInput,
  type CommissionRuleInput,
  type CostCenterInput,
  type DailyCash,
  type FinancialCategoryInput,
  formatSequenceNumber,
  type FinancialSummary,
  type FinancialWorkspace,
  type InventoryWorkspace,
  type PatientTab,
  type PatientTabCloseInput,
  type PatientTabInput,
  type PatientTabItemInput,
  type ProductSaleInput,
  type PayableInput,
  type PaymentMethod,
  type PaymentReceipt,
  type ProductInput,
  type Receivable,
  type ReceivableRenegotiation,
  type ReceivableRenegotiationInput,
  type ReceivableStatus,
  type ReceivedPayment,
  recurringPayableCompetences,
  recurringPayableDueDate,
  type RecurringPayableInput,
  saoPauloToday,
  type StockMovementInput,
  tabReceivableDescription,
} from "@crm/contracts";
import {
  buildDailyCash,
  DEFAULT_CLINIC_TIMEZONE,
} from "../../modules/finance/daily-cash.js";
import type { PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  type CommissionEntryRow,
  type CommissionRuleRow,
  type CostCenterRow,
  type FinancialCategoryRow,
  hasDatabaseCode,
  mapCommissionEntry,
  mapCommissionRule,
  mapPatientTab,
  mapPatientTabItem,
  mapPayable,
  mapProduct,
  mapRecurringPayable,
  mapStockMovement,
  type PatientTabItemRow,
  type PatientTabRow,
  payableColumns,
  type PayableRow,
  type ProductRow,
  recurringPayableColumns,
  type RecurringPayableRow,
  type StockMovementRow,
  branchClause,
} from "./helpers.js";

/** Insere um produto na comanda (reserva estoque); `false` se a comanda não existe. */
async function addTabItem(
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  tabId: string,
  input: PatientTabItemInput & { unitPriceInCents?: number | undefined },
) {
  const tab = await client.query<{ patientName: string; status: string }>(
    `SELECT p.full_name AS "patientName",t.status FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.id=$2 AND t.clinic_id=$1 FOR UPDATE OF t`,
    [clinicId, tabId],
  );
  if (!tab.rows[0]) return false;
  if (tab.rows[0].status !== "open")
    throw new DomainError(
      "PATIENT_TAB_NOT_OPEN",
      "Somente comandas abertas podem receber itens.",
      409,
    );
  const product = await client.query<{
    id: string;
    name: string;
    currentStock: number;
    salePriceInCents: number;
    costInCents: number;
    sameBranch: boolean;
  }>(
    `SELECT id,name,current_stock AS "currentStock",sale_price_in_cents AS "salePriceInCents",cost_in_cents AS "costInCents",branch_id=(SELECT branch_id FROM patient_tabs WHERE clinic_id=$1 AND id=$3) AS "sameBranch" FROM products WHERE id=$2 AND clinic_id=$1 AND active FOR UPDATE`,
    [clinicId, input.productId, tabId],
  );
  const productRow = product.rows[0];
  if (!productRow)
    throw new DomainError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
  if (!productRow.sameBranch)
    throw new DomainError(
      "BRANCH_MISMATCH",
      "O produto é de outra filial que não a da comanda.",
      409,
    );
  if (productRow.currentStock < input.quantity)
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      "O estoque disponível é insuficiente.",
      409,
    );
  await client.query(
    `INSERT INTO patient_tab_items(clinic_id,tab_id,product_id,quantity,unit_price_in_cents,unit_cost_in_cents) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tab_id,product_id) DO UPDATE SET quantity=patient_tab_items.quantity+EXCLUDED.quantity`,
    [
      clinicId,
      tabId,
      productRow.id,
      input.quantity,
      input.unitPriceInCents ?? productRow.salePriceInCents,
      productRow.costInCents,
    ],
  );
  const balance = productRow.currentStock - input.quantity;
  await client.query(
    `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
    [productRow.id, balance],
  );
  await client.query(
    `INSERT INTO stock_movements(clinic_id,product_id,patient_tab_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,'sale',$4,$5,$6,$7)`,
    [
      clinicId,
      productRow.id,
      tabId,
      -input.quantity,
      balance,
      `Reserva na comanda de ${tab.rows[0].patientName}`,
      actorUserId,
    ],
  );
  await client.query(
    `UPDATE patient_tabs SET total_in_cents=(SELECT coalesce(sum(quantity*unit_price_in_cents),0) FROM patient_tab_items WHERE tab_id=$1)+(SELECT coalesce(sum(amount_in_cents),0) FROM patient_tab_services WHERE tab_id=$1 AND clinic_id=$2) WHERE id=$1 AND clinic_id=$2`,
    [tabId, clinicId],
  );
  return true;
}

/** Fecha a comanda gerando a conta a receber; `false` se a comanda não existe. */
async function closeTab(
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  tabId: string,
  input: PatientTabCloseInput,
) {
  const tab = await client.query<{
    patientId: string;
    status: string;
    totalInCents: number;
    patientName: string;
    openedOn: string;
  }>(
    `SELECT t.patient_id AS "patientId",t.status,t.total_in_cents AS "totalInCents",p.full_name AS "patientName",to_char(t.opened_at AT TIME ZONE c.timezone,'YYYY-MM-DD') AS "openedOn"
     FROM patient_tabs t
     JOIN patients p ON p.id=t.patient_id AND p.clinic_id=t.clinic_id
     JOIN clinics c ON c.id=t.clinic_id
     WHERE t.id=$2 AND t.clinic_id=$1 FOR UPDATE OF t`,
    [clinicId, tabId],
  );
  const row = tab.rows[0];
  if (!row) return false;
  if (row.status !== "open" || row.totalInCents === 0)
    throw new DomainError(
      "PATIENT_TAB_CANNOT_CLOSE",
      "A comanda precisa estar aberta e conter ao menos um item.",
      409,
    );
  if (
    (input.categoryId &&
      !(
        await client.query(
          "SELECT id FROM financial_categories WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.categoryId],
        )
      ).rowCount) ||
    (input.costCenterId &&
      !(
        await client.query(
          "SELECT id FROM cost_centers WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.costCenterId],
        )
      ).rowCount)
  )
    throw new DomainError(
      "FINANCE_CONTEXT_NOT_FOUND",
      "Categoria ou centro de custo não encontrado.",
      404,
    );
  await createTabServiceCredits(client, clinicId, actorUserId, tabId);
  const paid = input.settlement === "paid";
  const receivable = await client.query<{ id: string }>(
    `INSERT INTO receivables(clinic_id,patient_id,description,installment_number,installment_count,due_date,amount_in_cents,status,paid_at,payment_method,branch_id) VALUES($1,$2,$3,1,1,$4,$5,$6,$7,$8,(SELECT branch_id FROM patient_tabs WHERE clinic_id=$1 AND id=$9)) RETURNING id`,
    [
      clinicId,
      row.patientId,
      tabReceivableDescription(row.patientName, row.openedOn),
      input.dueDate,
      row.totalInCents,
      paid ? "paid" : "open",
      paid ? new Date() : null,
      paid ? input.paymentMethod : null,
      tabId,
    ],
  );
  const receivableId = receivable.rows[0]!.id;
  await client.query(
    "UPDATE receivables SET category_id=$3,cost_center_id=$4 WHERE clinic_id=$1 AND id=$2",
    [
      clinicId,
      receivableId,
      input.categoryId ?? null,
      input.costCenterId ?? null,
    ],
  );
  await client.query(
    `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'created',$4,$5)`,
    [
      clinicId,
      receivableId,
      actorUserId,
      row.totalInCents,
      JSON.stringify({ source: "patient_tab", tabId }),
    ],
  );
  if (paid)
    await client.query(
      `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'payment',$4,$5)`,
      [
        clinicId,
        receivableId,
        actorUserId,
        row.totalInCents,
        JSON.stringify({
          paymentMethod: input.paymentMethod,
          source: "patient_tab",
        }),
      ],
    );
  await client.query(
    `UPDATE patient_tabs SET status='closed',payment_status=$2,receivable_id=$3,closed_at=now() WHERE id=$1`,
    [tabId, input.settlement, receivableId],
  );
  return true;
}

export function createFinanceRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async setAdminUserCommission(
      clinicId: string,
      actorUserId: string,
      userId: string,
      input: AdminUserCommissionInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const user = await client.query(
          `SELECT id FROM users WHERE clinic_id = $1 AND id = $2`,
          [clinicId, userId],
        );
        if (!user.rows[0]) return null;
        await repositoryContext.insertUserCommissionRule(
          client,
          clinicId,
          actorUserId,
          userId,
          input,
        );
        return repositoryContext.findAdminUser(client, clinicId, userId);
      });
    },

    async getInventoryWorkspace(clinicId: string): Promise<InventoryWorkspace> {
      const branchIds = repositoryContext.branchReadIds();
      const [
        productsResult,
        movementsResult,
        tabsResult,
        itemsResult,
        servicesResult,
      ] = await Promise.all([
        repositoryContext.pool.query<ProductRow>(
          `SELECT id,clinic_id AS "clinicId",branch_id AS "branchId",name,sku,unit,category_id AS "categoryId",brand_id AS "brandId",cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE clinic_id=$1 AND ${branchClause("branch_id", 2)} ORDER BY name`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<StockMovementRow>(
          `SELECT sm.id,sm.clinic_id AS "clinicId",sm.product_id AS "productId",p.name AS "productName",sm.kind,sm.quantity,sm.balance_after AS "balanceAfter",sm.notes,sm.patient_tab_id AS "patientTabId",sm.created_at AS "createdAt" FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE sm.clinic_id=$1 AND ${branchClause("p.branch_id", 2)} ORDER BY sm.created_at DESC LIMIT 500`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<PatientTabRow>(
          `SELECT t.id,t.clinic_id AS "clinicId",t.branch_id AS "branchId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 AND ${branchClause("t.branch_id", 2)} ORDER BY t.opened_at DESC`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<PatientTabItemRow>(
          `SELECT i.id,i.tab_id AS "tabId",i.product_id AS "productId",p.name AS "productName",i.quantity,i.unit_price_in_cents AS "unitPriceInCents",i.unit_cost_in_cents AS "unitCostInCents" FROM patient_tab_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 ORDER BY i.created_at`,
          [clinicId],
        ),
        repositoryContext.pool.query<
          import("@crm/contracts").PatientTabServiceItem & { tabId: string }
        >(
          `SELECT id,tab_id AS "tabId",appointment_id AS "appointmentId",service_id AS "serviceId",service_name AS "serviceName",professional_id AS "professionalId",professional_name AS "professionalName",amount_in_cents AS "amountInCents" FROM patient_tab_services WHERE clinic_id=$1`,
          [clinicId],
        ),
      ]);
      const products = productsResult.rows.map(mapProduct);
      const tabs = tabsResult.rows.map((row) =>
        mapPatientTab(
          row,
          itemsResult.rows
            .filter((item) => item.tabId === row.id)
            .map(mapPatientTabItem),
        ),
      );
      for (const tab of tabs)
        tab.services = servicesResult.rows.filter(
          (item) => item.tabId === tab.id,
        );
      return {
        products,
        movements: movementsResult.rows.map(mapStockMovement),
        tabs,
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
      actorUserId: string,
      input: ProductInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        for (const [key, kind] of [
          ["categoryId", "product_category"],
          ["brandId", "product_brand"],
        ] as const)
          if (
            input[key] &&
            !(
              await client.query(
                "SELECT id FROM clinic_catalogs WHERE clinic_id=$1 AND id=$2 AND kind=$3 AND active",
                [clinicId, input[key], kind],
              )
            ).rowCount
          )
            throw new DomainError(
              "CATALOG_NOT_FOUND",
              "Classificação do produto não encontrada.",
              404,
            );
        const result = await client.query<ProductRow>(
          `INSERT INTO products(clinic_id,name,sku,unit,cost_in_cents,sale_price_in_cents,current_stock,minimum_stock,category_id,brand_id,branch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,clinic_id AS "clinicId",branch_id AS "branchId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,category_id AS "categoryId",brand_id AS "brandId",created_at AS "createdAt",updated_at AS "updatedAt"`,
          [
            clinicId,
            input.name,
            input.sku,
            input.unit,
            input.costInCents,
            input.salePriceInCents,
            input.initialStock,
            input.minimumStock,
            input.categoryId ?? null,
            input.brandId ?? null,
            repositoryContext.branchWriteId(),
          ],
        );
        const product = result.rows[0]!;
        if (input.initialStock > 0)
          await client.query(
            `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,'initial_stock',$3,$3,'Estoque inicial',$4)`,
            [clinicId, product.id, input.initialStock, actorUserId],
          );
        await client.query("COMMIT");
        return mapProduct(product);
      } catch (error) {
        await client.query("ROLLBACK");
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "PRODUCT_SKU_EXISTS",
            "Já existe um produto com este SKU.",
            409,
          );
        throw error;
      } finally {
        client.release();
      }
    },

    async createStockMovement(
      clinicId: string,
      actorUserId: string,
      input: StockMovementInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const product = await client.query<ProductRow>(
          `SELECT id,clinic_id AS "clinicId",name,sku,unit,cost_in_cents AS "costInCents",sale_price_in_cents AS "salePriceInCents",current_stock AS "currentStock",minimum_stock AS "minimumStock",active,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE id=$2 AND clinic_id=$1 FOR UPDATE`,
          [clinicId, input.productId],
        );
        const row = product.rows[0];
        if (!row)
          throw new DomainError(
            "PRODUCT_NOT_FOUND",
            "Produto não encontrado.",
            404,
          );
        const quantity = ["adjustment_out", "loss"].includes(input.kind)
          ? -input.quantity
          : input.quantity;
        const balance = row.currentStock + quantity;
        if (balance < 0)
          throw new DomainError(
            "INSUFFICIENT_STOCK",
            "O estoque disponível é insuficiente.",
            409,
          );
        await client.query(
          `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
          [row.id, balance],
        );
        const movement = await client.query<StockMovementRow>(
          `INSERT INTO stock_movements(clinic_id,product_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,clinic_id AS "clinicId",product_id AS "productId",$8::text AS "productName",kind,quantity,balance_after AS "balanceAfter",notes,patient_tab_id AS "patientTabId",created_at AS "createdAt"`,
          [
            clinicId,
            row.id,
            input.kind,
            quantity,
            balance,
            input.notes,
            actorUserId,
            row.name,
          ],
        );
        await client.query("COMMIT");
        return mapStockMovement(movement.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async openPatientTab(
      clinicId: string,
      actorUserId: string,
      input: PatientTabInput,
    ) {
      const result = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO patient_tabs(clinic_id,patient_id,notes,opened_by_user_id,branch_id) SELECT $1,p.id,$3,$4,$5 FROM patients p WHERE p.id=$2 AND p.clinic_id=$1 AND p.status='active' RETURNING id`,
        [
          clinicId,
          input.patientId,
          input.notes || null,
          actorUserId,
          repositoryContext.branchWriteId(),
        ],
      );
      if (!result.rows[0])
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      return (await repositoryContext.findPatientTab(
        clinicId,
        result.rows[0].id,
      ))!;
    },

    async addPatientTabItem(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: PatientTabItemInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        if (!(await addTabItem(client, clinicId, actorUserId, tabId, input)))
          return null;
        return repositoryContext.findPatientTab(clinicId, tabId, client);
      });
    },

    async closePatientTab(
      clinicId: string,
      actorUserId: string,
      tabId: string,
      input: PatientTabCloseInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        if (!(await closeTab(client, clinicId, actorUserId, tabId, input)))
          return null;
        return repositoryContext.findPatientTab(clinicId, tabId, client);
      });
    },

    async createProductSale(
      clinicId: string,
      actorUserId: string,
      input: ProductSaleInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const opened = await client.query<{ id: string }>(
          `INSERT INTO patient_tabs(clinic_id,patient_id,notes,opened_by_user_id,branch_id) SELECT $1,p.id,$3,$4,$5 FROM patients p WHERE p.id=$2 AND p.clinic_id=$1 AND p.status='active' RETURNING id`,
          [
            clinicId,
            input.patientId,
            input.notes || null,
            actorUserId,
            repositoryContext.branchWriteId(),
          ],
        );
        const tabId = opened.rows[0]?.id;
        if (!tabId)
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        for (const item of input.items)
          await addTabItem(client, clinicId, actorUserId, tabId, item);
        await closeTab(client, clinicId, actorUserId, tabId, {
          settlement: input.settlement,
          dueDate: input.dueDate,
          ...(input.paymentMethod
            ? { paymentMethod: input.paymentMethod }
            : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.costCenterId ? { costCenterId: input.costCenterId } : {}),
        });
        return (await repositoryContext.findPatientTab(
          clinicId,
          tabId,
          client,
        ))!;
      });
    },

    async cancelPatientTab(
      clinicId: string,
      actorUserId: string,
      tabId: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const tab = await client.query<{
          status: PatientTab["status"];
          patientName: string;
          receivableId: string | null;
          totalInCents: number;
        }>(
          `SELECT t.status,p.full_name AS "patientName",t.receivable_id AS "receivableId",t.total_in_cents AS "totalInCents" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.id=$2 AND t.clinic_id=$1 FOR UPDATE OF t`,
          [clinicId, tabId],
        );
        const row = tab.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        if (
          row.receivableId &&
          (
            await client.query(
              "SELECT id FROM receivables WHERE clinic_id=$1 AND id=$2 AND status='paid' FOR UPDATE",
              [clinicId, row.receivableId],
            )
          ).rowCount
        )
          throw new DomainError(
            "PATIENT_TAB_PAYMENT_REVERSAL_REQUIRED",
            "Estorne o pagamento no Financeiro antes de cancelar a comanda.",
            409,
          );
        if (row.status === "cancelled")
          throw new DomainError(
            "PATIENT_TAB_ALREADY_CANCELLED",
            "A comanda já foi cancelada.",
            409,
          );
        await cancelTabServiceCredits(client, clinicId, actorUserId, tabId);
        const items = await client.query<{
          productId: string;
          quantity: number;
        }>(
          `SELECT product_id AS "productId",quantity FROM patient_tab_items WHERE tab_id=$1 ORDER BY product_id FOR UPDATE`,
          [tabId],
        );
        for (const item of items.rows) {
          const product = await client.query<{
            name: string;
            currentStock: number;
          }>(
            `SELECT name,current_stock AS "currentStock" FROM products WHERE id=$1 FOR UPDATE`,
            [item.productId],
          );
          const balance = product.rows[0]!.currentStock + item.quantity;
          await client.query(
            `UPDATE products SET current_stock=$2,updated_at=now() WHERE id=$1`,
            [item.productId, balance],
          );
          await client.query(
            `INSERT INTO stock_movements(clinic_id,product_id,patient_tab_id,kind,quantity,balance_after,notes,actor_user_id) VALUES($1,$2,$3,'sale_reversal',$4,$5,$6,$7)`,
            [
              clinicId,
              item.productId,
              tabId,
              item.quantity,
              balance,
              `Estorno da comanda de ${row.patientName}`,
              actorUserId,
            ],
          );
        }
        if (row.receivableId) {
          await client.query(
            `UPDATE receivables SET status='cancelled',paid_at=NULL,payment_method=NULL,updated_at=now() WHERE id=$1`,
            [row.receivableId],
          );
          await client.query(
            `INSERT INTO financial_events(clinic_id,receivable_id,actor_user_id,kind,amount_in_cents,metadata) VALUES($1,$2,$3,'cancellation',$4,$5)`,
            [
              clinicId,
              row.receivableId,
              actorUserId,
              row.totalInCents,
              JSON.stringify({ source: "patient_tab", tabId }),
            ],
          );
        }
        await client.query(
          `UPDATE patient_tabs SET status='cancelled',payment_status='cancelled',cancelled_at=now() WHERE id=$1`,
          [tabId],
        );
        const updated = await repositoryContext.findPatientTab(
          clinicId,
          tabId,
          client,
        );
        await client.query("COMMIT");
        return updated;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getFinancialSummary(clinicId: string): Promise<FinancialSummary> {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        const settings = await client.query<{ timezone: string }>(
          "SELECT timezone FROM clinics WHERE id=$1",
          [clinicId],
        );
        return loadFinancialSummary(
          client,
          clinicId,
          settings.rows[0]?.timezone ?? "America/Sao_Paulo",
          repositoryContext.branchReadIds(),
        );
      });
    },

    async settleReceivable(
      clinicId: string,
      actorUserId: string,
      receivableId: string,
      paymentMethod: PaymentMethod,
      timing?: PaymentTiming,
      adjustments?: SettlementAdjustments,
    ) {
      return repositoryContext.changeReceivablePayment(
        clinicId,
        actorUserId,
        receivableId,
        "payment",
        paymentMethod,
        timing,
        adjustments,
      );
    },

    async reverseReceivablePayment(
      clinicId: string,
      actorUserId: string,
      receivableId: string,
    ) {
      return repositoryContext.changeReceivablePayment(
        clinicId,
        actorUserId,
        receivableId,
        "payment_reversal",
      );
    },

    async adjustReceivable(
      clinicId: string,
      actorUserId: string,
      receivableId: string,
      amountInCents: number,
      reason: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          status: ReceivableStatus;
          amountInCents: number;
        }>(
          `SELECT status, amount_in_cents AS "amountInCents"
         FROM receivables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, receivableId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (current.rows[0].status !== "open")
          throw new DomainError(
            "RECEIVABLE_NOT_OPEN",
            "Somente contas abertas podem ser ajustadas.",
            409,
          );
        const difference = amountInCents - current.rows[0].amountInCents;
        await client.query(
          `UPDATE receivables SET amount_in_cents = $3, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, receivableId, amountInCents],
        );
        await client.query(
          `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
         VALUES ($1,$2,$3,'adjustment',$4,$5)`,
          [clinicId, receivableId, actorUserId, difference, { reason }],
        );
        const receivable = await repositoryContext.findReceivable(
          client,
          clinicId,
          receivableId,
        );
        await client.query("COMMIT");
        return receivable;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getPaymentReceipt(
      clinicId: string,
      receivableId: string,
    ): Promise<PaymentReceipt | null> {
      const receivable = await repositoryContext.findReceivable(
        repositoryContext.pool,
        clinicId,
        receivableId,
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
      const extra = await repositoryContext.pool.query<{
        clinicName: string;
        clinicLegalName: string | null;
        clinicTaxId: string | null;
        clinicAddress: string | null;
        patientPhone: string | null;
        discountInCents: number | null;
        interestInCents: number | null;
      }>(
        `SELECT c.name AS "clinicName", c.legal_name AS "clinicLegalName",
                c.tax_id AS "clinicTaxId", c.address AS "clinicAddress",
                coalesce(nullif(p.whatsapp, ''), p.phone) AS "patientPhone",
                fe.discount_in_cents AS "discountInCents",
                fe.interest_in_cents AS "interestInCents"
         FROM receivables r
         JOIN clinics c ON c.id = r.clinic_id
         JOIN patients p ON p.id = r.patient_id AND p.clinic_id = r.clinic_id
         LEFT JOIN LATERAL (
           SELECT discount_in_cents, interest_in_cents FROM financial_events
           WHERE clinic_id = r.clinic_id AND receivable_id = r.id AND kind = 'payment'
           ORDER BY created_at DESC LIMIT 1
         ) fe ON true
         WHERE r.clinic_id = $1 AND r.id = $2`,
        [clinicId, receivableId],
      );
      const row = extra.rows[0];
      // Número do recibo: atribuído na primeira emissão e repetido nas reemissões (QM15).
      const receiptNumber = await repositoryContext.inTransaction(
        async (client) => {
          const current = await client.query<{ receiptNumber: number | null }>(
            `SELECT receipt_number AS "receiptNumber" FROM receivables WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
            [clinicId, receivableId],
          );
          const stored = current.rows[0]?.receiptNumber;
          if (stored) return stored;
          const next = await nextClinicSequence(client, clinicId, "receipt");
          await client.query(
            "UPDATE receivables SET receipt_number=$3 WHERE clinic_id=$1 AND id=$2",
            [clinicId, receivableId, next],
          );
          return next;
        },
      );
      return receiptWithClinic({
        receiptNumber: formatSequenceNumber("REC", receiptNumber),
        patientName: receivable.patientName,
        patientPhone: row?.patientPhone ?? "",
        description: receivable.description,
        amountInCents: receivable.amountInCents,
        paymentMethod: receivable.paymentMethod,
        paidAt: receivable.paidAt,
        clinicName: row?.clinicName ?? "",
        clinicLegalName: row?.clinicLegalName ?? "",
        clinicTaxId: row?.clinicTaxId ?? "",
        clinicAddress: row?.clinicAddress ?? "",
        discountInCents: row?.discountInCents ?? 0,
        interestInCents: row?.interestInCents ?? 0,
      });
    },

    async getFinancialWorkspace(clinicId: string): Promise<FinancialWorkspace> {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        const settings = await client.query<{ timezone: string }>(
            "SELECT timezone FROM clinics WHERE id=$1",
            [clinicId],
          ),
          timezone = settings.rows[0]?.timezone ?? "America/Sao_Paulo";
        const branchIds = repositoryContext.branchReadIds();
        const totals = await loadFinancialMonth(
          client,
          clinicId,
          timezone,
          branchIds,
        );
        const [summary, categories, costCenters, payables, rules, commissions] =
          await Promise.all([
            loadFinancialSummary(client, clinicId, timezone, branchIds, totals),
            client.query<FinancialCategoryRow>(
              `SELECT id, clinic_id AS "clinicId", name, kind, active, dre_group AS "dreGroup"
         FROM financial_categories WHERE clinic_id = $1 AND active ORDER BY name`,
              [clinicId],
            ),
            client.query<CostCenterRow>(
              `SELECT id, clinic_id AS "clinicId", name, active
         FROM cost_centers WHERE clinic_id = $1 AND active ORDER BY name`,
              [clinicId],
            ),
            client.query<PayableRow>(
              `SELECT ${payableColumns} FROM payables py
         JOIN financial_categories fc ON fc.id = py.category_id
         LEFT JOIN cost_centers cc ON cc.id = py.cost_center_id
         WHERE py.clinic_id = $1 AND ${branchClause("py.branch_id", 2)}
         ORDER BY py.due_date, py.created_at`,
              [clinicId, branchIds],
            ),
            // Só regras de profissional (o JOIN exclui as do usuário, que ficam na Administração).
            client.query<CommissionRuleRow>(
              `SELECT cr.id, cr.clinic_id AS "clinicId", cr.professional_id AS "professionalId",
                p.full_name AS "professionalName", cr.percentage,cr.kind,cr.fixed_amount_in_cents AS "fixedAmountInCents",cr.service_id AS "serviceId",cr.effective_until::text AS "effectiveUntil",
                cr.effective_from::text AS "effectiveFrom", cr.active,
                cr.created_at AS "createdAt"
         FROM commission_rules cr JOIN professionals p ON p.id = cr.professional_id
         WHERE cr.clinic_id = $1 AND cr.active ORDER BY p.full_name`,
              [clinicId],
            ),
            client.query<CommissionEntryRow>(
              `SELECT ce.id, ce.clinic_id AS "clinicId", ce.professional_id AS "professionalId",
                p.full_name AS "professionalName", ce.appointment_id AS "appointmentId",ce.group_attendance_id AS "groupAttendanceId",ce.service_id AS "serviceId",ce.rule_id AS "ruleId",ce.rule_snapshot AS "ruleSnapshot",
                ce.competence, ce.base_amount_in_cents AS "baseAmountInCents",
                ce.percentage, ce.amount_in_cents AS "amountInCents", ce.status,
                ce.paid_at AS "paidAt", ce.created_at AS "createdAt"
         FROM commission_entries ce JOIN professionals p ON p.id = ce.professional_id
         WHERE ce.clinic_id = $1 AND ${branchClause("p.branch_id", 2)}
         ORDER BY ce.competence DESC, p.full_name`,
              [clinicId, branchIds],
            ),
          ]);
        const mapped = payables.rows.map(mapPayable).map((item) => ({
          ...item,
          overdue:
            item.status === "open" &&
            item.dueDate < clinicDateOf(new Date(), timezone),
        }));
        const paidExpensesThisMonthInCents = totals.expensePaidInCents;
        const mappedCommissions = commissions.rows.map(mapCommissionEntry);
        const clinicMonth = clinicDateOf(new Date(), timezone).slice(0, 7);
        const commissionEvents = (
            await client.query<{
              commissionId: string;
              occurredAt: Date;
              amountInCents: number;
            }>(
              `SELECT e.commission_id AS "commissionId",e.occurred_at AS "occurredAt",e.amount_in_cents AS "amountInCents" FROM commission_payment_events e JOIN commission_entries ce ON ce.id=e.commission_id JOIN professionals p ON p.id=ce.professional_id WHERE e.clinic_id=$1 AND ${branchClause("p.branch_id", 2)}`,
              [clinicId, branchIds],
            )
          ).rows,
          tracked = new Set(commissionEvents.map((item) => item.commissionId));
        const paidCommissionsThisMonthInCents =
          commissionEvents
            .filter(
              (item) =>
                clinicDateOf(item.occurredAt, timezone).slice(0, 7) ===
                clinicMonth,
            )
            .reduce((sum, item) => sum + item.amountInCents, 0) +
          mappedCommissions
            .filter(
              (item) =>
                item.status === "paid" &&
                item.paidAt &&
                clinicDateOf(new Date(item.paidAt), timezone).slice(0, 7) ===
                  clinicMonth &&
                !tracked.has(item.id) &&
                !mapped.some(
                  (expense) =>
                    expense.commissionId === item.id &&
                    expense.status !== "cancelled",
                ),
            )
            .reduce((sum, item) => sum + item.amountInCents, 0);
        // Acertos de comissão seguem a filial do profissional.
        const scopedProfessionals = new Set(
          (
            await client.query<{ id: string }>(
              `SELECT id FROM professionals WHERE clinic_id=$1 AND ${branchClause("branch_id", 2)}`,
              [clinicId, branchIds],
            )
          ).rows.map((row) => row.id),
        );
        const adjustments = (
            await loadCommissionAdjustments(client, clinicId)
          ).filter((item) => scopedProfessionals.has(item.professionalId)),
          accountPayments = (
            await loadCommissionAccountPayments(client, clinicId)
          ).filter((item) => scopedProfessionals.has(item.professionalId));
        return {
          ...(adjustments.length ? { commissionAdjustments: adjustments } : {}),
          ...(accountPayments.length
            ? { commissionAccountPayments: accountPayments }
            : {}),
          summary,
          categories: categories.rows,
          costCenters: costCenters.rows,
          payables: mapped,
          payableOpenInCents: mapped
            .filter((item) => item.status === "open")
            .reduce((sum, item) => sum + item.amountInCents, 0),
          payableOverdueInCents: mapped
            .filter((item) => item.overdue)
            .reduce((sum, item) => sum + item.amountInCents, 0),
          paidExpensesThisMonthInCents,
          cashBalanceThisMonthInCents:
            totals.receiptCashInCents -
            totals.expenseCashOutInCents -
            paidCommissionsThisMonthInCents,
          commissionRules: rules.rows.map(mapCommissionRule),
          commissions: mappedCommissions,
          commissionOpenInCents:
            commissions.rows
              .filter((item) => item.status === "open")
              .reduce((sum, item) => sum + item.amountInCents, 0) +
            adjustments
              .filter((item) => item.status === "open")
              .reduce((sum, item) => sum + item.amountInCents, 0),
          paidCommissionsThisMonthInCents,
        };
      });
    },

    async createFinancialCategory(
      clinicId: string,
      input: FinancialCategoryInput,
    ) {
      try {
        const result = await repositoryContext.pool.query<FinancialCategoryRow>(
          `INSERT INTO financial_categories (clinic_id, name, kind)
         VALUES ($1,$2,$3)
         RETURNING id, clinic_id AS "clinicId", name, kind, active`,
          [clinicId, input.name, input.kind],
        );
        return result.rows[0]!;
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "FINANCIAL_CATEGORY_DUPLICATE",
            "Esta categoria já existe.",
            409,
          );
        throw error;
      }
    },

    async createCostCenter(clinicId: string, input: CostCenterInput) {
      try {
        const result = await repositoryContext.pool.query<CostCenterRow>(
          `INSERT INTO cost_centers (clinic_id, name) VALUES ($1,$2)
         RETURNING id, clinic_id AS "clinicId", name, active`,
          [clinicId, input.name],
        );
        return result.rows[0]!;
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "COST_CENTER_DUPLICATE",
            "Este centro de custo já existe.",
            409,
          );
        throw error;
      }
    },

    async createPayable(
      clinicId: string,
      actorUserId: string,
      input: PayableInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        let commissionCompetence: string | undefined;
        if (input.commissionId) {
          const result = await client.query<{
            status: string;
            amount: number;
            competence: string;
          }>(
            "SELECT status,amount_in_cents AS amount,competence FROM commission_entries WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
            [clinicId, input.commissionId],
          );
          const item = result.rows[0];
          if (
            !item ||
            item.status !== "open" ||
            item.amount !== input.amountInCents ||
            (
              await client.query(
                "SELECT id FROM payables WHERE clinic_id=$1 AND commission_id=$2 AND status<>'cancelled'",
                [clinicId, input.commissionId],
              )
            ).rowCount
          )
            throw new DomainError(
              "COMMISSION_EXPENSE_INVALID",
              "Selecione uma comissão aberta, sem despesa vinculada, e preserve seu valor.",
              409,
            );
          if (input.dreCompetence && input.dreCompetence !== item.competence)
            throw new DomainError(
              "COMMISSION_COMPETENCE_MISMATCH",
              "A despesa de comissão deve preservar a competência da origem.",
              400,
            );
          commissionCompetence = item.competence;
        }

        if (
          input.supplierId &&
          !(
            await client.query(
              "SELECT id FROM suppliers WHERE clinic_id=$1 AND id=$2 AND active",
              [clinicId, input.supplierId],
            )
          ).rowCount
        )
          throw new DomainError(
            "SUPPLIER_NOT_FOUND",
            "Fornecedor não encontrado.",
            404,
          );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO payables
           (clinic_id, description, supplier, category_id, cost_center_id,
            due_date, amount_in_cents, notes, created_by_user_id,supplier_id,posted_on,dre_competence,commission_id,
            branch_id)
         SELECT $1,$2,$3,fc.id,cc.id,$6,$7,$8,$9,$10,$11::date,$12,$13,
           -- Despesa de comissão fica na filial do profissional.
           coalesce((SELECT pr.branch_id FROM commission_entries ce
             JOIN professionals pr ON pr.id = ce.professional_id
             WHERE ce.clinic_id = $1 AND ce.id = $13), $14)
         FROM financial_categories fc
         LEFT JOIN cost_centers cc
           ON cc.clinic_id = $1 AND cc.id = $5::uuid AND cc.active
         WHERE fc.clinic_id = $1 AND fc.id = $4 AND fc.kind = 'expense' AND fc.active
           AND ($5::uuid IS NULL OR cc.id IS NOT NULL)
         RETURNING id`,
          [
            clinicId,
            input.description,
            input.supplier || null,
            input.categoryId,
            input.costCenterId ?? null,
            input.dueDate,
            input.amountInCents,
            input.notes || null,
            actorUserId,
            input.supplierId ?? null,
            input.postedOn ?? null,
            commissionCompetence ?? input.dreCompetence ?? null,
            input.commissionId ?? null,
            repositoryContext.branchWriteId(),
          ],
        );
        if (!inserted.rows[0])
          throw new DomainError(
            "FINANCIAL_CLASSIFICATION_NOT_FOUND",
            "Categoria de despesa ou centro de custo não encontrado.",
            404,
          );
        await client.query(
          `INSERT INTO payable_events
           (clinic_id, payable_id, actor_user_id, kind, amount_in_cents)
         VALUES ($1,$2,$3,'created',$4)`,
          [clinicId, inserted.rows[0].id, actorUserId, input.amountInCents],
        );
        const payable = await repositoryContext.findPayable(
          client,
          clinicId,
          inserted.rows[0].id,
        );
        await client.query("COMMIT");
        return payable!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async settlePayable(
      clinicId: string,
      actorUserId: string,
      payableId: string,
      paymentMethod: PaymentMethod,
      timing?: PaymentTiming,
    ) {
      return repositoryContext.changePayablePayment(
        clinicId,
        actorUserId,
        payableId,
        "payment",
        paymentMethod,
        timing,
      );
    },

    async reversePayablePayment(
      clinicId: string,
      actorUserId: string,
      payableId: string,
    ) {
      return repositoryContext.changePayablePayment(
        clinicId,
        actorUserId,
        payableId,
        "payment_reversal",
      );
    },

    async setPayableAmount(
      clinicId: string,
      _actorUserId: string,
      payableId: string,
      amountInCents: number,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<{
          status: string;
          recurringPayableId: string | null;
        }>(
          `SELECT status, recurring_payable_id AS "recurringPayableId"
         FROM payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, payableId],
        );
        if (!current.rows[0]) return null;
        assertPayableAmountEditable(current.rows[0]);
        await client.query(
          `UPDATE payables SET amount_in_cents = $3, amount_pending = false, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, payableId, amountInCents],
        );
        return repositoryContext.findPayable(client, clinicId, payableId);
      });
    },

    async listRecurringPayables(clinicId: string) {
      const result = await repositoryContext.pool.query<RecurringPayableRow>(
        `SELECT ${recurringPayableColumns} FROM recurring_payables rp
       JOIN financial_categories fc ON fc.id = rp.category_id
       JOIN cost_centers cc ON cc.id = rp.cost_center_id
       WHERE rp.clinic_id = $1 AND ${branchClause("rp.branch_id", 2)}
       ORDER BY rp.description, rp.created_at`,
        [clinicId, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapRecurringPayable);
    },

    async createRecurringPayable(
      clinicId: string,
      actorUserId: string,
      input: RecurringPayableInput,
    ) {
      const inserted = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO recurring_payables
         (clinic_id, description, supplier, category_id, cost_center_id,
          amount_in_cents, day_of_month, start_month, end_month, active,
          created_by_user_id, branch_id, amount_type, reminder_days_before)
       SELECT $1,$2,$3,fc.id,cc.id,$6,$7,$8,$9,$10,$11,$12,$13,$14
       FROM financial_categories fc, cost_centers cc
       WHERE fc.clinic_id = $1 AND fc.id = $4 AND fc.kind = 'expense' AND fc.active
         AND cc.clinic_id = $1 AND cc.id = $5 AND cc.active
       RETURNING id`,
        [
          clinicId,
          input.description,
          input.supplier || null,
          input.categoryId,
          input.costCenterId,
          input.amountInCents,
          input.dayOfMonth,
          input.startMonth,
          input.endMonth ?? null,
          input.active,
          actorUserId,
          repositoryContext.branchWriteId(),
          input.amountType,
          input.reminderDaysBefore ?? null,
        ],
      );
      if (!inserted.rows[0])
        throw new DomainError(
          "FINANCIAL_CLASSIFICATION_NOT_FOUND",
          "Categoria de despesa ou centro de custo não encontrado.",
          404,
        );
      return (await repositoryContext.findRecurringPayable(
        repositoryContext.pool,
        clinicId,
        inserted.rows[0].id,
      ))!;
    },

    async updateRecurringPayable(
      clinicId: string,
      _actorUserId: string,
      recurringPayableId: string,
      input: RecurringPayableInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<{
          active: boolean;
          categoryId: string;
          costCenterId: string;
        }>(
          `SELECT active, category_id AS "categoryId", cost_center_id AS "costCenterId"
         FROM recurring_payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, recurringPayableId],
        );
        const model = current.rows[0];
        if (!model) return null;
        if (
          model.categoryId !== input.categoryId ||
          model.costCenterId !== input.costCenterId
        ) {
          const valid = await client.query(
            `SELECT 1 FROM financial_categories fc, cost_centers cc
           WHERE fc.clinic_id = $1 AND fc.id = $2 AND fc.kind = 'expense' AND fc.active
             AND cc.clinic_id = $1 AND cc.id = $3 AND cc.active`,
            [clinicId, input.categoryId, input.costCenterId],
          );
          if (!valid.rowCount)
            throw new DomainError(
              "FINANCIAL_CLASSIFICATION_NOT_FOUND",
              "Categoria de despesa ou centro de custo não encontrado.",
              404,
            );
        }
        await client.query(
          `UPDATE recurring_payables
         SET description = $3, supplier = $4, category_id = $5, cost_center_id = $6,
             amount_in_cents = $7, day_of_month = $8, start_month = $9, end_month = $10,
             resumed_from_month = CASE WHEN $11 AND NOT active THEN $12 ELSE resumed_from_month END,
             active = $11, amount_type = $13, reminder_days_before = $14, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            recurringPayableId,
            input.description,
            input.supplier || null,
            input.categoryId,
            input.costCenterId,
            input.amountInCents,
            input.dayOfMonth,
            input.startMonth,
            input.endMonth ?? null,
            input.active,
            saoPauloToday().slice(0, 7),
            input.amountType,
            input.reminderDaysBefore ?? null,
          ],
        );
        return repositoryContext.findRecurringPayable(
          client,
          clinicId,
          recurringPayableId,
        );
      });
    },

    async deleteRecurringPayable(clinicId: string, recurringPayableId: string) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query(
          "SELECT 1 FROM recurring_payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE",
          [clinicId, recurringPayableId],
        );
        if (!current.rowCount) return false;
        const used = await client.query(
          "SELECT 1 FROM payables WHERE clinic_id = $1 AND recurring_payable_id = $2 LIMIT 1",
          [clinicId, recurringPayableId],
        );
        if (used.rowCount)
          throw new DomainError(
            "RECURRING_PAYABLE_IN_USE",
            "Esta despesa fixa já gerou contas a pagar. Pause ou encerre em vez de excluir.",
            409,
          );
        await client.query(
          "DELETE FROM recurring_payables WHERE clinic_id = $1 AND id = $2",
          [clinicId, recurringPayableId],
        );
        return true;
      });
    },

    async generateDueRecurringPayables(clinicId: string, actorUserId: string) {
      const currentMonth = saoPauloToday().slice(0, 7);
      // Leitura sem trava para achar só os modelos com competência pendente; a
      // gravação relê o modelo travado e o índice único impede duplicar a competência.
      const models = await repositoryContext.pool.query<{
        id: string;
        startMonth: string;
        endMonth: string | null;
        resumedFromMonth: string | null;
        active: boolean;
        generated: string[];
      }>(
        `SELECT rp.id, rp.start_month AS "startMonth", rp.end_month AS "endMonth",
              rp.resumed_from_month AS "resumedFromMonth", rp.active,
              COALESCE((SELECT array_agg(py.competence) FROM payables py
                        WHERE py.clinic_id = rp.clinic_id
                          AND py.recurring_payable_id = rp.id), '{}') AS generated
       FROM recurring_payables rp
       WHERE rp.clinic_id = $1 AND rp.active AND rp.start_month <= $2`,
        [clinicId, currentMonth],
      );
      let created = 0;
      for (const row of models.rows) {
        const pending = recurringPayableCompetences(
          {
            startMonth: row.startMonth,
            endMonth: row.endMonth ?? undefined,
            resumedFromMonth: row.resumedFromMonth ?? undefined,
            active: row.active,
          },
          currentMonth,
        ).filter((competence) => !row.generated.includes(competence));
        if (!pending.length) continue;
        created += await repositoryContext.inTransaction(async (client) => {
          const locked = await client.query<{
            description: string;
            supplier: string | null;
            categoryId: string;
            costCenterId: string;
            amountInCents: number;
            dayOfMonth: number;
            startMonth: string;
            endMonth: string | null;
            resumedFromMonth: string | null;
            active: boolean;
            amountType: "fixed" | "variable";
          }>(
            `SELECT description, supplier, category_id AS "categoryId",
                  cost_center_id AS "costCenterId", amount_in_cents AS "amountInCents",
                  amount_type AS "amountType",
                  day_of_month::int AS "dayOfMonth", start_month AS "startMonth",
                  end_month AS "endMonth", resumed_from_month AS "resumedFromMonth", active
           FROM recurring_payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
            [clinicId, row.id],
          );
          const model = locked.rows[0];
          if (!model) return 0;
          let inserted = 0;
          for (const competence of recurringPayableCompetences(
            {
              startMonth: model.startMonth,
              endMonth: model.endMonth ?? undefined,
              resumedFromMonth: model.resumedFromMonth ?? undefined,
              active: model.active,
            },
            currentMonth,
          )) {
            const payable = await client.query<{ id: string }>(
              `INSERT INTO payables
               (clinic_id, description, supplier, category_id, cost_center_id,
                due_date, amount_in_cents, created_by_user_id,
                recurring_payable_id, competence, branch_id, amount_pending)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               (SELECT branch_id FROM recurring_payables WHERE clinic_id=$1 AND id=$9),$11)
             ON CONFLICT (recurring_payable_id, competence)
               WHERE recurring_payable_id IS NOT NULL DO NOTHING
             RETURNING id`,
              [
                clinicId,
                model.description,
                model.supplier,
                model.categoryId,
                model.costCenterId,
                recurringPayableDueDate(competence, model.dayOfMonth),
                model.amountInCents,
                actorUserId,
                row.id,
                competence,
                model.amountType === "variable",
              ],
            );
            if (!payable.rows[0]) continue;
            await client.query(
              `INSERT INTO payable_events
               (clinic_id, payable_id, actor_user_id, kind, amount_in_cents, metadata)
             VALUES ($1,$2,$3,'created',$4,$5)`,
              [
                clinicId,
                payable.rows[0].id,
                actorUserId,
                model.amountInCents,
                JSON.stringify({ recurringPayableId: row.id, competence }),
              ],
            );
            inserted += 1;
          }
          return inserted;
        });
      }
      return created;
    },

    async renegotiateReceivables(
      clinicId: string,
      actorUserId: string,
      input: ReceivableRenegotiationInput,
    ) {
      const ids = [...new Set(input.receivableIds)];
      if (ids.length !== input.receivableIds.length)
        throw new DomainError(
          "RENEGOTIATION_DUPLICATE_ITEM",
          "Há parcelas repetidas.",
        );
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          id: string;
          patientId: string;
          amountInCents: number;
          status: ReceivableStatus;
          branchId: string;
        }>(
          `SELECT id, patient_id AS "patientId", amount_in_cents AS "amountInCents", status,
                branch_id AS "branchId"
         FROM receivables WHERE clinic_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`,
          [clinicId, ids],
        );
        if (
          current.rows.length !== ids.length ||
          current.rows.some((item) => item.status !== "open")
        )
          throw new DomainError(
            "RENEGOTIATION_INVALID_ITEMS",
            "Selecione somente parcelas abertas.",
            409,
          );
        const patientId = current.rows[0]!.patientId;
        if (current.rows.some((item) => item.patientId !== patientId))
          throw new DomainError(
            "RENEGOTIATION_PATIENT_MISMATCH",
            "As parcelas devem pertencer ao mesmo cliente.",
          );
        const branchId = current.rows[0]!.branchId;
        if (current.rows.some((item) => item.branchId !== branchId))
          throw new DomainError(
            "BRANCH_MISMATCH",
            "As parcelas devem ser da mesma filial.",
            409,
          );
        const originalAmount = current.rows.reduce(
          (sum, item) => sum + item.amountInCents,
          0,
        );
        const renegotiation = await client.query<{
          id: string;
          createdAt: Date;
        }>(
          `INSERT INTO receivable_renegotiations
          (clinic_id, patient_id, actor_user_id, original_amount_in_cents,
           renegotiated_amount_in_cents, reason, original_receivable_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at AS "createdAt"`,
          [
            clinicId,
            patientId,
            actorUserId,
            originalAmount,
            input.totalAmountInCents,
            input.reason,
            ids,
          ],
        );
        await client.query(
          `UPDATE receivables SET status = 'cancelled', updated_at = now()
        WHERE clinic_id = $1 AND id = ANY($2::uuid[])`,
          [clinicId, ids],
        );
        await client.query(
          `INSERT INTO financial_events
        (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
        SELECT $1, r.id, $3, 'cancellation', -r.amount_in_cents,
               jsonb_build_object('reason', $4, 'renegotiationId', $5::text)
        FROM receivables r WHERE r.clinic_id = $1 AND r.id = ANY($2::uuid[])`,
          [clinicId, ids, actorUserId, input.reason, renegotiation.rows[0]!.id],
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO receivables
          (clinic_id, patient_id, renegotiation_id, description, installment_number,
           installment_count, due_date, amount_in_cents, branch_id)
         SELECT $1,$2,$3,'Renegociação · ' || $4,n,$5,
                ($6::date + ((n - 1) || ' months')::interval)::date,
                ($7 / $5) + CASE WHEN n <= ($7 % $5) THEN 1 ELSE 0 END,
                $8
         FROM generate_series(1, $5) n RETURNING id`,
          [
            clinicId,
            patientId,
            renegotiation.rows[0]!.id,
            input.reason,
            input.installments,
            input.firstDueDate,
            input.totalAmountInCents,
            branchId,
          ],
        );
        const newReceivables = (
          await Promise.all(
            inserted.rows.map((item) =>
              repositoryContext.findReceivable(client, clinicId, item.id),
            ),
          )
        ).filter((item): item is Receivable => Boolean(item));
        await client.query("COMMIT");
        return {
          id: renegotiation.rows[0]!.id,
          clinicId,
          patientId,
          originalAmountInCents: originalAmount,
          renegotiatedAmountInCents: input.totalAmountInCents,
          reason: input.reason,
          originalReceivableIds: ids,
          newReceivables,
          createdAt: renegotiation.rows[0]!.createdAt.toISOString(),
        } satisfies ReceivableRenegotiation;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
      return repositoryContext.insertCommissionRule(
        repositoryContext.pool,
        clinicId,
        input,
      );
    },

    async generateCommissions(clinicId: string, competence: string) {
      await repositoryContext.pool.query(
        `INSERT INTO commission_entries
        (clinic_id, professional_id, appointment_id, rule_id, competence,
         base_amount_in_cents, percentage, amount_in_cents)
       SELECT a.clinic_id, a.professional_id, a.id, rule.id, $2::text,
              s.price_in_cents, rule.percentage,
              round(s.price_in_cents * rule.percentage / 100.0)::int
       FROM appointments a JOIN services s ON s.id = a.service_id
       JOIN professionals pr ON pr.id = a.professional_id
       -- Regra do usuário ligado ao profissional vigente na data; sem ela, a do profissional.
       JOIN LATERAL (SELECT cr.id, cr.percentage FROM commission_rules cr
         WHERE cr.clinic_id = a.clinic_id
           AND (cr.professional_id = a.professional_id
             OR (pr.user_id IS NOT NULL AND cr.user_id = pr.user_id))
           AND cr.active AND cr.effective_from <= a.starts_at::date
         ORDER BY (cr.user_id IS NOT NULL) DESC, cr.effective_from DESC LIMIT 1) rule ON true
       WHERE a.clinic_id = $1 AND a.status = 'completed'
         AND a.patient_id IS NOT NULL -- atendimento de lead não gera comissão
         AND to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $2::text
       ON CONFLICT (clinic_id, appointment_id) DO NOTHING`,
        [clinicId, competence],
      );
      return repositoryContext.listCommissions(clinicId, competence);
    },

    async settleCommission(
      clinicId: string,
      actorUserId: string,
      commissionId: string,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        if (
          (
            await client.query(
              "SELECT id FROM commission_adjustments WHERE clinic_id=$1 AND commission_id=$2",
              [clinicId, commissionId],
            )
          ).rowCount
        )
          throw new DomainError(
            "COMMISSION_ACCOUNT_MANAGED",
            "Registre a baixa ou o estorno na conta conciliada desta comissão.",
            409,
          );
        if (
          (
            await client.query(
              "SELECT id FROM payables WHERE clinic_id=$1 AND commission_id=$2 AND status<>'cancelled'",
              [clinicId, commissionId],
            )
          ).rowCount
        )
          throw new DomainError(
            "COMMISSION_EXPENSE_MANAGED",
            "Registre o pagamento ou estorno na despesa vinculada à comissão.",
            409,
          );
        const result = await client.query(
          "UPDATE commission_entries SET status='paid',paid_at=now(),paid_by_user_id=$3 WHERE clinic_id=$1 AND id=$2 AND status='open' RETURNING id,amount_in_cents,paid_at",
          [clinicId, commissionId, actorUserId],
        );
        if (!result.rows[0]) return null;
        await client.query(
          "INSERT INTO commission_payment_events(clinic_id,commission_id,kind,amount_in_cents,actor_user_id,occurred_at) VALUES($1,$2,'payment',$3,$4,$5)",
          [
            clinicId,
            commissionId,
            result.rows[0].amount_in_cents,
            actorUserId,
            result.rows[0].paid_at,
          ],
        );
        return (
          (
            await repositoryContext.listCommissions(clinicId, undefined, client)
          ).find((item) => item.id === commissionId) ?? null
        );
      });
    },
    async reverseCommission(
      clinicId: string,
      commissionId: string,
      actorUserId?: string,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        if (
          (
            await client.query(
              "SELECT id FROM commission_adjustments WHERE clinic_id=$1 AND commission_id=$2",
              [clinicId, commissionId],
            )
          ).rowCount
        )
          throw new DomainError(
            "COMMISSION_ACCOUNT_MANAGED",
            "Registre a baixa ou o estorno na conta conciliada desta comissão.",
            409,
          );
        if (
          (
            await client.query(
              "SELECT id FROM payables WHERE clinic_id=$1 AND commission_id=$2 AND status<>'cancelled'",
              [clinicId, commissionId],
            )
          ).rowCount
        )
          throw new DomainError(
            "COMMISSION_EXPENSE_MANAGED",
            "Registre o pagamento ou estorno na despesa vinculada à comissão.",
            409,
          );
        const result = await client.query(
          "UPDATE commission_entries SET status='open',paid_at=NULL,paid_by_user_id=NULL WHERE clinic_id=$1 AND id=$2 AND status='paid' RETURNING id,amount_in_cents",
          [clinicId, commissionId],
        );
        if (!result.rows[0]) return null;
        await client.query(
          "INSERT INTO commission_payment_events(clinic_id,commission_id,kind,amount_in_cents,actor_user_id) VALUES($1,$2,'reversal',$3,$4)",
          [
            clinicId,
            commissionId,
            -result.rows[0].amount_in_cents,
            actorUserId ?? null,
          ],
        );
        return (
          (
            await repositoryContext.listCommissions(clinicId, undefined, client)
          ).find((item) => item.id === commissionId) ?? null
        );
      });
    },

    async getDailyCash(clinicId: string, date: string): Promise<DailyCash> {
      const branchIds = repositoryContext.branchReadIds();
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const clinic = await client.query<{ timezone: string }>(
          `SELECT timezone FROM clinics WHERE id=$1`,
          [clinicId],
        );
        // Estorno não registra forma: herda a do pagamento mais recente do
        // mesmo recebível até o estorno.
        const receiptResult = await client.query<{
          id: string;
          receivableId: string;
          kind: "payment" | "payment_reversal";
          patientId: string;
          patientName: string;
          description: string;
          amountInCents: number;
          occurredAt: Date;
          availableAt: Date;
          paymentMethod: ReceivedPayment["paymentMethod"] | null;
        }>(
          `SELECT fe.id, fe.receivable_id AS "receivableId", fe.kind,
                r.patient_id AS "patientId", p.full_name AS "patientName",
                r.description, fe.amount_in_cents AS "amountInCents",
                coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AS "occurredAt",coalesce(dc.cash_available_at,fe.cash_available_at,fe.occurred_at,fe.created_at) AS "availableAt",
                COALESCE(fe.metadata->>'paymentMethod', (
                  SELECT prev.metadata->>'paymentMethod' FROM financial_events prev
                  WHERE prev.clinic_id=fe.clinic_id AND prev.receivable_id=fe.receivable_id
                    AND prev.kind='payment' AND prev.created_at<=fe.created_at
                    AND prev.metadata->>'paymentMethod' IS NOT NULL
                  ORDER BY prev.created_at DESC LIMIT 1
                )) AS "paymentMethod"
         FROM financial_events fe
         LEFT JOIN LATERAL (SELECT occurred_at,cash_available_at FROM financial_date_corrections WHERE clinic_id=fe.clinic_id AND receivable_event_id=fe.id ORDER BY revision DESC LIMIT 1) dc ON true
         JOIN clinics c ON c.id=fe.clinic_id
         JOIN receivables r ON r.id=fe.receivable_id
         JOIN patients p ON p.id=r.patient_id
         WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal')
           AND ${branchClause("r.branch_id", 3)}
           AND (coalesce(dc.cash_available_at,fe.cash_available_at,fe.occurred_at,fe.created_at) AT TIME ZONE c.timezone)::date=$2::date`,
          [clinicId, date, branchIds],
        );
        const payableResult = await client.query<PayableRow>(
          `SELECT ${payableColumns} FROM payables py
         JOIN financial_categories fc ON fc.id = py.category_id
         LEFT JOIN cost_centers cc ON cc.id = py.cost_center_id
         JOIN clinics c ON c.id = py.clinic_id
         WHERE py.clinic_id=$1 AND ${branchClause("py.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const payableEvents = await client.query<{
          id: string;
          clinicId: string;
          payableId: string;
          kind: "payment" | "payment_reversal";
          occurredAt: Date;
          availableAt: Date;
          amountInCents: number;
          paymentMethod: PaymentMethod | null;
        }>(
          `SELECT pe.id,pe.clinic_id AS "clinicId",pe.payable_id AS "payableId",pe.kind,coalesce(dc.occurred_at,pe.occurred_at,pe.created_at) AS "occurredAt",coalesce(dc.cash_available_at,pe.cash_available_at,pe.occurred_at,pe.created_at) AS "availableAt",-pe.amount_in_cents AS "amountInCents",coalesce(pe.metadata->>'paymentMethod',(SELECT prev.metadata->>'paymentMethod' FROM payable_events prev WHERE prev.clinic_id=pe.clinic_id AND prev.payable_id=pe.payable_id AND prev.kind='payment' AND prev.created_at<=pe.created_at ORDER BY prev.created_at DESC LIMIT 1)) AS "paymentMethod" FROM payable_events pe LEFT JOIN LATERAL(SELECT occurred_at,cash_available_at FROM financial_date_corrections WHERE clinic_id=pe.clinic_id AND payable_event_id=pe.id ORDER BY revision DESC LIMIT 1) dc ON true WHERE pe.clinic_id=$1 AND pe.kind IN ('payment','payment_reversal') AND EXISTS(SELECT 1 FROM payables pb WHERE pb.id=pe.payable_id AND ${branchClause("pb.branch_id", 2)})`,
          [clinicId, branchIds],
        );
        const commissionEvents = await client.query<{
          id: string;
          clinicId: string;
          commissionId: string;
          kind: "payment" | "reversal";
          amountInCents: number;
          occurredAt: Date;
        }>(
          `SELECT e.id,e.clinic_id AS "clinicId",e.commission_id AS "commissionId",e.kind,e.amount_in_cents AS "amountInCents",e.occurred_at AS "occurredAt",e.professional_name AS "professionalName" FROM commission_payment_events e JOIN commission_entries ce ON ce.id=e.commission_id JOIN professionals p ON p.id=ce.professional_id WHERE e.clinic_id=$1 AND ${branchClause("p.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        const commissionResult = await client.query<CommissionEntryRow>(
          `SELECT ce.id, ce.clinic_id AS "clinicId", ce.professional_id AS "professionalId",
                p.full_name AS "professionalName", ce.appointment_id AS "appointmentId",ce.group_attendance_id AS "groupAttendanceId",ce.service_id AS "serviceId",ce.rule_id AS "ruleId",ce.rule_snapshot AS "ruleSnapshot",
                ce.competence, ce.base_amount_in_cents AS "baseAmountInCents",
                ce.percentage, ce.amount_in_cents AS "amountInCents", ce.status,
                ce.paid_at AS "paidAt", ce.created_at AS "createdAt"
         FROM commission_entries ce
         JOIN professionals p ON p.id = ce.professional_id
         JOIN clinics c ON c.id = ce.clinic_id
         WHERE ce.clinic_id=$1 AND ${branchClause("p.branch_id", 2)}`,
          [clinicId, branchIds],
        );
        await client.query("COMMIT");
        const receipts: ReceivedPayment[] = receiptResult.rows.map((item) => ({
          id: item.id,
          receivableId: item.receivableId,
          kind: item.kind === "payment" ? "payment" : "reversal",
          occurredAt: item.occurredAt.toISOString(),
          availableAt: item.availableAt.toISOString(),
          patientId: item.patientId,
          patientName: item.patientName,
          description: item.description,
          amountInCents: item.amountInCents,
          ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
        }));
        return buildDailyCash(
          date,
          {
            receipts,
            payables: payableResult.rows.map(mapPayable),
            payableEvents: payableEvents.rows.map((item) => ({
              ...item,
              kind:
                item.kind === "payment"
                  ? ("payment" as const)
                  : ("reversal" as const),
              occurredAt: item.occurredAt.toISOString(),
              availableAt: item.availableAt.toISOString(),
              ...(item.paymentMethod
                ? { paymentMethod: item.paymentMethod }
                : { paymentMethod: undefined }),
            })),
            commissionEvents: commissionEvents.rows.map((item) => ({
              ...item,
              occurredAt: item.occurredAt.toISOString(),
            })),
            commissions: commissionResult.rows.map(mapCommissionEntry),
          },
          clinic.rows[0]?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listReceivedPayments(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<ReceivedPayment[]> {
      const result = await repositoryContext.pool.query<{
        id: string;
        receivableId: string;
        kind: "payment" | "payment_reversal";
        planId: string | null;
        tabId: string | null;
        patientId: string;
        patientName: string;
        description: string;
        amountInCents: number;
        occurredAt: Date;
        paymentMethod: ReceivedPayment["paymentMethod"] | null;
      }>(
        `SELECT fe.id, fe.receivable_id AS "receivableId", fe.kind,
              r.plan_id AS "planId",
              (SELECT pt.id FROM patient_tabs pt WHERE pt.receivable_id=r.id LIMIT 1) AS "tabId",
              r.patient_id AS "patientId", p.full_name AS "patientName",
              r.description, fe.amount_in_cents AS "amountInCents",
              coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AS "occurredAt",
              fe.metadata->>'paymentMethod' AS "paymentMethod"
       FROM financial_events fe LEFT JOIN LATERAL(SELECT occurred_at FROM financial_date_corrections WHERE clinic_id=fe.clinic_id AND receivable_event_id=fe.id ORDER BY revision DESC LIMIT 1) dc ON true
       JOIN clinics c ON c.id=fe.clinic_id
       JOIN receivables r ON r.id=fe.receivable_id
       JOIN patients p ON p.id=r.patient_id
       WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal')
         AND ${branchClause("r.branch_id", 4)}
         AND (coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AT TIME ZONE c.timezone)::date BETWEEN $2::date AND $3::date
       ORDER BY coalesce(dc.occurred_at,fe.occurred_at,fe.created_at), fe.id`,
        [clinicId, from, to, repositoryContext.branchReadIds()],
      );
      return result.rows.map((item) => ({
        id: item.id,
        receivableId: item.receivableId,
        kind: item.kind === "payment" ? "payment" : "reversal",
        ...(item.planId || item.tabId
          ? { sourceId: item.planId ?? item.tabId! }
          : {}),
        occurredAt: item.occurredAt.toISOString(),
        patientId: item.patientId,
        patientName: item.patientName,
        description: item.description,
        amountInCents: item.amountInCents,
        ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
      }));
    },
  };
}
