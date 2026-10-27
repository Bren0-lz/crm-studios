import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const autoCampaignClinicId = "11111111-1111-4111-8111-111111111111";
export const autoCampaignActorId = "22222222-2222-4222-8222-222222222222";
export const autoCampaignPatientName = "Paula Campanha";
const otherClinicId = "99999999-9999-4999-8999-999999999999";

/** Mesmo comportamento das campanhas automáticas em memória e no PostgreSQL. */
export async function verifyAutoCampaignRepository(
  repository: ClinicRepository,
) {
  const clinicId = autoCampaignClinicId,
    actor = autoCampaignActorId;
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: autoCampaignPatientName,
    phone: "11988887777",
    birthDate: "1990-06-10",
    tags: [],
  });
  const campaign = await repository.createAutoCampaign(clinicId, actor, {
    name: "Aniversário (teste)",
    trigger: "birthday",
    active: true,
    steps: [
      { offset: 7, message: "Faltam 7 dias, {{nome}}" },
      { offset: 0, message: "Parabéns, {{nome}}" },
    ],
  });
  expect(campaign.steps.map((step) => step.offset)).toEqual([0, 7]);
  expect(
    (await repository.listAutoCampaigns(clinicId)).some(
      (item) => item.id === campaign.id,
    ),
  ).toBe(true);
  expect(await repository.getAutoCampaign(otherClinicId, campaign.id)).toBe(
    null,
  );

  const dayStep = campaign.steps.find((step) => step.offset === 0)!;
  const input = {
    campaignId: campaign.id,
    stepId: dayStep.id,
    patientId: patient.id,
    occurrenceKey: `${patient.id}:2039`,
    message: "Parabéns, Paula",
  };
  const sent = await repository.saveAutoCampaignDelivery(clinicId, actor, {
    ...input,
    status: "sent",
  });
  expect(sent).toMatchObject({ status: "sent", message: "Parabéns, Paula" });
  // Registrar de novo troca o mesmo envio (um por mensagem e evento).
  const skipped = await repository.saveAutoCampaignDelivery(clinicId, actor, {
    ...input,
    status: "skipped",
    skipReason: "other",
    note: "Ligou para a clínica",
  });
  expect(skipped.id).toBe(sent.id);
  expect(skipped).toMatchObject({
    status: "skipped",
    skipReason: "other",
    note: "Ligou para a clínica",
  });
  const ours = async () =>
    (await repository.listAutoCampaignDeliveries(clinicId)).filter(
      (item) => item.campaignId === campaign.id,
    );
  expect(await ours()).toHaveLength(1);

  // Editar mantendo o id da mensagem preserva o histórico; mensagem nova ganha id novo.
  const updated = await repository.updateAutoCampaign(clinicId, campaign.id, {
    name: "Aniversário editado",
    trigger: "birthday",
    active: false,
    steps: [
      { id: dayStep.id, offset: 0, message: "Feliz aniversário!" },
      { offset: 1, message: "É amanhã!" },
    ],
  });
  expect(updated).toMatchObject({ name: "Aniversário editado", active: false });
  expect(updated!.steps[0]).toEqual({
    id: dayStep.id,
    offset: 0,
    message: "Feliz aniversário!",
  });
  expect(updated!.steps[1]!.id).not.toBe(
    campaign.steps.find((step) => step.offset === 7)!.id,
  );
  expect(await ours()).toHaveLength(1);
  expect(
    await repository.updateAutoCampaign(otherClinicId, campaign.id, {
      name: "x",
      trigger: "birthday",
      active: true,
      steps: [{ offset: 0, message: "x" }],
    }),
  ).toBe(null);

  expect(await repository.deleteAutoCampaignDelivery(clinicId, sent.id)).toBe(
    true,
  );
  expect(await ours()).toHaveLength(0);

  const source = await repository.getAutoCampaignSourceData(
    clinicId,
    "2000-01-01",
  );
  expect(source.patients.some((item) => item.id === patient.id)).toBe(true);

  expect(await repository.deleteAutoCampaign(clinicId, campaign.id)).toBe(true);
  expect(await repository.deleteAutoCampaign(clinicId, campaign.id)).toBe(
    false,
  );
  expect(await repository.getAutoCampaign(clinicId, campaign.id)).toBe(null);
}
