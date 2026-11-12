import { leadInputSchema } from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

/**
 * Leads nas campanhas, igual em memória e no MySQL: destinatário e envio com `leadId`,
 * campanha automática com `includeLeads`/`leadFilter` e, na conversão, o cliente novo
 * assume as campanhas do lead.
 */
export async function verifyCampaignLeadRepository(
  repository: ClinicRepository,
) {
  const lead = await repository.createLead(
    clinicId,
    leadInputSchema.parse({
      fullName: "Lia Suíte",
      phone: "11977776666",
      source: "Instagram",
      interest: "Pilates",
    }),
  );
  const template = await repository.createMessageTemplate(clinicId, actor, {
    title: "Convite leads",
    body: "Olá, {{nome}}!",
    images: [],
  });
  const manual = await repository.createWhatsappCampaign(clinicId, actor, {
    templateId: template.id,
    name: "Leads",
    recipients: [
      {
        leadId: lead.id,
        patientName: lead.fullName,
        phone: lead.phone,
        message: "Olá, Lia!",
      },
    ],
    promotion: { validDays: 5 },
  });
  expect(manual.recipients).toEqual([
    expect.objectContaining({ leadId: lead.id, status: "pending" }),
  ]);
  expect(manual.recipients[0]!.patientId).toBeUndefined();

  const automatic = await repository.createAutoCampaign(clinicId, actor, {
    name: "Lead novo",
    trigger: "lead_new",
    active: true,
    steps: [{ offset: 0, message: "Oi, {{nome}}" }],
    leadFilter: { stages: ["new_contact"], tags: [] },
  });
  expect(automatic).toMatchObject({
    includeLeads: false,
    leadFilter: { stages: ["new_contact"], tags: [] },
  });
  const birthday = await repository.createAutoCampaign(clinicId, actor, {
    name: "Aniversário com leads",
    trigger: "birthday",
    active: true,
    includeLeads: true,
    steps: [{ offset: 0, message: "Parabéns" }],
  });
  expect(birthday.includeLeads).toBe(true);
  const updated = await repository.updateAutoCampaign(clinicId, birthday.id, {
    name: birthday.name,
    trigger: "birthday",
    active: true,
    includeLeads: false,
    steps: birthday.steps,
  });
  expect(updated?.includeLeads).toBe(false);
  expect(updated?.leadFilter).toBeUndefined();

  const delivery = await repository.saveAutoCampaignDelivery(clinicId, actor, {
    campaignId: automatic.id,
    stepId: automatic.steps[0]!.id,
    leadId: lead.id,
    occurrenceKey: `lead:${lead.id}:new`,
    status: "sent",
    message: "Oi, Lia",
  });
  expect(delivery).toMatchObject({ leadId: lead.id, status: "sent" });
  expect(delivery.patientId).toBeUndefined();
  await expect(
    repository.saveAutoCampaignDelivery(clinicId, actor, {
      campaignId: automatic.id,
      stepId: automatic.steps[0]!.id,
      leadId: "33333333-3333-4333-8333-333333333333",
      occurrenceKey: "lead:x:new",
      status: "sent",
      message: "Oi",
    }),
  ).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });

  const conversion = await repository.convertLead(clinicId, actor, lead.id, {
    cpf: nextTestCpf(),
    whatsapp: "11977776666",
    emergencyContactName: "Joana Mãe",
    emergencyContactPhone: "11988887777",
  });
  const patientId = conversion!.patient.id;
  const detail = await repository.getWhatsappCampaign(clinicId, manual.id);
  expect(detail?.recipients[0]).toMatchObject({ leadId: lead.id, patientId });
  expect(
    (await repository.listAutoCampaignDeliveries(clinicId)).find(
      (item) => item.id === delivery.id,
    ),
  ).toMatchObject({ leadId: lead.id, patientId });
}
