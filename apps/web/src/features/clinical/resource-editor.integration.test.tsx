import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  clinicalResourceInputSchema,
  type ClinicalResourceKind,
  type ClinicalResource,
} from "@crm/contracts";
import { AuthorizationProvider } from "../../authorization";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { ClinicalResourceEditor } from "./ClinicalResourceEditor";

async function setup(kind: ClinicalResourceKind, resource?: ClinicalResource) {
  const { repository } = await setupApi();
  const [patient] = await repository.listPatients(clinicId);
  const professionals = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const [service] = await repository.listServices(clinicId);
  const appointment = await repository.createAppointment(clinicId, {
    patientId: patient!.id,
    professionalId: professionals[0]!.id,
    roomId: room!.id,
    serviceId: service!.id,
    startsAt: "2040-06-01T12:00:00Z",
    visitType: "trial",
  });
  const saved = vi.fn(async () => {}),
    closed = vi.fn();
  function show(
    resources: ClinicalResource[] = [],
    muscleGroups: Awaited<ReturnType<typeof repository.listClinicCatalog>> = [],
    editing = resource,
  ) {
    render(
      <AuthorizationProvider>
        <MemoryRouter>
          <ClinicalResourceEditor
            kind={kind}
            resource={editing}
            patientId={patient!.id}
            patients={[patient!]}
            professionals={professionals}
            resources={resources}
            sources={[]}
            muscleGroups={muscleGroups}
            onSaved={saved}
            onClose={closed}
          />
        </MemoryRouter>
      </AuthorizationProvider>,
    );
  }
  return {
    repository,
    patient: patient!,
    professionals,
    appointment,
    saved,
    closed,
    show,
  };
}
function change(
  label: string,
  value: string,
  scope: HTMLElement = document.body,
) {
  fireEvent.change(within(scope).getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
async function submit(saved: ReturnType<typeof vi.fn>) {
  fireEvent.submit(
    screen.getByRole("button", { name: "Salvar" }).closest("form")!,
  );
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
}

describe("clinical editor with the real API", () => {
  it("edits a workout with an inactive historical exercise, preserving its prescription and order", async () => {
    const { repository, patient, professionals, show, saved } =
      await setup("training");
    const exercises = await Promise.all(
      ["Mobilidade histórica", "Força atual"].map((name) =>
        repository.saveClinicalResource(
          clinicId,
          actorId,
          clinicalResourceInputSchema.parse({ kind: "exercise", name }),
        ),
      ),
    );
    const training = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "training",
        name: "Prescrição em revisão",
        patientId: patient.id,
        professionalId: professionals[0]!.id,
        validFrom: "2040-06-01",
        exercises: exercises.map((item) => ({
          exerciseId: item.id,
          sets: 1,
          repetitions: "10",
          restSeconds: 0,
          notes: "",
        })),
      }),
    );
    const inactive = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        ...exercises[0]!.data,
        active: false,
      }),
      exercises[0]!.id,
    );
    show([inactive, exercises[1]!], [], training);
    expect(
      screen.getByRole("group", { name: inactive.name }),
    ).toBeInTheDocument();
    change("Início", "2040-06-02");
    change("Fim", "2040-07-02");
    change("Limite de execuções", "3");
    change("Limite de execuções", "");
    change("Limite de execuções", "4");
    const first = screen.getByRole("group", { name: inactive.name });
    change("Séries", "3", first);
    change("Repetições", "12", first);
    change("Pausa entre séries, segundos", "30", first);
    change("Observações do exercício", "Executar com assistência", first);
    fireEvent.click(
      within(first).getByRole("button", { name: "Mover exercício para baixo" }),
    );
    fireEvent.click(
      within(first).getByRole("button", { name: "Mover exercício para cima" }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: exercises[1]!.name })).getByRole(
        "button",
        { name: "Remover exercício" },
      ),
    );
    change("Adicionar exercício", exercises[1]!.id);
    change("Observações", "Plano revisado com segurança");
    await submit(saved);
    const revised = (
      await repository.listClinicalResources(clinicId, actorId, patient.id)
    ).find((item) => item.id === training.id)!;
    expect(revised.data).toMatchObject({
      kind: "training",
      validFrom: "2040-06-02",
      validUntil: "2040-07-02",
      sessionLimit: 4,
      exercises: [
        {
          exerciseId: inactive.id,
          sets: 3,
          repetitions: "12",
          restSeconds: 30,
          notes: "Executar com assistência",
        },
        { exerciseId: exercises[1]!.id, sets: 1 },
      ],
    });
    expect(revised.history).toHaveLength(1);
  });
  it("applies SOAP defaults and updates the equipment and exercise references on an evolution", async () => {
    const { repository, patient, professionals, appointment, show, saved } =
      await setup("evolution");
    const equipment = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "equipment",
        name: "Aparelho histórico",
      }),
    );
    const exercise = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "exercise",
        name: "Exercício histórico",
      }),
    );
    const template = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "evolution_template",
        name: "SOAP publicado",
        status: "published",
        format: "soap",
        soap: {
          subjective: "Relato inicial",
          objective: "Avaliação objetiva",
          assessment: "Hipótese funcional",
          plan: "Plano inicial",
        },
      }),
    );
    const evolution = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "evolution",
        name: "Evolução em revisão",
        patientId: patient.id,
        professionalId: professionals[0]!.id,
        sourceType: "appointment",
        sourceId: appointment.id,
        format: "text",
        body: "Registro inicial",
        equipmentIds: [equipment.id],
        exerciseIds: [exercise.id],
      }),
    );
    const inactiveEquipment = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({ ...equipment.data, active: false }),
      equipment.id,
    );
    const inactiveExercise = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({ ...exercise.data, active: false }),
      exercise.id,
    );
    show([inactiveEquipment, inactiveExercise, template], [], evolution);
    change("Modelo", template.id);
    expect(screen.getByLabelText("Subjetivo")).toHaveValue("Relato inicial");
    for (const label of ["Subjetivo", "Objetivo", "Avaliação", "Plano"])
      change(label, `Revisado ${label}`);
    for (const label of [equipment.name, exercise.name]) {
      fireEvent.click(screen.getByLabelText(label));
      fireEvent.click(screen.getByLabelText(label));
    }
    await submit(saved);
    expect(
      (
        await repository.listClinicalResources(clinicId, actorId, patient.id)
      ).find((item) => item.id === evolution.id)?.data,
    ).toMatchObject({
      format: "soap",
      subjective: "Revisado Subjetivo",
      templateId: template.id,
      equipmentIds: [equipment.id],
      exerciseIds: [exercise.id],
    });
  });
  it("builds and publishes an ordered questionnaire with required choices and bounded numbers", async () => {
    const { repository, show, saved } = await setup("evolution_template");
    show();
    change("Nome", "Ficha clínica publicada");
    change("Formato", "questionnaire");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar campo" }));
    let group = screen.getByRole("group", { name: "Campo 1" });
    change("Pergunta ou título", "Atividade", group);
    change("Tipo", "select", group);
    change("Opções, uma por linha", "Mobilidade\nForça", group);
    fireEvent.click(within(group).getByLabelText("Obrigatório"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar campo" }));
    group = screen.getByRole("group", { name: "Campo 2" });
    change("Pergunta ou título", "Dor", group);
    change("Tipo", "scale", group);
    change("Unidade", "pontos", group);
    change("Mínimo", "0", group);
    change("Máximo", "10", group);
    fireEvent.click(
      within(group).getByRole("button", { name: "Mover para cima" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar campo" }));
    group = screen.getByRole("group", { name: "Campo 3" });
    change("Pergunta ou título", "Campo descartado", group);
    fireEvent.click(
      within(group).getByRole("button", { name: "Remover campo" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pré-visualizar ficha" }),
    );
    expect(screen.getByLabelText("Dor (pontos)")).toBeDisabled();
    change("Situação", "published");
    await submit(saved);
    const record = (
      await repository.listClinicalResources(clinicId, actorId)
    ).find((item) => item.name === "Ficha clínica publicada")!;
    expect(record).toMatchObject({
      status: "published",
      data: {
        kind: "evolution_template",
        format: "questionnaire",
        fields: [
          { key: "campo_2", label: "Dor", type: "scale", min: 0, max: 10 },
          {
            key: "campo_1",
            label: "Atividade",
            type: "select",
            required: true,
            options: ["Mobilidade", "Força"],
          },
        ],
      },
    });
  });

  it("publishes SOAP defaults in a reusable model", async () => {
    const { repository, show, saved } = await setup("evolution_template");
    show();
    change("Nome", "Modelo SOAP assistido");
    change("Formato", "soap");
    for (const label of ["Subjetivo", "Objetivo", "Avaliação", "Plano"])
      change(label, `Orientação ${label}`);
    change("Situação", "published");
    await submit(saved);
    expect(
      (await repository.listClinicalResources(clinicId, actorId)).find(
        (item) => item.name === "Modelo SOAP assistido",
      )?.data,
    ).toMatchObject({
      kind: "evolution_template",
      format: "soap",
      soap: {
        subjective: "Orientação Subjetivo",
        objective: "Orientação Objetivo",
        assessment: "Orientação Avaliação",
        plan: "Orientação Plano",
      },
    });
  });

  it("rejects an unsupported image and saves an exercise with its equipment and muscle group", async () => {
    const { repository, show, saved } = await setup("exercise");
    const equipment = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "equipment",
        name: "Aparelho principal",
      }),
    );
    const muscle = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "muscle_group",
      { name: "Membros inferiores", active: true },
    );
    show([equipment], [muscle!]);
    change("Nome", "Mobilidade orientada");
    change("Aparelho", equipment.id);
    change("Grupo muscular", muscle!.id);
    change("Nível", "Intermediário");
    change("Descrição", "Exercício acompanhado pela equipe");
    change("Vídeo", "https://example.com/exercicio");
    fireEvent.change(screen.getByLabelText("Imagem"), {
      target: {
        files: [new File(["texto"], "imagem.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("Use uma imagem PNG ou JPEG de até 5 MB.");
    const image = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      ),
      (char) => char.charCodeAt(0),
    );
    fireEvent.change(screen.getByLabelText("Imagem"), {
      target: {
        files: [new File([image], "imagem.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled(),
    );
    await submit(saved);
    expect(
      (await repository.listClinicalResources(clinicId, actorId)).find(
        (item) => item.name === "Mobilidade orientada",
      )?.data,
    ).toMatchObject({
      kind: "exercise",
      equipmentId: equipment.id,
      muscleGroupId: muscle!.id,
      level: "Intermediário",
      image: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });
});
