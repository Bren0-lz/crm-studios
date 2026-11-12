import { nextTestCpf } from "../../test-support/cpf.js";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { guidedPatientInputSchema } from "@crm/contracts";
import { MemoryClinicRepository } from "../../memory-repository.js";
describe("memory transactions across clinics", () => {
  it("does not remove another clinic's concurrent write when a composed registration rolls back", async () => {
    const repository = new MemoryClinicRepository(),
      clinicId = "11111111-1111-4111-8111-111111111111",
      actorId = "22222222-2222-4222-8222-222222222222",
      otherClinicId = randomUUID(),
      [service] = await repository.listServices(clinicId);
    const input = guidedPatientInputSchema.parse({
      next: "plan",
      patient: {
        cpf: nextTestCpf(),
        fullName: "Cadastro que será revertido",
        phone: "11988887777",
        whatsapp: "11988887777",
        emergencyContactName: "Cadastro que será revertido",
        emergencyContactPhone: "11988887777",
        emergencyContactWhatsapp: "11988887777",
      },
      plan: {
        planTemplateId: randomUUID(),
        name: "Modelo inexistente",
        kind: "fixed_package",
        services: [
          {
            serviceId: service!.id,
            totalSessions: 4,
            totalValueInCents: 20000,
          },
        ],
        totalValueInCents: 20000,
        installments: 1,
        validFrom: "2055-01-01",
        firstDueDate: "2055-01-01",
      },
    });
    const [failed, foreign] = await Promise.allSettled([
      repository.createPatientWithNextStep(clinicId, actorId, input),
      repository.createPatient(otherClinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente preservado de outra clínica",
        phone: "11955554444",
        tags: [],
      }),
    ]);
    expect(failed.status).toBe("rejected");
    expect(foreign.status).toBe("fulfilled");
    expect(
      await repository.listPatients(clinicId, "Cadastro que será revertido"),
    ).toEqual([]);
    const preserved = await repository.listPatients(otherClinicId);
    expect(preserved).toHaveLength(1);
    expect(preserved[0]).toMatchObject({
      clinicId: otherClinicId,
      fullName: "Cliente preservado de outra clínica",
    });
    expect(
      (await repository.listPatients(clinicId)).some(
        (patient) => patient.id === preserved[0]!.id,
      ),
    ).toBe(false);
  });
});
