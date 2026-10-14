import { commissionReconciliationInputSchema } from "@crm/contracts";
import { externalOperationInputSchema } from "@crm/contracts";
import { financialDatesSchema } from "@crm/contracts";
import {
  productUpdateSchema,
  patientTabItemUpdateSchema,
  patientTabServiceInputSchema,
  supplierInputSchema,
  manualReceivableInputSchema,
  financialClassificationSchema,
  categoryDreInputSchema,
  dreFilterSchema,
  appointmentInputSchema,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
export function registerFinanceOperationRoutes({
  app,
  authenticate,
  repository,
  assertNoHoliday,
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
    async (request) => {
      const { id, professionalId } = z
        .object({ id: z.uuid(), professionalId: z.uuid() })
        .parse(request.params);
      const { expectedAmountInCents } = z
        .object({
          expectedAmountInCents: z
            .number()
            .int()
            .min(-2147483647)
            .max(2147483647),
        })
        .parse(request.body);
      if (expectedAmountInCents < 0)
        assertPermissions(request, "finance.commissions_reverse");
      return repository.settleCommissionAccount(
        request.user.clinicId,
        request.user.sub,
        id,
        professionalId,
        expectedAmountInCents,
      );
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
  app.get(
    "/patient-tabs/:id/appointment-options",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = ids.parse(request.params),
        { from, to } = z
          .object({
            from: z.iso.datetime({ offset: true }),
            to: z.iso.datetime({ offset: true }),
          })
          .refine(
            (value) =>
              value.to >= value.from &&
              Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000,
            "Escolha um período de até um ano.",
          )
          .parse(request.query);
      const workspace = await repository.getInventoryWorkspace(
          request.user.clinicId,
        ),
        tab = workspace.tabs.find((item) => item.id === id);
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      const appointments = await repository.listAppointments(
        request.user.clinicId,
        from,
        to,
      );
      return appointments
        .filter(
          (item) =>
            item.patientId === tab.patientId &&
            item.status !== "cancelled" &&
            !workspace.tabs.some((other) =>
              other.services?.some(
                (service) => service.appointmentId === item.id,
              ),
            ),
        )
        .map((item) => ({
          id: item.id,
          serviceName: item.serviceName,
          professionalName: item.professionalName,
          startsAt: item.startsAt,
        }));
    },
  );
  app.post(
    "/patient-tabs/:id/services",
    { preHandler: authenticate },
    async (request) =>
      repository.addPatientTabService(
        request.user.clinicId,
        request.user.sub,
        ids.parse(request.params).id,
        patientTabServiceInputSchema.parse(request.body),
      ),
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
  app.post(
    "/patient-tabs/:id/appointments",
    { preHandler: authenticate },
    async (request) => {
      const input = appointmentInputSchema
        .omit({ patientId: true })
        .parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      return repository.createPatientTabAppointment(
        request.user.clinicId,
        request.user.sub,
        ids.parse(request.params).id,
        input,
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
  app.get(
    "/reports/dre/export",
    { preHandler: authenticate },
    async (request) => {
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
      return report;
    },
  );
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
