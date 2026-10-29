import {
  payrollEmployeeInputSchema,
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

  app.post(
    "/finance/payroll/employees",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createPayrollEmployee(
            request.user.clinicId,
            request.user.sub,
            payrollEmployeeInputSchema.parse(request.body),
          ),
        ),
  );

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
