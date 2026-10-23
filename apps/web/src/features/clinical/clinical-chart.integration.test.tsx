import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open, save } from "../../test-support/workflow-ui";

// PNG 1×1 válido: o servidor confere a assinatura do arquivo.
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function clientWithHistory() {
  const { repository } = await setupApi();
  const patient = await repository.createPatient(clinicId, {
    fullName: "Helena Prontuário",
    phone: "11988887777",
    tags: [],
  });
  await repository.createPatient(clinicId, {
    fullName: "Zuleica Sem Sessão",
    phone: "11988886666",
    tags: [],
  });
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const [service] = await repository.listServices(clinicId);
  const session = (daysAgo: number) =>
    repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      visitType: "trial",
    });
  const previous = await session(7);
  const pending = await session(1);
  const record = await repository.saveClinicalRecord(clinicId, actorId, {
    appointmentId: previous.id,
    subjective: "Dor no joelho ao subir escadas.",
    objective: "Flexão de 90°.",
    assessment: "Melhora parcial.",
    plan: "Fortalecimento de quadríceps.",
    painScale: 6,
  });
  await repository.finalizeClinicalRecord(clinicId, actorId, record.id);
  const goal = await repository.createTherapeuticGoal(clinicId, actorId, {
    patientId: patient.id,
    title: "Recuperar flexão do joelho",
    baselineValue: 90,
    targetValue: 130,
    unit: "graus",
  });
  for (const [value, daysAgo] of [
    [90, 7],
    [110, 1],
  ] as const)
    await repository.createClinicalMeasurement(clinicId, actorId, {
      patientId: patient.id,
      goalId: goal.id,
      name: "Flexão do joelho",
      value,
      unit: "graus",
      measuredAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    });
  await repository.createClinicalAttachment(clinicId, actorId, {
    patientId: patient.id,
    fileName: "joelho.png",
    mimeType: "image/png",
    sizeInBytes: Buffer.from(pixel, "base64").length,
    contentBase64: pixel,
  });
  return { repository, patient, pending };
}

describe("prontuário por cliente", () => {
  it("lists clients with pending sessions and evolves one copying the last evolution", async () => {
    const { repository, patient, pending } = await clientWithHistory();
    open("/prontuarios");

    // O resumo soma as sessões pendentes de todos os clientes (inclui os da demonstração).
    expect(
      await screen.findByText(/\d+ sess(ão|ões) sem evolução/),
    ).toBeInTheDocument();
    const filters = screen.getByRole("group", { name: "Filtrar clientes" });
    fireEvent.click(
      within(filters).getByRole("button", { name: /Sem evolução/ }),
    );
    const list = screen.getByRole("region", { name: "Clientes" });
    expect(
      within(list).queryByRole("button", { name: /Zuleica/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(list).getByRole("button", { name: /Helena Prontuário/ }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Helena Prontuário",
      }),
    ).toBeInTheDocument();
    const pendencies = screen.getByRole("region", { name: "Pendências" });
    expect(within(pendencies).getByText("Sessão sem evolução")).toBeVisible();
    fireEvent.click(
      within(pendencies).getByRole("button", { name: "Evoluir" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Nova evolução clínica",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Copiar da última evolução/ }),
    );
    expect(within(dialog).getByLabelText(/S — Subjetivo/)).toHaveValue(
      "Dor no joelho ao subir escadas.",
    );
    change("P — Plano", "Progredir carga.", dialog);
    await save("Nova evolução clínica", "Salvar rascunho");

    const records = await repository.listClinicalRecords(clinicId, patient.id);
    expect(
      records.find((item) => item.appointmentId === pending.id),
    ).toMatchObject({
      status: "draft",
      subjective: "Dor no joelho ao subir escadas.",
      plan: "Progredir carga.",
    });
    const updated = await screen.findByRole("region", { name: "Pendências" });
    expect(
      await within(updated).findByText("Rascunho de evolução"),
    ).toBeInTheDocument();
    expect(
      within(updated).queryByText("Sessão sem evolução"),
    ).not.toBeInTheDocument();
  });

  it("pins and removes a clinical alert from a direct link", async () => {
    const { patient } = await clientWithHistory();
    open(`/prontuarios?cliente=${patient.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Alerta" }));
    const dialog = screen.getByRole("dialog", { name: "Novo alerta clínico" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Crítico/ }));
    change("Alerta", "Marcapasso: sem eletroterapia.", dialog);
    await save("Novo alerta clínico", "Fixar alerta");

    const alerts = screen.getByRole("list", { name: "Alertas clínicos" });
    expect(
      await within(alerts).findByText("Marcapasso: sem eletroterapia."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(alerts).getByRole("button", {
        name: "Remover alerta: Marcapasso: sem eletroterapia.",
      }),
    );
    const confirm = screen.getByRole("dialog", { name: "Remover alerta" });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Remover alerta" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Marcapasso: sem eletroterapia."),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows goal progress, the measurement chart and the image gallery", async () => {
    const { patient } = await clientWithHistory();
    open(`/prontuarios?cliente=${patient.id}`);

    fireEvent.click(await screen.findByRole("tab", { name: "Evoluções" }));
    expect(await screen.findByText("Dor 6/10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Plano e medições" }));
    expect(
      screen.getByRole("progressbar", {
        name: "Progresso de Recuperar flexão do joelho",
      }),
    ).toHaveAttribute("value", "50");
    expect(
      screen.getByRole("img", { name: /^Flexão do joelho: 90 graus/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Arquivos" }));
    const thumbnail = await screen.findByRole("button", {
      name: "Ver joelho.png",
    });
    await waitFor(() =>
      expect(thumbnail.querySelector("img")).toHaveAttribute(
        "src",
        `data:image/png;base64,${pixel}`,
      ),
    );
    fireEvent.click(thumbnail);
    const viewer = screen.getByRole("dialog", { name: "joelho.png" });
    expect(
      within(viewer).getByRole("img", { name: "joelho.png" }),
    ).toBeVisible();
  });
});
