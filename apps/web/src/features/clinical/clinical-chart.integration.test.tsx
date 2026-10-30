import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
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
    cpf: nextTestCpf(),
    fullName: "Helena Prontuário",
    phone: "11988887777",
    tags: [],
  });
  await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
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
  return { repository, patient };
}

describe("prontuário por cliente", () => {
  it("searches clients and opens a chart without evolutions or pending sessions", async () => {
    await clientWithHistory();
    open("/prontuarios");

    const list = await screen.findByRole("region", { name: "Clientes" });
    fireEvent.change(within(list).getByLabelText("Buscar cliente"), {
      target: { value: "helena prontuario" },
    });
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
    expect(screen.getByText(/0 avaliações/)).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Pendências" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Evoluções/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Evoluir|Nova evolução/ }),
    ).not.toBeInTheDocument();
    // A evolução antiga continua guardada, mas não aparece na linha do tempo.
    const timeline = screen.getByRole("tabpanel", { name: "Linha do tempo" });
    expect(
      within(timeline).getByText(/Flexão do joelho: 110 graus/),
    ).toBeVisible();
    expect(
      within(timeline).queryByText("Melhora parcial."),
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

    fireEvent.click(
      await screen.findByRole("tab", { name: "Plano e medições" }),
    );
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
