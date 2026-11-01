import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { payrollSuite } from "../../test-support/payroll-suite.js";
import { salariedEmployeeViaApi } from "../../test-support/payroll-users.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

payrollSuite(() => new MemoryClinicRepository());

describe("rotas da folha de pagamento", () => {
  it("centraliza o pagamento de comissão na folha e exige a permissão da folha", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    try {
      const [professional] = await repository.listProfessionals(clinicId),
        [room] = await repository.listRooms(clinicId),
        service = (await repository.listServices(clinicId)).find(
          (item) => item.priceInCents >= 1000,
        )!,
        patient = await repository.createPatient(clinicId, {
          cpf: nextTestCpf(),
          fullName: "Cliente das rotas da folha",
          phone: "11988887777",
          tags: [],
        });
      await repository.createCommissionRule(clinicId, {
        professionalId: professional!.id,
        percentage: 10,
        effectiveFrom: "2025-01-01",
        serviceId: service.id,
      });
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patient.id,
        professionalId: professional!.id,
        roomId: room!.id,
        serviceId: service.id,
        startsAt: "2025-02-11T13:00:00Z",
        visitType: "regular",
        notes: "",
      });
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "completed",
      );
      const commission = (
        await repository.generateCommissions(clinicId, "2025-02")
      ).find((item) => item.appointmentId === appointment.id)!;
      const admin = {
        authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
      };
      for (const [url, payload] of [
        [`/finance/commissions/${commission.id}/pay`, {}],
        [
          `/finance/commissions/${commission.id}/accounts/${professional!.id}/pay`,
          { expectedAmountInCents: commission.amountInCents },
        ],
      ] as const) {
        const blocked = await app.inject({
          method: "POST",
          url,
          headers: admin,
          payload,
        });
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().code).toBe("COMMISSION_PAID_BY_PAYROLL");
      }
      const [category] = (await repository.getFinancialWorkspace(clinicId))
        .categories;
      const linked = await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers: admin,
        payload: {
          commissionId: commission.id,
          description: "Comissão avulsa",
          categoryId: category!.id,
          dueDate: "2025-03-05",
          amountInCents: commission.amountInCents,
        },
      });
      expect(linked.json().code).toBe("COMMISSION_PAID_BY_PAYROLL");

      // Não há cadastro direto na folha: o colaborador vem do usuário com salário.
      const direct = await app.inject({
        method: "POST",
        url: "/finance/payroll/employees",
        headers: admin,
        payload: { name: "Direto na folha", baseSalaryInCents: 100000 },
      });
      expect(direct.statusCode).toBe(404);
      const employeeId = await salariedEmployeeViaApi(app, admin, {
        name: "Colaboradora das rotas",
        professionalId: professional!.id,
        salaryInCents: 100000,
      });
      const edit = await app.inject({
        method: "PUT",
        url: `/finance/payroll/employees/${employeeId}`,
        headers: admin,
        payload: { name: "Outro nome", baseSalaryInCents: 1 },
      });
      expect(edit.statusCode).toBe(409);
      expect(edit.json().code).toBe("PAYROLL_EMPLOYEE_MANAGED_BY_USER");
      // Desconto/recompensa do mês: o salário fixo não muda.
      const invalid = await app.inject({
        method: "POST",
        url: "/finance/payroll/entries",
        headers: admin,
        payload: {
          employeeId,
          competence: "2025-02",
          kind: "discount",
          mode: "percent",
          value: 10001,
          reason: "Acima de 100%",
        },
      });
      expect(invalid.statusCode).toBe(400);
      const created = await app.inject({
        method: "POST",
        url: "/finance/payroll/entries",
        headers: admin,
        payload: {
          employeeId,
          competence: "2025-02",
          kind: "discount",
          mode: "percent",
          value: 1000,
          reason: "Faltas",
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ amountInCents: 10000 });
      const removed = await app.inject({
        method: "DELETE",
        url: `/finance/payroll/entries/${created.json().id}`,
        headers: admin,
      });
      expect(removed.statusCode).toBe(204);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/finance/payroll/entries/${created.json().id}`,
            headers: admin,
          })
        ).statusCode,
      ).toBe(404);
      const summary = await app.inject({
        method: "GET",
        url: "/finance/payroll?competence=2025-02",
        headers: admin,
      });
      expect(summary.statusCode).toBe(200);
      // Sem categoria: usa "Folha de pagamento", criada no primeiro lançamento.
      const launch = await app.inject({
        method: "POST",
        url: "/finance/payroll/launch",
        headers: admin,
        payload: {
          competence: "2025-02",
          employeeIds: [employeeId],
          dueDate: "2025-03-05",
        },
      });
      expect(launch.statusCode).toBe(201);
      expect(launch.json().payables[0].categoryName).toBe(
        "Folha de pagamento",
      );
      const payrollCategories = (
        await repository.getFinancialWorkspace(clinicId)
      ).categories.filter((item) => item.name === "Folha de pagamento");
      expect(payrollCategories).toMatchObject([
        { kind: "expense", active: true },
      ]);
      expect(launch.json().payables[0].amountInCents).toBe(
        100000 + commission.amountInCents,
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/payroll/payables/${launch.json().payables[0].id}/cancel`,
            headers: admin,
          })
        ).json().status,
      ).toBe("cancelled");

      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Financeiro sem folha",
          email: `${randomUUID()}@test.local`,
          password: "Password123",
          role: "user",
          permissions: ["finance.view", "finance.commissions_pay"],
        },
        "unused",
      );
      const finance = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/finance/payroll",
            headers: finance,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/finance/payroll/entries",
            headers: finance,
            payload: {
              employeeId,
              competence: "2025-02",
              kind: "bonus",
              mode: "amount",
              value: 100,
              reason: "Sem permissão",
            },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
