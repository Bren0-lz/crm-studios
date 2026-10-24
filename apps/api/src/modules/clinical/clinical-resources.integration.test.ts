import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it } from "vitest";
import { clinicalResourceInputSchema } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const [patient] = await repository.listPatients(clinicId),
    [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId);
  const appointment = await repository.createAppointment(clinicId, {
    patientId: patient!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    serviceId: service!.id,
    startsAt: "2039-04-10T12:00:00Z",
    visitType: "regular",
    notes: "",
  });
  return {
    repository,
    app,
    patient: patient!,
    professional: professional!,
    appointment,
    headers: {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    },
  };
}
describe("clinical resources", () => {
  it("publishes immutable model versions, validates answers and protects finalized evolutions", async () => {
    const { repository, patient, professional, appointment } = await setup();
    const templateInput = clinicalResourceInputSchema.parse({
      kind: "evolution_template",
      name: "Evolução pilates",
      format: "questionnaire",
      status: "published",
      fields: [
        {
          key: "atividade",
          label: "Atividade",
          type: "multiselect",
          required: true,
          options: ["Mobilidade", "Força"],
        },
      ],
    });
    const template = await repository.saveClinicalResource(
      clinicId,
      actorId,
      templateInput,
    );
    const evolution = clinicalResourceInputSchema.parse({
      kind: "evolution",
      name: "Evolução",
      patientId: patient.id,
      professionalId: professional.id,
      sourceType: "appointment",
      sourceId: appointment.id,
      templateId: template.id,
      format: "questionnaire",
      values: { atividade: ["Mobilidade"] },
    });
    const record = await repository.saveClinicalResource(
      clinicId,
      actorId,
      evolution,
    );
    const revised = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        ...templateInput,
        fields: [
          {
            key: "atividade",
            label: "Nova pergunta",
            type: "text",
            required: true,
          },
        ],
      }),
      template.id,
    );
    expect(revised.id).not.toBe(template.id);
    expect(revised.version).toBe(2);
    expect(
      (
        await repository.listClinicalResources(clinicId, actorId, patient.id)
      ).find((item) => item.id === record.id)?.templateSnapshot?.fields[0]
        ?.label,
    ).toBe("Atividade");
    await expect(
      repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse({
          ...evolution,
          values: { atividade: ["Inválido"] },
        }),
      ),
    ).rejects.toMatchObject({ code: "ASSESSMENT_INVALID_VALUE" });
    const updated = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        ...evolution,
        templateId: revised.id,
        values: { atividade: "Resposta ao novo modelo" },
      }),
      record.id,
    );
    expect(updated.history[0]?.templateSnapshot?.fields[0]?.label).toBe(
      "Atividade",
    );
    expect(updated.templateSnapshot?.fields[0]?.label).toBe("Nova pergunta");
    const accesses = await repository.listClinicalAccessEvents(
      clinicId,
      patient.id,
    );
    const catalog = await repository.listClinicalResources(
      clinicId,
      actorId,
      undefined,
      "read",
      true,
    );
    expect(catalog.every((item) => !item.patientId)).toBe(true);
    expect(catalog.map((item) => item.id)).toContain(template.id);
    expect(catalog.map((item) => item.id)).not.toContain(record.id);
    expect(
      await repository.listClinicalAccessEvents(clinicId, patient.id),
    ).toEqual(accesses);
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "cancelled",
    );
    await expect(
      repository.saveClinicalResource(clinicId, actorId, evolution),
    ).rejects.toMatchObject({ code: "CLINICAL_CONTEXT_NOT_FOUND" });
    const preserved = await repository.saveClinicalResource(
      clinicId,
      actorId,
      updated.data,
      record.id,
    );
    expect(preserved.data).toMatchObject({
      professionalId: professional.id,
      sourceId: appointment.id,
    });
    expect(preserved.originStartsAt).toBe(appointment.startsAt);
    await repository.finalizeClinicalResource(clinicId, actorId, record.id);
    await expect(
      repository.saveClinicalResource(clinicId, actorId, evolution, record.id),
    ).rejects.toMatchObject({ code: "CLINICAL_RECORD_FINALIZED" });
  });
  it("validates exercise references and serializes training executions at the session limit", async () => {
    const { repository, patient, professional } = await setup();
    const equipment = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "equipment",
        name: "Reformer",
      }),
    );
    const exercise = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "exercise",
        name: "Mobilidade",
        equipmentId: equipment.id,
      }),
    );
    const training = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "training",
        name: "Treino inicial",
        patientId: patient.id,
        professionalId: professional.id,
        validFrom: "2039-04-01",
        validUntil: "2039-04-30",
        sessionLimit: 1,
        exercises: [{ exerciseId: exercise.id, sets: 2, repetitions: "10" }],
      }),
    );
    const input = clinicalResourceInputSchema.parse({
      kind: "training_execution",
      name: "Execução",
      patientId: patient.id,
      trainingId: training.id,
      startedAt: "2039-04-10T12:00:00Z",
    });
    const results = await Promise.allSettled([
      repository.saveClinicalResource(clinicId, actorId, input),
      repository.saveClinicalResource(clinicId, actorId, input),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.find((item) => item.status === "rejected")).toMatchObject({
      reason: { code: "TRAINING_SESSION_LIMIT" },
    });
    const other = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Outro cliente",
      phone: "11911112222",
      tags: [],
    });
    await expect(
      repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse({ ...input, patientId: other.id }),
      ),
    ).rejects.toMatchObject({ code: "TRAINING_CONTEXT_NOT_FOUND" });
  });
  it("requires the new management permission and keeps resources inside their clinic", async () => {
    const { repository, app } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Usuário clínico",
        email: "clinical-resource@test.local",
        password: "Password123",
        role: "user",
        permissions: ["clinical.view", "clinical.records_create"],
      },
      "unused-hash",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/clinical-resources",
          headers,
          payload: { kind: "equipment", name: "Aparelho" },
        })
      ).statusCode,
    ).toBe(403);
    const resources = await repository.listClinicalResources(
      "99999999-9999-4999-8999-999999999999",
      actorId,
    );
    expect(resources).toEqual([]);
  });
  it("keeps evaluation drafts out of responses and preserves published models when edited", async () => {
    const { repository, patient } = await setup(),
      input = {
        name: "Avaliação questionário",
        specialty: "Fisioterapia",
        fields: [
          {
            key: "dor",
            label: "Dor",
            type: "scale" as const,
            required: true,
            min: 0,
            max: 10,
          },
        ],
      };
    const draft = await repository.saveAssessmentTemplate(clinicId, actorId, {
      ...input,
      status: "draft",
    });
    await expect(
      repository.createClinicalAssessment(clinicId, actorId, {
        patientId: patient.id,
        templateId: draft.id,
        values: { dor: 3 },
        notes: "",
      }),
    ).rejects.toMatchObject({ code: "CLINICAL_CONTEXT_NOT_FOUND" });
    const published = await repository.saveAssessmentTemplate(
      clinicId,
      actorId,
      { ...input, status: "published" },
      draft.id,
    );
    expect(published.id).toBe(draft.id);
    const assessment = await repository.createClinicalAssessment(
      clinicId,
      actorId,
      {
        patientId: patient.id,
        templateId: published.id,
        values: { dor: 3 },
        notes: "",
      },
    );
    const next = await repository.saveAssessmentTemplate(
      clinicId,
      actorId,
      {
        ...input,
        fields: [{ ...input.fields[0]!, label: "Dor após exercício" }],
        status: "draft",
      },
      published.id,
    );
    expect(next.id).not.toBe(published.id);
    expect(next.version).toBe(published.version + 1);
    const workspace = await repository.getClinicalWorkspace(
      clinicId,
      patient.id,
      actorId,
    );
    expect(
      workspace!.assessments.find((item) => item.id === assessment.id)
        ?.templateId,
    ).toBe(published.id);
    expect(
      workspace!.templates.find((item) => item.id === published.id)?.fields[0]
        ?.label,
    ).toBe("Dor");
  });
});
