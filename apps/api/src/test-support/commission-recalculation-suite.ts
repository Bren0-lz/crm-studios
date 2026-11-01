import { randomUUID } from "node:crypto";
import { adminUserInputSchema, type CommissionEntry } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";
import { serviceWithSinglePlan } from "./single-plan-service.js";
import { createSalariedUser } from "./payroll-users.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

/**
 * Profissional e sala próprios, regra antiga de 10% desde 2025-01-01 e atendimentos concluídos
 * em março de 2025 (passado, sem depender do relógio) com as comissões já geradas.
 */
async function scenario(repo: ClinicRepository, days: string[]) {
  const professional = await repo.createProfessional(clinic, {
      fullName: "Profissional do recálculo",
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
      fullName: "Cliente do recálculo",
      phone: "11988887777",
      tags: [],
    });
  await repo.createCommissionRule(clinic, {
    professionalId: professional.id,
    percentage: 10,
    effectiveFrom: "2025-01-01",
  });
  const appointments = [];
  for (const day of days) {
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
    appointments.push(appointment);
  }
  const generated = await repo.generateCommissions(clinic, "2025-03");
  const commissions = appointments.map((appointment) =>
    generated.find((item) => item.appointmentId === appointment.id)!,
  );
  const commission = async (id: string) =>
    (await repo.generateCommissions(clinic, "2025-03")).find(
      (item) => item.id === id,
    )!;
  const recalculations = async () =>
    (await repo.listAdminAuditEvents(clinic)).filter(
      (item) =>
        item.action === "commission.recalculated" &&
        (item.metadata.items as { commissionId: string }[]).some((entry) =>
          commissions.some((own) => own.id === entry.commissionId),
        ),
    );
  return {
    professional,
    service,
    commissions,
    commission,
    recalculations,
    percent: (rate: number) => Math.round((18000 * rate) / 100),
  };
}

export function commissionRecalculationSuite(
  repository: () => ClinicRepository,
) {
  describe("recálculo retroativo de comissões", () => {
    it("só grava a regra quando não há comissão no período", async () => {
      const repo = repository();
      const { professional, commissions, commission, recalculations } =
        await scenario(repo, ["10"]);
      const rule = { percentage: 40, effectiveFrom: "2025-04-01" };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      expect(preview.items).toEqual([]);
      expect(preview.differenceInCents).toBe(0);
      await repo.createCommissionRule(
        clinic,
        { ...rule, professionalId: professional.id },
        { actorId: actor, expectedDigest: preview.digest },
      );
      expect(await commission(commissions[0]!.id)).toEqual(commissions[0]);
      expect(await recalculations()).toEqual([]);
    });

    it("usa a regra antiga antes do início e a nova depois, atualizando as abertas", async () => {
      const repo = repository();
      const { professional, commissions, commission, recalculations, percent } =
        await scenario(repo, ["10", "20"]);
      const [before, after] = commissions as [CommissionEntry, CommissionEntry];
      expect(after.amountInCents).toBe(percent(10));
      const rule = { percentage: 25, effectiveFrom: "2025-03-15" };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      expect(preview).toMatchObject({
        from: "2025-03-15",
        items: [
          {
            commissionId: after.id,
            sourceDate: "2025-03-20",
            status: "open",
            mode: "update",
            previousAmountInCents: percent(10),
            amountInCents: percent(25),
            differenceInCents: percent(25) - percent(10),
          },
        ],
        differenceInCents: percent(25) - percent(10),
        adjustmentInCents: 0,
      });
      const saved = await repo.createCommissionRule(
        clinic,
        { ...rule, professionalId: professional.id },
        { actorId: actor, expectedDigest: preview.digest },
      );
      expect(await commission(before.id)).toEqual(before);
      expect(await commission(after.id)).toMatchObject({
        status: "open",
        amountInCents: percent(25),
        percentage: 25,
        ruleId: saved.id,
        ruleSnapshot: { percentage: 25, effectiveFrom: "2025-03-15" },
      });
      const [event] = await recalculations();
      expect(event).toMatchObject({
        entityId: saved.id,
        metadata: {
          ruleIds: [saved.id],
          from: "2025-03-15",
          count: 1,
          differenceInCents: percent(25) - percent(10),
          adjustmentInCents: 0,
        },
      });
    });

    it("recalcula do início da regra até hoje e lança ajuste para a comissão já paga", async () => {
      const repo = repository();
      const { professional, commissions, commission, recalculations, percent } =
        await scenario(repo, ["05", "12"]);
      const [paid, open] = commissions as [CommissionEntry, CommissionEntry];
      await repo.settleCommission(clinic, actor, paid.id);
      const rule = { percentage: 30, effectiveFrom: "2025-03-01" };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      const difference = percent(30) - percent(10);
      expect(preview.from).toBe("2025-03-01");
      expect(preview.until >= "2026-01-01").toBe(true);
      expect(
        preview.items.map((item) => [item.commissionId, item.mode]),
      ).toEqual([
        [paid.id, "adjustment"],
        [open.id, "update"],
      ]);
      expect(preview).toMatchObject({
        differenceInCents: difference * 2,
        adjustmentInCents: difference,
      });
      await repo.createCommissionRule(
        clinic,
        { ...rule, professionalId: professional.id },
        { actorId: actor, expectedDigest: preview.digest },
      );
      // A paga mantém o valor pago; a diferença vira ajuste aberto para o próximo pagamento.
      expect(await commission(paid.id)).toMatchObject({
        status: "paid",
        amountInCents: percent(10),
      });
      expect(await commission(open.id)).toMatchObject({
        amountInCents: percent(30),
      });
      const account = await repo.getCommissionReconciliationPreview(
        clinic,
        paid.id,
      );
      expect(account.adjustments).toEqual([
        expect.objectContaining({
          amountInCents: difference,
          status: "open",
          professionalId: professional.id,
          reason:
            "Recálculo retroativo pela regra de comissão válida desde 01/03/2025.",
        }),
      ]);
      expect(account.changes).toEqual([]);
      expect(account.reconciliations).toHaveLength(1);
      await repo.settleCommissionAccount(
        clinic,
        actor,
        paid.id,
        professional.id,
        difference,
      );
      expect(
        (await repo.getCommissionReconciliationPreview(clinic, paid.id))
          .adjustments[0],
      ).toMatchObject({ status: "paid" });
      expect(await recalculations()).toHaveLength(1);
      // Gravar de novo a mesma situação não recalcula nada.
      const again = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [{ percentage: 30, effectiveFrom: "2025-03-02" }],
      });
      expect(again.items).toEqual([]);
    });

    it("recusa a prévia desatualizada sem gravar a regra", async () => {
      const repo = repository();
      const { professional, commissions, commission } = await scenario(repo, [
        "18",
      ]);
      const rule = { percentage: 50, effectiveFrom: "2025-03-01" };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      expect(preview.items[0]?.mode).toBe("update");
      await repo.settleCommission(clinic, actor, commissions[0]!.id);
      await expect(
        repo.createCommissionRule(
          clinic,
          { ...rule, professionalId: professional.id },
          { actorId: actor, expectedDigest: preview.digest },
        ),
      ).rejects.toMatchObject({ code: "COMMISSION_RECALCULATION_STALE" });
      expect(await commission(commissions[0]!.id)).toMatchObject({
        status: "paid",
        amountInCents: commissions[0]!.amountInCents,
      });
      // A regra não ficou gravada: a mesma vigência ainda pode ser criada.
      const fresh = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      expect(fresh.items[0]?.mode).toBe("adjustment");
      await repo.createCommissionRule(
        clinic,
        { ...rule, professionalId: professional.id },
        { actorId: actor, expectedDigest: fresh.digest },
      );
    });

    it("recalcula pela regra do usuário ligado ao profissional", async () => {
      const repo = repository();
      const { professional, commissions, commission, percent } = await scenario(
        repo,
        ["22"],
      );
      const user = await repo.createAdminUser(
        clinic,
        actor,
        adminUserInputSchema.parse({
          fullName: "Usuária do recálculo",
          email: `${randomUUID()}@test.local`,
          role: "user",
          password: "Senha123",
        }),
        "hash",
      );
      await repo.setAdminUserProfessional(
        clinic,
        actor,
        user.id,
        professional.id,
      );
      const rule = {
        kind: "fixed" as const,
        percentage: 0,
        fixedAmountInCents: 4321,
        effectiveFrom: "2025-03-01",
      };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        userId: user.id,
        rules: [rule],
      });
      expect(preview.items).toEqual([
        expect.objectContaining({
          commissionId: commissions[0]!.id,
          previousAmountInCents: percent(10),
          amountInCents: 4321,
        }),
      ]);
      await repo.setAdminUserCommission(clinic, actor, user.id, rule, {
        expectedDigest: preview.digest,
      });
      expect(await commission(commissions[0]!.id)).toMatchObject({
        amountInCents: 4321,
        ruleSnapshot: { kind: "fixed", fixedAmountInCents: 4321 },
      });
    });

    it("lança ajuste em vez de alterar a comissão já incluída na folha", async () => {
      const repo = repository();
      const { professional, commissions, commission, percent } = await scenario(
        repo,
        ["10"],
      );
      const [included] = commissions as [CommissionEntry];
      const { employee } = await createSalariedUser(repo, clinic, actor, {
          name: `Colaboradora ${randomUUID().slice(0, 6)}`,
          professionalId: professional.id,
          salaryInCents: null,
        }),
        category = await repo.createFinancialCategory(clinic, {
          name: `Folha ${randomUUID().slice(0, 8)}`,
          kind: "expense",
        });
      await repo.launchPayroll(clinic, actor, {
        competence: "2025-03",
        employeeIds: [employee.id],
        dueDate: "2025-04-05",
        categoryId: category.id,
      });
      const launched = await commission(included.id);
      expect(launched.payrollPayableId).toBeTruthy();
      const rule = { percentage: 30, effectiveFrom: "2025-03-01" };
      const preview = await repo.previewCommissionRecalculation(clinic, {
        professionalId: professional.id,
        rules: [rule],
      });
      expect(preview.items).toEqual([
        expect.objectContaining({
          commissionId: included.id,
          mode: "adjustment",
          differenceInCents: percent(30) - percent(10),
        }),
      ]);
      await repo.createCommissionRule(
        clinic,
        { ...rule, professionalId: professional.id },
        { actorId: actor, expectedDigest: preview.digest },
      );
      // O valor lançado na despesa da folha continua o mesmo; a diferença vira ajuste.
      expect(await commission(included.id)).toEqual(launched);
    });
  });
}
