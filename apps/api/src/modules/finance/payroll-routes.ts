import {
  payrollAdvanceInputSchema,
  payrollEmployeeInputSchema,
  payrollEntryInputSchema,
  payrollLaunchInputSchema,
  payrollQuerySchema,
  saoPauloToday,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";

/** Folha de pagamento: colaboradores, folha da competência, lançamento e desfazer. */
export function registerPayrollRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  app.get("/finance/payroll", { preHandler: authenticate }, async (request) => {
    const { competence, branchIds } = payrollQuerySchema.parse(request.query);
    return repository.getPayroll(
      request.user.clinicId,
      competence ?? saoPauloToday().slice(0, 7),
      branchIds,
    );
  });

  app.get(
    "/finance/payroll/employees",
    { preHandler: authenticate },
    async (request) => repository.listPayrollEmployees(request.user.clinicId),
  );

  // Não há cadastro direto na folha: o colaborador nasce do cadastro do usuário ("recebe
  // salário"). A edição abaixo vale só para os colaboradores cadastrados antes disso, e o
  // salário fixo não muda por ela (diferenças entram como desconto ou recompensa).
  app.put(
    "/finance/payroll/employees/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const employee = await repository.updatePayrollEmployee(
        request.user.clinicId,
        request.user.sub,
        id,
        payrollEmployeeInputSchema.parse(request.body),
      );
      if (!employee)
        return reply.status(404).send({
          code: "PAYROLL_EMPLOYEE_NOT_FOUND",
          message: "Colaborador não encontrado.",
        });
      return employee;
    },
  );

  // Desconto ou recompensa do mês (o salário fixo não muda pela folha).
  app.post(
    "/finance/payroll/entries",
    { preHandler: authenticate },
    async (request, reply) => {
      const entry = await repository.createPayrollEntry(
        request.user.clinicId,
        request.user.sub,
        payrollEntryInputSchema.parse(request.body),
      );
      if (!entry)
        return reply.status(404).send({
          code: "PAYROLL_EMPLOYEE_NOT_FOUND",
          message: "Colaborador não encontrado.",
        });
      return reply.status(201).send(entry);
    },
  );

  app.delete(
    "/finance/payroll/entries/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const deleted = await repository.deletePayrollEntry(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!deleted)
        return reply.status(404).send({
          code: "PAYROLL_ENTRY_NOT_FOUND",
          message: "Desconto ou recompensa não encontrado.",
        });
      return reply.status(204).send();
    },
  );

  // Vale: despesa já paga na entrega + desconto na folha do mês escolhido.
  app.post(
    "/finance/payroll/advances",
    { preHandler: authenticate },
    async (request, reply) => {
      const entry = await repository.createPayrollAdvance(
        request.user.clinicId,
        request.user.sub,
        payrollAdvanceInputSchema.parse(request.body),
      );
      if (!entry)
        return reply.status(404).send({
          code: "PAYROLL_EMPLOYEE_NOT_FOUND",
          message: "Colaborador não encontrado.",
        });
      return reply.status(201).send(entry);
    },
  );

  app.delete(
    "/finance/payroll/advances/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const deleted = await repository.deletePayrollAdvance(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!deleted)
        return reply.status(404).send({
          code: "PAYROLL_ADVANCE_NOT_FOUND",
          message: "Vale não encontrado.",
        });
      return reply.status(204).send();
    },
  );

  // Uma despesa por colaborador com o que está pendente (salário, comissões e ajustes).
  app.post(
    "/finance/payroll/launch",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.launchPayroll(
            request.user.clinicId,
            request.user.sub,
            payrollLaunchInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/finance/payroll/payables/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const payable = await repository.cancelPayrollLaunch(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Despesa da folha não encontrada.",
        });
      return payable;
    },
  );
}
