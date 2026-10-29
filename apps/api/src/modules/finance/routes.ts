import {
  commissionGenerationInputSchema,
  commissionRuleInputSchema,
  costCenterInputSchema,
  dailyCashFilterSchema,
  financeForecastFilterSchema,
  financialCategoryInputSchema,
  patientTabCloseInputSchema,
  patientTabInputSchema,
  patientTabItemInputSchema,
  payableAmountInputSchema,
  payableInputSchema,
  paymentInputSchema,
  receivableSettlementSchema,
  productInputSchema,
  productSaleInputSchema,
  receivableAdjustmentInputSchema,
  receivableRenegotiationInputSchema,
  recurringPayableInputSchema,
  saoPauloToday,
  stockMovementInputSchema,
  type PaymentMethod,
  type ReceivableContact,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { buildFinanceForecast } from "./finance-forecast.js";

export function registerFinanceRoutes(context: RouteContext) {
  const {
    app,
    authenticate,
    repository,
    assertPermissions,
    assertInstallmentsAllowed,
  } = context;

  /** Pago na hora com parcelas na forma (ex.: cartão 3x): respeita a configuração da forma. */
  const assertPaymentInstallments = (
    clinicId: string,
    input: {
      settlement: "paid" | "receivable";
      paymentMethod?: PaymentMethod | undefined;
      paymentInstallments?: number | undefined;
    },
  ) =>
    input.settlement === "paid"
      ? assertInstallmentsAllowed(clinicId, {
          installments: input.paymentInstallments,
          paymentMethod: input.paymentMethod,
        })
      : Promise.resolve();

  app.get(
    "/inventory/workspace",
    { preHandler: authenticate },
    async (request) => repository.getInventoryWorkspace(request.user.clinicId),
  );

  app.post(
    "/inventory/products",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createProduct(
            request.user.clinicId,
            request.user.sub,
            productInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/inventory/movements",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createStockMovement(
            request.user.clinicId,
            request.user.sub,
            stockMovementInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/patient-tabs",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.openPatientTab(
            request.user.clinicId,
            request.user.sub,
            patientTabInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/patient-tabs/:id/items",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tab = await repository.addPatientTabItem(
        request.user.clinicId,
        request.user.sub,
        id,
        patientTabItemInputSchema.parse(request.body),
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );

  app.post(
    "/patient-tabs/:id/close",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = patientTabCloseInputSchema.parse(request.body);
      await assertPaymentInstallments(request.user.clinicId, input);
      const tab = await repository.closePatientTab(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );

  app.post(
    "/product-sales",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = productSaleInputSchema.parse(request.body);
      await assertPaymentInstallments(request.user.clinicId, input);
      return reply
        .status(201)
        .send(
          await repository.createProductSale(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );

  app.post(
    "/patient-tabs/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tab = await repository.cancelPatientTab(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );

  app.get("/finance/summary", { preHandler: authenticate }, async (request) => {
    await repository.renewDuePatientPlans(
      request.user.clinicId,
      request.user.sub,
    );
    return repository.getFinancialSummary(request.user.clinicId);
  });

  app.post(
    "/finance/receivables/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const {
        discountInCents,
        interestInCents,
        receivedInCents,
        balanceDueDate,
        paymentInstallments,
        ...timing
      } = receivableSettlementSchema.parse(request.body ?? {});
      const { id } = request.params as { id: string };
      await assertInstallmentsAllowed(request.user.clinicId, {
        installments: paymentInstallments,
        paymentMethod: timing.paymentMethod,
      });
      const receivable = await repository.settleReceivable(
        request.user.clinicId,
        request.user.sub,
        id,
        timing.paymentMethod,
        timing,
        {
          discountInCents,
          interestInCents,
          ...(receivedInCents === undefined ? {} : { receivedInCents }),
          ...(balanceDueDate === undefined ? {} : { balanceDueDate }),
          ...(paymentInstallments === undefined ? {} : { paymentInstallments }),
        },
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );

  app.patch(
    "/finance/receivables/:id/adjust",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = receivableAdjustmentInputSchema.parse(request.body);
      const receivable = await repository.adjustReceivable(
        request.user.clinicId,
        request.user.sub,
        id,
        input.amountInCents,
        input.reason,
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );

  app.get(
    "/finance/receivables/:id/receipt",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const receipt = await repository.getPaymentReceipt(
        request.user.clinicId,
        id,
      );
      if (!receipt)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receipt;
    },
  );

  app.get(
    "/finance/receivables/:id/contact",
    { preHandler: authenticate },
    async (request, reply): Promise<ReceivableContact | undefined> => {
      const { id } = request.params as { id: string };
      const { clinicId } = request.user;
      const receivable = (
        await repository.getFinancialSummary(clinicId)
      ).receivables.find((item) => item.id === id);
      const patient =
        receivable &&
        (await repository.getPatient(clinicId, receivable.patientId));
      if (!receivable || !patient)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return {
        receivableId: receivable.id,
        patientId: patient.id,
        patientName: patient.fullName,
        phone: patient.phone,
        whatsapp: patient.whatsapp || undefined,
      };
    },
  );

  app.get(
    "/finance/workspace",
    { preHandler: authenticate },
    async (request) => {
      // Abrir o financeiro gera as competências pendentes das despesas fixas.
      await repository.generateDueRecurringPayables(
        request.user.clinicId,
        request.user.sub,
      );
      return repository.getFinancialWorkspace(request.user.clinicId);
    },
  );

  app.get(
    "/finance/daily-cash",
    { preHandler: authenticate },
    async (request) => {
      const { date } = dailyCashFilterSchema.parse(request.query);
      return repository.getDailyCash(
        request.user.clinicId,
        date ?? saoPauloToday(),
      );
    },
  );

  app.get(
    "/finance/forecast",
    { preHandler: authenticate },
    async (request) => {
      const { months } = financeForecastFilterSchema.parse(request.query);
      const { clinicId, sub } = request.user;
      // Lança o que já é devido para que só o futuro fique como projetado.
      await repository.renewDuePatientPlans(clinicId, sub);
      await repository.generateDueRecurringPayables(clinicId, sub);
      const [workspace, plans, recurringPayables] = await Promise.all([
        repository.getFinancialWorkspace(clinicId),
        repository.listPatientPlans(clinicId),
        repository.listRecurringPayables(clinicId),
      ]);
      return buildFinanceForecast(saoPauloToday().slice(0, 7), months, {
        receivables: workspace.summary.receivables,
        payables: workspace.payables,
        plans,
        recurringPayables,
      });
    },
  );

  app.get(
    "/finance/recurring-payables",
    { preHandler: authenticate },
    async (request) => {
      await repository.generateDueRecurringPayables(
        request.user.clinicId,
        request.user.sub,
      );
      return repository.listRecurringPayables(request.user.clinicId);
    },
  );

  app.post(
    "/finance/recurring-payables",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createRecurringPayable(
            request.user.clinicId,
            request.user.sub,
            recurringPayableInputSchema.parse(request.body),
          ),
        ),
  );

  app.put(
    "/finance/recurring-payables/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const recurring = await repository.updateRecurringPayable(
        request.user.clinicId,
        request.user.sub,
        id,
        recurringPayableInputSchema.parse(request.body),
      );
      if (!recurring)
        return reply.status(404).send({
          code: "RECURRING_PAYABLE_NOT_FOUND",
          message: "Despesa fixa não encontrada.",
        });
      return recurring;
    },
  );

  app.delete(
    "/finance/recurring-payables/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await repository.deleteRecurringPayable(
        request.user.clinicId,
        id,
      );
      if (!deleted)
        return reply.status(404).send({
          code: "RECURRING_PAYABLE_NOT_FOUND",
          message: "Despesa fixa não encontrada.",
        });
      return reply.status(204).send();
    },
  );

  app.post(
    "/finance/renegotiations",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.renegotiateReceivables(
            request.user.clinicId,
            request.user.sub,
            receivableRenegotiationInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/finance/commission-rules",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createCommissionRule(
            request.user.clinicId,
            commissionRuleInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/finance/commissions/generate",
    { preHandler: authenticate },
    async (request) =>
      repository.generateCommissions(
        request.user.clinicId,
        commissionGenerationInputSchema.parse(request.body).competence,
      ),
  );

  app.post(
    "/finance/commissions/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const commission = await repository.settleCommission(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!commission)
        return reply.status(404).send({
          code: "COMMISSION_NOT_FOUND",
          message: "Comissão não encontrada ou já paga.",
        });
      return commission;
    },
  );

  app.post(
    "/finance/commissions/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const commission = await repository.reverseCommission(
        request.user.clinicId,
        id,
        request.user.sub,
      );
      if (!commission)
        return reply.status(404).send({
          code: "COMMISSION_NOT_FOUND",
          message: "Comissão não encontrada ou ainda aberta.",
        });
      return commission;
    },
  );

  app.post(
    "/finance/categories",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createFinancialCategory(
            request.user.clinicId,
            financialCategoryInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/finance/cost-centers",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createCostCenter(
            request.user.clinicId,
            costCenterInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/finance/payables",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = payableInputSchema.parse(request.body);
      if (input.commissionId)
        assertPermissions(request, "finance.commissions_pay");
      return reply
        .status(201)
        .send(
          await repository.createPayable(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );

  app.post(
    "/finance/payables/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = paymentInputSchema.parse(request.body ?? {});
      const current = (
        await repository.getFinancialWorkspace(request.user.clinicId)
      ).payables.find((item) => item.id === id);
      if (current?.commissionId)
        assertPermissions(request, "finance.commissions_pay");
      const payable = await repository.settlePayable(
        request.user.clinicId,
        request.user.sub,
        id,
        input.paymentMethod,
        input,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Conta a pagar não encontrada.",
        });
      return payable;
    },
  );

  app.put(
    "/finance/payables/:id/amount",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { amountInCents } = payableAmountInputSchema.parse(
        request.body ?? {},
      );
      const payable = await repository.setPayableAmount(
        request.user.clinicId,
        request.user.sub,
        id,
        amountInCents,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Conta a pagar não encontrada.",
        });
      return payable;
    },
  );

  app.post(
    "/finance/payables/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const current = (
        await repository.getFinancialWorkspace(request.user.clinicId)
      ).payables.find((item) => item.id === id);
      if (current?.commissionId)
        assertPermissions(request, "finance.commissions_reverse");
      const payable = await repository.reversePayablePayment(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Conta a pagar não encontrada.",
        });
      return payable;
    },
  );

  app.post(
    "/finance/receivables/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const receivable = await repository.reverseReceivablePayment(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );
}
