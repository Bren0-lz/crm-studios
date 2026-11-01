import { commissionReconciliationInputSchema } from "@crm/contracts";
import { externalOperationInputSchema } from "@crm/contracts";
import {
  paymentProofDeletionSchema,
  paymentProofInputSchema,
  type PaymentProofEntity,
  type PermissionKey,
} from "@crm/contracts";

/** Quem anexa comprovante em cada tipo de registro (vale também para excluir). */
const proofAttachPermission: Record<PaymentProofEntity, PermissionKey> = {
  receivable: "finance.receive",
  payable: "finance.payables_pay",
  commission_account_payment: "finance.commissions_pay",
};
import { financialDatesSchema } from "@crm/contracts";
import {
  productUpdateSchema,
  patientTabItemUpdateSchema,
  supplierInputSchema,
  supplierOrderInputSchema,
  manualReceivableInputSchema,
  financialClassificationSchema,
  categoryDreInputSchema,
  dreFilterSchema,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { xlsxContentType } from "../../infrastructure/spreadsheet.js";
import { dreReportToXlsx } from "../reports/report-workbooks.js";
import { payrollOnlyError } from "./payroll.js";
export function registerFinanceOperationRoutes({
  app,
  authenticate,
  repository,
  assertPermissions,
}: RouteContext) {
  app.get(
    "/finance/commissions/:id/reconciliation",
    { preHandler: authenticate },
    async (request) =>
      repository.getCommissionReconciliationPreview(
        request.user.clinicId,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
  );
  app.post(
    "/finance/commissions/:id/reconciliation",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.reconcileCommission(
            request.user.clinicId,
            request.user.sub,
            z.object({ id: z.uuid() }).parse(request.params).id,
            commissionReconciliationInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/commissions/:id/accounts/:professionalId/pay",
    { preHandler: authenticate },
    // O saldo conciliado (comissão + ajustes) é pago pela folha de pagamento.
    async () => {
      throw payrollOnlyError();
    },
  );
  app.post(
    "/finance/commission-account-payments/:id/reverse",
    { preHandler: authenticate },
    async (request) =>
      repository.reverseCommissionAccountPayment(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
  );
  app.get(
    "/finance/external-operations",
    { preHandler: authenticate },
    async (request) =>
      repository.listExternalOperations(
        request.user.clinicId,
        z.object({ patientId: z.uuid().optional() }).parse(request.query)
          .patientId,
      ),
  );
  app.post(
    "/finance/external-operations",
    { preHandler: authenticate, bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createExternalOperation(
            request.user.clinicId,
            request.user.sub,
            externalOperationInputSchema.parse(request.body),
          ),
        ),
  );
  app.get(
    "/finance/external-operations/:id/content",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.getExternalOperationContent(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "EXTERNAL_OPERATION_NOT_FOUND",
        message: "Comprovante não encontrado.",
      }),
  );
  // Comprovantes de baixas: um arquivo por pedido (o limite do corpo é 8 MB).
  for (const [path, entityType] of [
    ["receivables", "receivable"],
    ["payables", "payable"],
    ["commission-account-payments", "commission_account_payment"],
  ] as const) {
    app.get(
      `/finance/${path}/:id/proofs`,
      { preHandler: authenticate },
      async (request) =>
        repository.listPaymentProofs(
          request.user.clinicId,
          entityType,
          z.object({ id: z.uuid() }).parse(request.params).id,
        ),
    );
    app.post(
      `/finance/${path}/:id/proofs`,
      { preHandler: authenticate, bodyLimit: 8 * 1024 * 1024 },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            await repository.createPaymentProof(
              request.user.clinicId,
              request.user.sub,
              entityType,
              z.object({ id: z.uuid() }).parse(request.params).id,
              paymentProofInputSchema.parse(request.body),
            ),
          ),
    );
  }
  app.get(
    "/finance/payment-proofs/:id/content",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.getPaymentProofContent(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "PAYMENT_PROOF_NOT_FOUND",
        message: "Comprovante não encontrado.",
      }),
  );
  // Comprovante enviado por engano: quem pode anexar naquele tipo de registro pode excluir.
  app.delete(
    "/finance/payment-proofs/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { reason } = paymentProofDeletionSchema.parse(request.body ?? {});
      const entity = await repository.findPaymentProofEntity(
        request.user.clinicId,
        id,
      );
      if (entity) assertPermissions(request, proofAttachPermission[entity]);
      const deleted =
        entity &&
        (await repository.deletePaymentProof(
          request.user.clinicId,
          request.user.sub,
          id,
          reason,
        ));
      return (
        deleted ??
        reply.status(404).send({
          code: "PAYMENT_PROOF_NOT_FOUND",
          message: "Comprovante não encontrado.",
        })
      );
    },
  );
  const ids = z.object({ id: z.uuid(), itemId: z.uuid().optional() });
  app.put(
    "/finance/entries/:kind/:id/dates",
    { preHandler: authenticate },
    async (request) => {
      const { kind, id } = z
        .object({ kind: z.enum(["receivable", "payable"]), id: z.uuid() })
        .parse(request.params);
      return repository.setFinancialDates(
        request.user.clinicId,
        request.user.sub,
        kind,
        id,
        financialDatesSchema.parse(request.body),
      );
    },
  );
  app.put(
    "/inventory/products/:id",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.updateProduct(
        request.user.clinicId,
        request.user.sub,
        ids.parse(request.params).id,
        productUpdateSchema.parse(request.body),
      )) ??
      reply.status(404).send({
        code: "PRODUCT_NOT_FOUND",
        message: "Produto não encontrado.",
      }),
  );
  app.put(
    "/patient-tabs/:id/items/:itemId",
    { preHandler: authenticate },
    async (request) => {
      const { id, itemId } = ids.parse(request.params);
      return repository.updatePatientTabItem(
        request.user.clinicId,
        request.user.sub,
        id,
        itemId!,
        patientTabItemUpdateSchema.parse(request.body),
      );
    },
  );
  app.delete(
    "/patient-tabs/:id/items/:itemId",
    { preHandler: authenticate },
    async (request) => {
      const { id, itemId } = ids.parse(request.params);
      return repository.updatePatientTabItem(
        request.user.clinicId,
        request.user.sub,
        id,
        itemId!,
        null,
      );
    },
  );
  app.delete(
    "/patient-tabs/:id/services/:itemId",
    { preHandler: authenticate },
    async (request) => {
      const { id, itemId } = ids.parse(request.params);
      return repository.removePatientTabService(
        request.user.clinicId,
        request.user.sub,
        id,
        itemId!,
      );
    },
  );
  app.get("/finance/suppliers", { preHandler: authenticate }, async (request) =>
    repository.listSuppliers(request.user.clinicId),
  );
  app.post(
    "/finance/suppliers",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.saveSupplier(
            request.user.clinicId,
            request.user.sub,
            supplierInputSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/finance/suppliers/:id",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.saveSupplier(
        request.user.clinicId,
        request.user.sub,
        supplierInputSchema.parse(request.body),
        ids.parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "SUPPLIER_NOT_FOUND",
        message: "Fornecedor não encontrado.",
      }),
  );
  app.get(
    "/finance/suppliers/:id/orders",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.listSupplierOrders(
        request.user.clinicId,
        ids.parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "SUPPLIER_NOT_FOUND",
        message: "Fornecedor não encontrado.",
      }),
  );
  app.post(
    "/finance/suppliers/:id/orders",
    { preHandler: authenticate },
    async (request, reply) => {
      const order = await repository.createSupplierOrder(
        request.user.clinicId,
        request.user.sub,
        ids.parse(request.params).id,
        supplierOrderInputSchema.parse(request.body),
      );
      return order
        ? reply.status(201).send(order)
        : reply.status(404).send({
            code: "SUPPLIER_NOT_FOUND",
            message: "Fornecedor não encontrado.",
          });
    },
  );
  app.post(
    "/finance/receivables",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createManualReceivable(
            request.user.clinicId,
            request.user.sub,
            manualReceivableInputSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/finance/classifications/:kind/:id",
    { preHandler: authenticate },
    async (request) => {
      const { kind, id } = z
        .object({ kind: z.enum(["receivable", "payable"]), id: z.uuid() })
        .parse(request.params);
      return repository.classifyFinancialEntry(
        request.user.clinicId,
        request.user.sub,
        kind,
        id,
        financialClassificationSchema.parse(request.body),
      );
    },
  );
  app.put(
    "/finance/categories/:id/dre",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.setCategoryDreGroup(
        request.user.clinicId,
        request.user.sub,
        ids.parse(request.params).id,
        categoryDreInputSchema.parse(request.body).dreGroup,
      )) ??
      reply.status(404).send({
        code: "FINANCE_CATEGORY_NOT_FOUND",
        message: "Categoria não encontrada.",
      }),
  );
  app.get("/reports/dre", { preHandler: authenticate }, async (request) => {
    const { from, to, costCenterId } = dreFilterSchema.parse(request.query);
    return repository.getDreReport(
      request.user.clinicId,
      from,
      to,
      costCenterId,
    );
  });
  for (const path of ["/reports/dre/export", "/reports/dre/export.xlsx"])
    app.get(path, { preHandler: authenticate }, async (request, reply) => {
      const { from, to, costCenterId } = dreFilterSchema.parse(request.query);
      const report = await repository.getDreReport(
        request.user.clinicId,
        from,
        to,
        costCenterId,
      );
      await repository.recordAdminAuditEvent(
        request.user.clinicId,
        request.user.sub,
        "reports.dre_exported",
        "report",
        { from, to, costCenterId },
      );
      if (path.endsWith(".xlsx"))
        return reply
          .header("Content-Type", xlsxContentType)
          .header(
            "Content-Disposition",
            `attachment; filename="dre-${from}-${to}.xlsx"`,
          )
          .send(await dreReportToXlsx(report));
      return report;
    });
  app.get("/finance/dre", { preHandler: authenticate }, async (request) => {
    const { from, to, costCenterId } = dreFilterSchema.parse(request.query);
    return repository.getDreReport(
      request.user.clinicId,
      from,
      to,
      costCenterId,
    );
  });
}
