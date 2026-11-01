import { describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildApp } from "../../app.js";
import { commissionRecalculationSuite } from "../../test-support/commission-recalculation-suite.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { serviceWithSinglePlan } from "../../test-support/single-plan-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

commissionRecalculationSuite(() => new MemoryClinicRepository());

describe("rotas do recálculo retroativo de comissões", () => {
  it("mostra a prévia, confere a confirmação e restringe a regra de usuário ao admin", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    try {
      const [professional] = await repository.listProfessionals(clinicId),
        [room] = await repository.listRooms(clinicId),
        service = await serviceWithSinglePlan(
          repository,
          clinicId,
          "22222222-2222-4222-8222-222222222222",
          18000,
        ),
        patient = await repository.createPatient(clinicId, {
          cpf: nextTestCpf(),
          fullName: "Cliente da prévia",
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
      const rule = {
        professionalId: professional!.id,
        serviceId: service.id,
        percentage: 20,
        effectiveFrom: "2025-02-01",
      };
      const preview = await app.inject({
        method: "POST",
        url: "/finance/commission-rules/recalculation/preview",
        headers: admin,
        payload: {
          professionalId: rule.professionalId,
          rules: [
            {
              serviceId: rule.serviceId,
              percentage: rule.percentage,
              effectiveFrom: rule.effectiveFrom,
            },
          ],
        },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().items).toEqual([
        expect.objectContaining({
          commissionId: commission.id,
          mode: "update",
        }),
      ]);
      const stale = await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers: admin,
        payload: { ...rule, recalculationDigest: "0".repeat(64) },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe("COMMISSION_RECALCULATION_STALE");
      const saved = await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers: admin,
        payload: { ...rule, recalculationDigest: preview.json().digest },
      });
      expect(saved.statusCode).toBe(201);
      expect(
        (await repository.generateCommissions(clinicId, "2025-02")).find(
          (item) => item.id === commission.id,
        )?.amountInCents,
      ).toBe(Math.round(18000 * 0.2));

      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Financeiro sem admin",
          email: "commission-preview@test.local",
          password: "Password123",
          role: "user",
          permissions: ["finance.view", "finance.commission_rules"],
        },
        "unused",
      );
      const finance = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/finance/commission-rules/recalculation/preview",
            headers: finance,
            payload: {
              userId: user.id,
              rules: [{ percentage: 5, effectiveFrom: "2025-02-01" }],
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/finance/commission-rules/recalculation/preview",
            headers: finance,
            payload: {
              rules: [{ percentage: 5, effectiveFrom: "2025-02-01" }],
            },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});
