import { randomUUID } from "node:crypto";
import {
  patientPlanInputSchema,
  planTemplateInputSchema,
} from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const trashClinicId = "11111111-1111-4111-8111-111111111111";
export const trashActorId = "22222222-2222-4222-8222-222222222222";

/**
 * Lixeira nos dois armazenamentos: some das listas, volta igual ao restaurar e, na exclusão
 * definitiva, leva junto o que está ligado ao item.
 */
export async function verifyTrashRepository(repository: ClinicRepository) {
  const clinicId = trashClinicId,
    actor = trashActorId;
  const [professionals, rooms, services] = await Promise.all([
    repository.listProfessionals(clinicId),
    repository.listRooms(clinicId),
    repository.listServices(clinicId),
  ]);
  const professional = professionals.find((item) => item.active)!,
    room = rooms.find((item) => item.active)!,
    service = services.find((item) => item.active)!;
  const patient = (fullName: string) =>
    repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName,
      phone: "11988887777",
      tags: [],
    });
  const appointment = (patientId: string, startsAt: string) =>
    repository.createAppointment(clinicId, {
      patientId,
      professionalId: professional.id,
      roomId: room.id,
      serviceId: service.id,
      startsAt,
      visitType: "regular",
      notes: "",
    });
  const plan = async (patientId: string) => {
    const terms = {
      name: `Plano lixeira ${randomUUID().slice(0, 8)}`,
      totalValueInCents: 10_000,
      kind: "single" as const,
      services: [
        { serviceId: service.id, totalSessions: 1, totalValueInCents: 10_000 },
      ],
    };
    const template = await repository.createPlanTemplate(
      clinicId,
      actor,
      planTemplateInputSchema.parse({ ...terms, planType: "single" }),
    );
    return repository.createPatientPlan(
      clinicId,
      actor,
      patientPlanInputSchema.parse({
        ...terms,
        planTemplateId: template.id,
        patientId,
        installments: 1,
        firstDueDate: "2025-01-10",
        validFrom: "2025-01-10",
        validUntil: "2025-12-31",
        autoRenew: false,
      }),
    );
  };
  const listIds = async (
    list: Promise<readonly { id: string }[]>,
  ): Promise<string[]> => (await list).map((item) => item.id);

  // Cliente: some das listas e volta exatamente como estava.
  const ana = await patient("Ana Lixeira");
  const anaPlan = await plan(ana.id);
  const anaVisit = await appointment(ana.id, "2025-01-10T12:00:00.000Z");
  const before = await repository.getPatient(clinicId, ana.id);
  const sent = await repository.sendToTrash(
    clinicId,
    actor,
    "patients",
    ana.id,
  );
  expect(sent).toMatchObject({
    id: ana.id,
    kind: "patients",
    title: "Ana Lixeira",
  });
  expect(sent.deletedAt).toEqual(expect.any(String));
  expect(await listIds(repository.listPatients(clinicId))).not.toContain(
    ana.id,
  );
  expect(await repository.getPatient(clinicId, ana.id)).toBeNull();
  expect(await listIds(repository.listTrash(clinicId, "patients"))).toEqual([
    ana.id,
  ]);
  await expect(
    repository.sendToTrash(clinicId, actor, "patients", ana.id),
  ).rejects.toMatchObject({
    code: "TRASH_ITEM_ALREADY_IN_TRASH",
    statusCode: 409,
  });
  // Plano do cliente na lixeira só volta depois do cliente.
  await repository.sendToTrash(clinicId, actor, "patient-plans", anaPlan.id);
  await expect(
    repository.restoreFromTrash(clinicId, actor, "patient-plans", anaPlan.id),
  ).rejects.toMatchObject({ code: "TRASH_RESTORE_PATIENT_IN_TRASH" });
  await repository.restoreFromTrash(clinicId, actor, "patients", ana.id);
  expect(await repository.getPatient(clinicId, ana.id)).toEqual(before);
  expect(await repository.listTrash(clinicId, "patients")).toEqual([]);
  await expect(
    repository.restoreFromTrash(clinicId, actor, "patients", ana.id),
  ).rejects.toMatchObject({ code: "TRASH_ITEM_NOT_IN_TRASH" });

  // Plano: some da ficha e volta.
  expect(
    await listIds(repository.listPatientPlans(clinicId, ana.id)),
  ).not.toContain(anaPlan.id);
  await repository.restoreFromTrash(
    clinicId,
    actor,
    "patient-plans",
    anaPlan.id,
  );
  expect(await listIds(repository.listPatientPlans(clinicId, ana.id))).toEqual([
    anaPlan.id,
  ]);

  // Exclusão definitiva: só da lixeira, com o aviso do que vai junto.
  await expect(
    repository.purgeFromTrash(clinicId, actor, "patients", ana.id),
  ).rejects.toMatchObject({ code: "TRASH_ITEM_NOT_IN_TRASH" });
  await repository.sendToTrash(clinicId, actor, "patients", ana.id);
  const impact = await repository.trashImpact(clinicId, "patients", ana.id);
  expect(impact).toMatchObject({ id: ana.id, title: "Ana Lixeira" });
  expect(impact.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "appointments", count: 1 }),
      expect.objectContaining({ key: "patient_plans", count: 1 }),
    ]),
  );
  expect(impact.total).toBe(
    impact.items.reduce((sum, item) => sum + item.count, 0),
  );
  await repository.purgeFromTrash(clinicId, actor, "patients", ana.id);
  expect(await repository.listTrash(clinicId, "patients")).toEqual([]);
  expect(await repository.findAppointment(clinicId, anaVisit.id)).toBeNull();
  expect(
    await listIds(
      repository.listAppointments(
        clinicId,
        "2025-01-10T00:00:00.000Z",
        "2025-01-11T00:00:00.000Z",
      ),
    ),
  ).not.toContain(anaVisit.id);
  await expect(
    repository.restoreFromTrash(clinicId, actor, "patients", ana.id),
  ).rejects.toMatchObject({ code: "TRASH_ITEM_NOT_FOUND", statusCode: 404 });

  // Cliente com atendimento agendado à frente não vai para a lixeira.
  const bruno = await patient("Bruno Lixeira");
  const future = new Date(Date.now() + 7 * 86_400_000);
  future.setUTCHours(13, 0, 0, 0);
  await appointment(bruno.id, future.toISOString());
  await expect(
    repository.sendToTrash(clinicId, actor, "patients", bruno.id),
  ).rejects.toMatchObject({
    code: "TRASH_FUTURE_APPOINTMENTS",
    statusCode: 409,
  });

  // Atendimento: libera o horário; restaurar confere se ele continua livre.
  const carla = await patient("Carla Lixeira");
  const slot = "2025-02-03T15:00:00.000Z";
  const first = await appointment(carla.id, slot);
  await repository.sendToTrash(clinicId, actor, "appointments", first.id);
  expect(await repository.findAppointment(clinicId, first.id)).toBeNull();
  const second = await appointment(carla.id, slot);
  await expect(
    repository.restoreFromTrash(clinicId, actor, "appointments", first.id),
  ).rejects.toMatchObject({ code: "TRASH_RESTORE_CONFLICT", statusCode: 409 });
  await repository.sendToTrash(clinicId, actor, "appointments", second.id);
  await repository.restoreFromTrash(clinicId, actor, "appointments", first.id);
  expect(await repository.findAppointment(clinicId, first.id)).toMatchObject({
    id: first.id,
    startsAt: first.startsAt,
    status: first.status,
  });
  const trashedVisits = await repository.listTrash(clinicId, "appointments");
  expect(trashedVisits.map((item) => item.id)).toEqual([second.id]);
  expect(trashedVisits[0]!.detail).toBe(second.startsAt);

  // Lead: some do funil, volta e pode ser excluído de vez.
  const lead = await repository.createLead(clinicId, {
    fullName: "Lead Lixeira",
    phone: "11955554444",
    source: "Instagram",
    interest: "Pilates",
    tags: [],
  });
  await repository.sendToTrash(clinicId, actor, "leads", lead.id);
  expect(await listIds(repository.listLeads(clinicId))).not.toContain(lead.id);
  await repository.restoreFromTrash(clinicId, actor, "leads", lead.id);
  expect(await listIds(repository.listLeads(clinicId))).toContain(lead.id);
  await repository.sendToTrash(clinicId, actor, "leads", lead.id);
  expect(
    (await repository.trashImpact(clinicId, "leads", lead.id)).total,
  ).toBeGreaterThanOrEqual(0);
  await repository.purgeFromTrash(clinicId, actor, "leads", lead.id);
  expect(await repository.listTrash(clinicId, "leads")).toEqual([]);
  expect(await listIds(repository.listLeads(clinicId))).not.toContain(lead.id);

  // Outra clínica não vê nem mexe na lixeira.
  const otherClinic = "99999999-9999-4999-8999-999999999999";
  expect(await repository.listTrash(otherClinic, "appointments")).toEqual([]);
  await expect(
    repository.restoreFromTrash(otherClinic, actor, "appointments", second.id),
  ).rejects.toMatchObject({ code: "TRASH_ITEM_NOT_FOUND" });
}
