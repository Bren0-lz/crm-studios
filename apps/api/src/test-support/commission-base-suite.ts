import { randomUUID } from "node:crypto";
import {
  patientPlanInputSchema,
  planTemplateInputSchema,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { sellSessionForAppointment } from "./commission-billing.js";
import { nextTestCpf } from "./cpf.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

/**
 * Base da comissão = valor pago pelo cliente: o da sessão do plano consumido (com o desconto
 * do cliente) ou nada, quando o atendimento não consumiu plano (nem o plano avulso só
 * cadastrado conta). Mesmo cenário na memória e no MySQL.
 */
export function commissionBaseSuite(repository: () => ClinicRepository) {
  async function scenario(repo: ClinicRepository) {
    const professional = await repo.createProfessional(clinic, {
        fullName: `Profissional da base ${randomUUID().slice(0, 6)}`,
        crefito: randomUUID().slice(0, 12),
        specialty: "Pilates",
        color: "#547A6B",
      }),
      room = await repo.createRoom(clinic, {
        name: `Sala ${randomUUID().slice(0, 8)}`,
        capacity: 1,
      }),
      service = await repo.createService(clinic, {
        name: `Pilates ${randomUUID().slice(0, 8)}`,
        durationMinutes: 50,
      }),
      patient = await repo.createPatient(clinic, {
        cpf: nextTestCpf(),
        fullName: "Cliente da base da comissão",
        phone: "11988887777",
        tags: [],
      });
    await repo.createCommissionRule(clinic, {
      professionalId: professional.id,
      percentage: 10,
      effectiveFrom: "2025-01-01",
    });
    const appointment = async (day: string) =>
      repo.createAppointment(clinic, {
        patientId: patient.id,
        professionalId: professional.id,
        roomId: room.id,
        serviceId: service.id,
        startsAt: `2025-04-${day}T13:00:00Z`,
        visitType: "regular",
        notes: "",
      });
    const complete = (id: string) =>
      repo.updateAppointmentStatus(clinic, id, "completed");
    const generate = async () =>
      (await repo.generateCommissions(clinic, "2025-04")).filter(
        (item) => item.professionalId === professional.id,
      );
    return { professional, service, patient, appointment, complete, generate };
  }

  describe("base da comissão: valor pago pelo cliente", () => {
    it("usa o valor pago na sessão avulsa", async () => {
      const repo = repository();
      const { appointment, complete, generate } = await scenario(repo);
      const billed = await appointment("08");
      await sellSessionForAppointment(repo, clinic, actor, billed, 8000);
      await complete(billed.id);
      expect(await generate()).toEqual([
        expect.objectContaining({
          appointmentId: billed.id,
          baseAmountInCents: 8000,
          percentage: 10,
          amountInCents: 800,
        }),
      ]);
    });

    it("usa o valor da sessão do plano com o desconto do cliente", async () => {
      const repo = repository();
      const { service, patient, appointment, complete, generate } =
        await scenario(repo);
      const terms = {
        name: "Pacote com desconto",
        kind: "fixed_package" as const,
        totalValueInCents: 40000,
        services: [
          { serviceId: service.id, totalSessions: 8, totalValueInCents: 40000 },
        ],
      };
      const template = await repo.createPlanTemplate(clinic, actor, {
        ...terms,
        planType: null,
      });
      await repo.createPatientPlan(
        clinic,
        actor,
        patientPlanInputSchema.parse({
          ...terms,
          patientId: patient.id,
          planTemplateId: template.id,
          installments: 1,
          firstDueDate: "2025-04-01",
          validFrom: "2025-04-01",
          validUntil: "2025-06-30",
          discount: { type: "amount", amountInCents: 4000, scope: "once" },
        }),
      );
      const session = await appointment("15");
      await complete(session.id);
      // R$ 400 − R$ 40 de desconto = R$ 360 por 8 sessões → R$ 45 por sessão.
      expect(await generate()).toEqual([
        expect.objectContaining({
          appointmentId: session.id,
          baseAmountInCents: 4500,
          amountInCents: 450,
        }),
      ]);
    });

    it("não gera comissão (nem previsão) para atendimento sem plano, mesmo com plano avulso cadastrado", async () => {
      const repo = repository();
      const { professional, service, appointment, complete, generate } =
        await scenario(repo);
      await repo.createPlanTemplate(
        clinic,
        actor,
        planTemplateInputSchema.parse({
          name: `${service.name} (avulso)`,
          totalValueInCents: 18000,
          planType: "single",
          kind: "single",
          services: [
            { serviceId: service.id, totalSessions: 1, totalValueInCents: 18000 },
          ],
        }),
      );
      const unbilled = await appointment("22");
      await complete(unbilled.id);
      const production = await repo.listTeamProduction(
        clinic,
        "2025-04-01",
        "2025-04-30",
      );
      expect(
        production.pendingCommissions.filter(
          (item) => item.professionalId === professional.id,
        ),
      ).toEqual([]);
      expect(await generate()).toEqual([]);
    });
  });
}
