import { randomUUID } from "node:crypto";
import type { PayrollLine, PayrollSummary } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";
import { serviceWithSinglePlan } from "./single-plan-service.js";
import { createSalariedUser } from "./payroll-users.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const competence = "2025-03";

function lineOf(summary: PayrollSummary, employeeId: string) {
  return summary.branches
    .flatMap((branch) => branch.lines)
    .find((line) => line.employee.id === employeeId) as PayrollLine;
}

/**
 * Profissional e sala próprios, regra de 10% desde 2025-01-01 e atendimentos concluídos em
 * março de 2025 (passado, sem depender do relógio) com as comissões geradas.
 */
async function scenario(repo: ClinicRepository, days: string[]) {
  const professional = await repo.createProfessional(clinic, {
      fullName: `Profissional da folha ${randomUUID().slice(0, 6)}`,
      crefito: randomUUID().slice(0, 12),
      specialty: "Pilates",
      color: "#547A6B",
    }),
    room = await repo.createRoom(clinic, {
      name: `Sala ${randomUUID().slice(0, 8)}`,
      capacity: 1,
    }),
    service = await serviceWithSinglePlan(repo, clinic, actor, 18000),
    patient = await repo.createPatient(clinic, {
      cpf: nextTestCpf(),
      fullName: "Cliente da folha",
      phone: "11988887777",
      tags: [],
    }),
    category = await repo.createFinancialCategory(clinic, {
      name: `Folha ${randomUUID().slice(0, 8)}`,
      kind: "expense",
    });
  await repo.createCommissionRule(clinic, {
    professionalId: professional.id,
    percentage: 10,
    effectiveFrom: "2025-01-01",
  });
  const complete = async (day: string) => {
    const appointment = await repo.createAppointment(clinic, {
      patientId: patient.id,
      professionalId: professional.id,
      roomId: room.id,
      serviceId: service.id,
      startsAt: `2025-03-${day}T13:00:00Z`,
      visitType: "regular",
      notes: "",
    });
    await repo.updateAppointmentStatus(clinic, appointment.id, "completed");
    return (await repo.generateCommissions(clinic, competence)).find(
      (item) => item.appointmentId === appointment.id,
    )!;
  };
  const commissions = [];
  for (const day of days) commissions.push(await complete(day));
  const { user, employee } = await createSalariedUser(repo, clinic, actor, {
    name: `Colaboradora ${randomUUID().slice(0, 6)}`,
    role: "Instrutora",
    professionalId: professional.id,
    salaryInCents: 150000,
  });
  const commission = async (id: string) =>
    (await repo.generateCommissions(clinic, competence)).find(
      (item) => item.id === id,
    )!;
  const launch = (employeeIds: string[]) =>
    repo.launchPayroll(clinic, actor, {
      competence,
      employeeIds,
      dueDate: "2025-04-05",
      categoryId: category.id,
    });
  return {
    professional,
    service,
    category,
    user,
    employee,
    commissions,
    complete,
    commission,
    launch,
    percent: (rate: number) => Math.round((18000 * rate) / 100),
  };
}

export function payrollSuite(repository: () => ClinicRepository) {
  describe("folha de pagamento", () => {
    it("lança uma despesa por colaborador com salário, comissões e ajustes e paga tudo junto", async () => {
      const repo = repository();
      const {
        professional,
        employee,
        commissions,
        commission,
        launch,
        percent,
      } = await scenario(repo, ["10", "12"]);
      const { employee: reception } = await createSalariedUser(
        repo,
        clinic,
        actor,
        { name: `Recepção ${randomUUID().slice(0, 6)}`, salaryInCents: 200000 },
      );
      // Ajuste de comissão de março: regra nova de 30% conciliada na primeira comissão.
      await repo.createCommissionRule(clinic, {
        professionalId: professional.id,
        percentage: 30,
        effectiveFrom: "2025-03-11",
      });
      const preview = await repo.getCommissionReconciliationPreview(
        clinic,
        commissions[1]!.id,
      );
      await repo.reconcileCommission(clinic, actor, commissions[1]!.id, {
        idempotencyKey: randomUUID(),
        expectedDigest: preview.digest,
        reason: "Regra nova de março",
      });
      const adjustment = percent(30) - percent(10);

      const before = await repo.getPayroll(clinic, competence);
      const line = lineOf(before, employee.id);
      expect(line.employee).toMatchObject({
        professionalId: professional.id,
        professionalName: professional.fullName,
        role: "Instrutora",
      });
      expect(line.items.map((item) => [item.kind, item.status])).toEqual([
        ["salary", "pending"],
        ["commission", "pending"],
        ["commission", "pending"],
        ["adjustment", "pending"],
      ]);
      expect(line).toMatchObject({
        salaryInCents: 150000,
        commissionInCents: percent(10) * 2,
        adjustmentInCents: adjustment,
        totalInCents: 150000 + percent(10) * 2 + adjustment,
        pendingInCents: 150000 + percent(10) * 2 + adjustment,
        payables: [],
      });
      expect(
        before.unassigned.some((row) => row.professionalId === professional.id),
      ).toBe(false);
      const dreBefore = await repo.getDreReport(
        clinic,
        "2025-03-01",
        "2025-03-31",
      );

      const result = await launch([employee.id, reception.id]);
      expect(result.skipped).toEqual([]);
      const own = result.payables.find(
        (item) => item.payroll?.employeeId === employee.id,
      )!;
      expect(own).toMatchObject({
        status: "open",
        dueDate: "2025-04-05",
        dreCompetence: competence,
        amountInCents: 150000 + percent(10) * 2 + adjustment,
        payroll: {
          employeeName: employee.name,
          competence,
          salaryInCents: 150000,
          commissionInCents: percent(10) * 2 + adjustment,
        },
      });
      expect(own.description).toBe(`Folha 03/2025 · ${employee.name}`);
      expect(own.notes).toContain("Salário fixo: R$");
      expect(own.notes).toContain("Comissões (2): R$");
      expect(own.notes).toContain("Ajustes de comissão (1): R$");
      expect(
        result.payables.find(
          (item) => item.payroll?.employeeId === reception.id,
        ),
      ).toMatchObject({ amountInCents: 200000 });

      // Lançada: nada pendente; lançar de novo não cria outra despesa.
      const launched = lineOf(
        await repo.getPayroll(clinic, competence),
        employee.id,
      );
      expect(launched.pendingInCents).toBe(0);
      expect(new Set(launched.items.map((item) => item.status))).toEqual(
        new Set(["launched"]),
      );
      await expect(launch([employee.id])).rejects.toMatchObject({
        code: "PAYROLL_NOTHING_PENDING",
      });
      // Na DRE só o salário entra pela despesa: a comissão já é custo na competência.
      const dreAfter = await repo.getDreReport(
        clinic,
        "2025-03-01",
        "2025-03-31",
      );
      expect(
        dreAfter.totals.expensesInCents - dreBefore.totals.expensesInCents,
      ).toBe(150000 + 200000);

      await repo.settlePayable(clinic, actor, own.id, "pix");
      expect(await commission(commissions[0]!.id)).toMatchObject({
        status: "paid",
        payrollPayableId: own.id,
      });
      const paid = await repo.getCommissionReconciliationPreview(
        clinic,
        commissions[1]!.id,
      );
      expect(paid.adjustments[0]).toMatchObject({
        status: "paid",
        payrollPayableId: own.id,
      });
      expect(
        new Set(
          lineOf(
            await repo.getPayroll(clinic, competence),
            employee.id,
          ).items.map((item) => item.status),
        ),
      ).toEqual(new Set(["paid"]));
      // No caixa, só a despesa da folha sai (a comissão não sai de novo).
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
      const cash = await repo.getDailyCash(clinic, today);
      expect(
        cash.movements.filter(
          (item) =>
            item.counterpart === professional.fullName ||
            item.description === own.description,
        ),
      ).toEqual([
        expect.objectContaining({
          kind: "payable",
          amountInCents: own.amountInCents,
        }),
      ]);
      expect(
        (await repo.getDreReport(clinic, "2025-03-01", "2025-03-31")).totals
          .expensesInCents,
      ).toBe(dreAfter.totals.expensesInCents);

      // Estornar a despesa reabre as comissões e o ajuste.
      await repo.reversePayablePayment(clinic, actor, own.id);
      expect(await commission(commissions[0]!.id)).toMatchObject({
        status: "open",
        payrollPayableId: own.id,
      });
      expect(
        lineOf(await repo.getPayroll(clinic, competence), employee.id).items[1],
      ).toMatchObject({ status: "launched", payableId: own.id });
      expect(
        (await repo.listAdminAuditEvents(clinic)).some(
          (item) =>
            item.action === "payroll.launched" &&
            (item.metadata.payableIds as string[]).includes(own.id),
        ),
      ).toBe(true);
    });

    it("lança o complemento do que apareceu depois e desfaz um lançamento em aberto", async () => {
      const repo = repository();
      const { employee, complete, launch, percent } = await scenario(repo, [
        "14",
      ]);
      const first = (await launch([employee.id])).payables[0]!;
      await repo.settlePayable(clinic, actor, first.id, "pix");
      const late = await complete("20");
      const pending = lineOf(
        await repo.getPayroll(clinic, competence),
        employee.id,
      );
      expect(pending.pendingInCents).toBe(percent(10));
      expect(pending.items.find((item) => item.id === late.id)?.status).toBe(
        "pending",
      );
      const complement = (await launch([employee.id])).payables[0]!;
      expect(complement).toMatchObject({
        description: `Folha 03/2025 (complemento) · ${employee.name}`,
        amountInCents: percent(10),
        payroll: { salaryInCents: 0, commissionInCents: percent(10) },
      });

      await expect(
        repo.cancelPayrollLaunch(clinic, actor, first.id),
      ).rejects.toMatchObject({ code: "PAYROLL_LAUNCH_NOT_OPEN" });
      const cancelled = await repo.cancelPayrollLaunch(
        clinic,
        actor,
        complement.id,
      );
      expect(cancelled?.status).toBe("cancelled");
      const again = lineOf(
        await repo.getPayroll(clinic, competence),
        employee.id,
      );
      expect(again.pendingInCents).toBe(percent(10));
      expect(again.payables.map((item) => item.id)).toEqual([first.id]);
    });

    it("separa por filial e aponta comissão sem colaborador", async () => {
      const repo = repository();
      const { professional, user, employee, category, percent } =
        await scenario(repo, ["16"]);
      const [matriz] = await repo.listBranches(clinic);
      const other = (await repo.saveBranch(clinic, actor, {
        name: `Filial ${randomUUID().slice(0, 6)}`,
      }))!;
      const { employee: remote } = await createSalariedUser(
        repo,
        clinic,
        actor,
        {
          name: `Remota ${randomUUID().slice(0, 6)}`,
          branchId: other.id,
          salaryInCents: 90000,
        },
      );
      const onlyOther = await repo.getPayroll(clinic, competence, [other.id]);
      expect(onlyOther.branches.map((item) => item.branchId)).toEqual([
        other.id,
      ]);
      expect(
        onlyOther.branches[0]!.lines.map((line) => line.employee.id),
      ).toEqual([remote.id]);
      expect(onlyOther.totals.salaryInCents).toBe(90000);
      const both = await repo.getPayroll(clinic, competence, [
        matriz!.id,
        other.id,
      ]);
      expect(both.branches.map((item) => item.branchName)).toEqual([
        matriz!.name,
        other.name,
      ]);
      expect(lineOf(both, employee.id)).toBeDefined();
      await expect(
        repo.getPayroll(clinic, competence, [randomUUID()]),
      ).rejects.toMatchObject({ code: "BRANCH_ACCESS_DENIED" });
      // O colaborador do usuário não se edita pela folha.
      await expect(
        repo.updatePayrollEmployee(clinic, actor, employee.id, {
          name: employee.name,
          baseSalaryInCents: 1,
          active: true,
        }),
      ).rejects.toMatchObject({ code: "PAYROLL_EMPLOYEE_MANAGED_BY_USER" });

      // Profissional com comissão e sem colaborador aparece no aviso.
      await repo.setAdminUserProfessional(clinic, actor, user.id, null);
      const unassigned = await repo.getPayroll(clinic, competence);
      expect(
        unassigned.unassigned.find(
          (row) => row.professionalId === professional.id,
        ),
      ).toMatchObject({ pendingInCents: percent(10), count: 1 });
      const launched = await repo.launchPayroll(clinic, actor, {
        competence,
        employeeIds: [employee.id],
        dueDate: "2025-04-05",
        categoryId: category.id,
      });
      expect(launched.payables[0]).toMatchObject({
        amountInCents: 150000,
        payroll: { commissionInCents: 0 },
      });
    });

    it("leva à folha só quem recebe salário no cadastro do usuário", async () => {
      const repo = repository();
      const name = `Salário ${randomUUID().slice(0, 6)}`;
      const lineFor = async (userId: string) =>
        (await repo.getPayroll(clinic, competence)).branches
          .flatMap((branch) => branch.lines)
          .find((line) => line.employee.userId === userId);

      // Sem salário e sem profissional: não entra na folha.
      const unpaid = await repo.createAdminUser(
        clinic,
        actor,
        {
          fullName: `Sem salário ${randomUUID().slice(0, 6)}`,
          email: `sem-salario-${randomUUID()}@studios.test`,
          role: "user",
          password: "senha-de-teste",
        },
        "hash-de-teste",
      );
      expect(unpaid.salaryInCents).toBeUndefined();
      expect(await lineFor(unpaid.id)).toBeUndefined();

      const { user, employee } = await createSalariedUser(repo, clinic, actor, {
        name,
        role: "Recepção",
        salaryInCents: 180000,
      });
      expect(user.salaryInCents).toBe(180000);
      expect(employee).toMatchObject({
        name,
        role: "Recepção",
        baseSalaryInCents: 180000,
        active: true,
      });
      expect(await lineFor(user.id)).toMatchObject({ salaryInCents: 180000 });

      // Salário, nome e cargo mudam pelo cadastro do usuário.
      const update = {
        fullName: `${name} Silva`,
        role: "user" as const,
        active: true,
        jobTitle: "Gerente",
      };
      const raised = await repo.updateAdminUser(clinic, actor, user.id, {
        ...update,
        salaryInCents: 210000,
      });
      expect(raised?.salaryInCents).toBe(210000);
      expect(await lineFor(user.id)).toMatchObject({
        salaryInCents: 210000,
        employee: { id: employee.id, name: `${name} Silva`, role: "Gerente" },
      });
      // Ausente mantém o salário.
      await repo.updateAdminUser(clinic, actor, user.id, update);
      expect(await lineFor(user.id)).toMatchObject({ salaryInCents: 210000 });

      // Deixa de receber: sai da folha (o cadastro do colaborador fica, inativo).
      const removed = await repo.updateAdminUser(clinic, actor, user.id, {
        ...update,
        salaryInCents: null,
      });
      expect(removed?.salaryInCents).toBeUndefined();
      expect(await lineFor(user.id)).toBeUndefined();
      expect(
        (await repo.listPayrollEmployees(clinic)).find(
          (item) => item.id === employee.id,
        ),
      ).toMatchObject({ active: false, baseSalaryInCents: 0 });

      // Volta a receber: o mesmo colaborador.
      await repo.updateAdminUser(clinic, actor, user.id, {
        ...update,
        salaryInCents: 100000,
      });
      expect(await lineFor(user.id)).toMatchObject({
        salaryInCents: 100000,
        employee: { id: employee.id, active: true },
      });
    });
  });
}
