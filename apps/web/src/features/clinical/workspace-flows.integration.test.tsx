import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  clinicalResourceInputSchema,
  type ClinicalResourceKind,
} from "@crm/contracts";
import {
  actorId,
  captureDownloads,
  clinicId,
  setupApi,
} from "../../test-support/api-server";
import { open, change, expand, save } from "../../test-support/workflow-ui";

describe("clinical resource workflows through real HTTP handlers", () => {
  it("validates questionnaire answers and preserves their published model in viewing and printing", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do questionário",
      phone: "11988887777",
      tags: [],
    });
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2040-06-01T12:00:00Z",
      visitType: "trial",
    });
    const template = await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "evolution_template",
        name: "Ficha publicada completa",
        format: "questionnaire",
        status: "published",
        fields: [
          {
            key: "secao",
            label: "Dados clínicos",
            type: "section",
            required: false,
          },
          {
            key: "curta",
            label: "Resposta curta",
            type: "text",
            required: true,
          },
          {
            key: "longa",
            label: "Resposta longa",
            type: "long_text",
            required: false,
          },
          {
            key: "numero",
            label: "Intensidade",
            type: "number",
            min: 0,
            max: 10,
            unit: "pontos",
            required: false,
          },
          {
            key: "autorizado",
            label: "Autorizado",
            type: "boolean",
            required: false,
          },
          {
            key: "escolha",
            label: "Escolha",
            type: "select",
            options: ["A", "B"],
            required: false,
          },
          {
            key: "atividades",
            label: "Atividades",
            type: "multiselect",
            options: ["Mobilidade", "Força"],
            required: false,
          },
          {
            key: "opcional",
            label: "Sem resposta",
            type: "text",
            required: false,
          },
        ],
      }),
    );
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Prontuário" }));
    fireEvent.click(
      await screen.findByRole("tab", { name: "Treinos e documentos" }),
    );
    await screen.findByText("Modelos, evoluções e treinos", { exact: true });
    const panel = expand("Modelos, evoluções e treinos");
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo registro" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo registro" });
    change("Nome", "Evolução por questionário", dialog);
    change("Atendimento", appointment.id, dialog);
    change("Modelo", template.id, dialog);
    // Resposta obrigatória do modelo em branco: Salvar desativado com o que falta (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Salvar" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Salvar" }),
    ).toHaveAccessibleDescription("Falta: Resposta curta.");
    // A API continua recusando o envio direto do formulário.
    fireEvent.submit(
      within(dialog).getByRole("button", { name: "Salvar" }).closest("form")!,
    );
    await within(dialog).findByText(/Preencha Resposta curta/);
    change("Resposta curta", "Mobilidade funcional", dialog);
    expect(
      within(dialog).getByRole("button", { name: "Salvar" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    change(
      "Resposta longa",
      "Cliente apresentou evolução clínica positiva",
      dialog,
    );
    change("Intensidade (pontos)", "5", dialog);
    change("Autorizado", "true", dialog);
    change("Escolha", "B", dialog);
    const multiple = within(dialog).getByLabelText(
      "Atividades",
    ) as HTMLSelectElement;
    for (const option of multiple.options) option.selected = true;
    fireEvent.change(multiple);
    await save("Novo registro");
    change("Data inicial", "2040-01-01", panel);
    change("Data final", "2040-12-31", panel);
    const card = (
      await within(panel).findByRole("heading", {
        name: "Evolução por questionário",
      })
    ).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Visualizar" }));
    const view = screen.getByRole("dialog");
    expect(view).toHaveTextContent(/Autorizado:\s*Sim/);
    expect(view).toHaveTextContent("Mobilidade, Força");
    expect(view).toHaveTextContent(/Intensidade:\s*5/);
    fireEvent.click(within(view).getByRole("button", { name: "Fechar" }));
    fireEvent.click(within(card).getByRole("button", { name: "Editar" }));
    const editing = screen.getByRole("dialog", { name: "Editar registro" });
    change("Autorizado", "false", editing);
    await save("Editar registro");
    fireEvent.click(within(card).getByRole("button", { name: "Visualizar" }));
    const revised = screen.getByRole("dialog");
    expect(revised).toHaveTextContent(/Autorizado:\s*Não/);
    expect(revised).toHaveTextContent("Histórico de alterações");
    fireEvent.click(within(revised).getByRole("button", { name: "Fechar" }));
    vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(
      within(panel).getByRole("button", { name: "Imprimir período" }),
    );
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    fireEvent(window, new Event("afterprint"));
    const record = (
      await repository.listClinicalResources(clinicId, actorId, patient.id)
    ).find((item) => item.name === "Evolução por questionário")!;
    expect(record.templateSnapshot?.fields).toHaveLength(8);
    expect(record.data).toMatchObject({
      kind: "evolution",
      templateId: template.id,
      values: {
        curta: "Mobilidade funcional",
        numero: 5,
        autorizado: false,
        escolha: "B",
        atividades: ["Mobilidade", "Força"],
      },
    });
    expect(record.history[0]?.data).toMatchObject({
      kind: "evolution",
      values: { autorizado: true },
    });
  });
  it("preserves the longitudinal history, validates attachments and exports the client record", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente longitudinal",
      phone: "11988887777",
      tags: [],
    });
    const goal = await repository.createTherapeuticGoal(clinicId, actorId, {
      patientId: patient.id,
      title: "Amplitude funcional",
      baselineValue: 60,
      targetValue: 90,
      unit: "graus",
    });
    await repository.createClinicalMeasurement(clinicId, actorId, {
      patientId: patient.id,
      goalId: goal.id,
      name: "Amplitude",
      value: 90,
      unit: "graus",
      measuredAt: new Date().toISOString(),
    });
    await repository.createTreatmentClosure(clinicId, actorId, {
      patientId: patient.id,
      kind: "discharge",
      summary: "Objetivos terapêuticos alcançados",
      occurredAt: new Date().toISOString(),
    });
    const downloads = captureDownloads();
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Prontuário" }));
    fireEvent.click(
      await screen.findByRole("tab", { name: "Plano e medições" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Marcar alcançado" }),
    );
    await screen.findByText("Alcançado", { exact: true });
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Anexar arquivo" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo anexo clínico" });
    // Sem arquivo, o botão diz o que falta (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Anexar arquivo" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Anexar arquivo" }),
    ).toHaveAccessibleDescription("Falta: Arquivo ou gravação de áudio.");
    fireEvent.change(within(dialog).getByLabelText("Arquivo"), {
      target: {
        files: [new File(["texto"], "arquivo.txt", { type: "text/plain" })],
      },
    });
    expect(
      within(dialog).getByRole("button", { name: "Anexar arquivo" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Anexar arquivo" })
        .closest("form")!,
    );
    await within(dialog).findByText(
      "Use PDF, PNG, JPEG, Word ou uma gravação de áudio.",
    );
    fireEvent.change(within(dialog).getByLabelText("Arquivo"), {
      target: {
        files: [
          new File(["%PDF-1.7\nAvaliação\n%%EOF"], "avaliacao.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    change("Observações", "Avaliação anexada pela equipe", dialog);
    await save("Novo anexo clínico", "Anexar arquivo");
    fireEvent.click(screen.getByRole("tab", { name: "Arquivos" }));
    expect(
      await screen.findByText("avaliacao.pdf", { exact: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.type).toBe("application/json");
    vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });
  it.each([
    "equipment",
    "exercise",
    "evolution_template",
    "evolution",
    "training",
    "training_execution",
    "clinical_document",
  ] as const)(
    "creates and reads back a %s from the client context",
    async (kind: ClinicalResourceKind) => {
      const { repository } = await setupApi();
      const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente de recursos",
        phone: "11988887777",
        tags: [],
      });
      const [professional] = await repository.listProfessionals(clinicId);
      const [room] = await repository.listRooms(clinicId);
      const [service] = await repository.listServices(clinicId);
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patient.id,
        professionalId: professional!.id,
        roomId: room!.id,
        serviceId: service!.id,
        startsAt: "2040-06-01T12:00:00Z",
        visitType: "regular",
      });
      const equipment = await repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse({
          kind: "equipment",
          name: "Reformer de referência",
          description: "Equipamento da clínica",
        }),
      );
      const exercise = await repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse({
          kind: "exercise",
          name: "Mobilidade de referência",
          equipmentId: equipment.id,
        }),
      );
      const training = await repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse({
          kind: "training",
          name: "Treino de referência",
          patientId: patient.id,
          professionalId: professional!.id,
          validFrom: "2020-01-01",
          exercises: [
            {
              exerciseId: exercise.id,
              sets: 2,
              repetitions: "10",
              restSeconds: 30,
            },
          ],
        }),
      );
      open(`/clientes/${patient.id}`);
      fireEvent.click(await screen.findByRole("tab", { name: "Prontuário" }));
      fireEvent.click(
        await screen.findByRole("tab", { name: "Treinos e documentos" }),
      );
      await screen.findByText("Modelos, evoluções e treinos", { exact: true });
      const panel = expand("Modelos, evoluções e treinos");
      await within(panel).findByRole("button", { name: "Novo registro" });
      change("Seção", kind, panel);
      fireEvent.click(
        within(panel).getByRole("button", { name: "Novo registro" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Novo registro" });
      const name = `Registro validado ${kind}`;
      change("Nome", name, dialog);
      if (kind === "equipment" || kind === "exercise")
        change("Descrição", "Descrição clínica preservada", dialog);
      if (kind === "exercise") {
        change("Aparelho", equipment.id, dialog);
        change("Vídeo", "https://example.com/exercicio", dialog);
      }
      if (kind === "evolution_template") {
        change("Conteúdo do modelo", "Texto clínico padronizado", dialog);
        change("Situação", "published", dialog);
      }
      if (kind === "evolution") {
        change("Atendimento", appointment.id, dialog);
        change("Formato", "soap", dialog);
        for (const label of ["Subjetivo", "Objetivo", "Avaliação", "Plano"])
          change(label, `Conteúdo ${label}`, dialog);
        fireEvent.click(within(dialog).getByLabelText(equipment.name));
        fireEvent.click(within(dialog).getByLabelText(exercise.name));
      }
      if (kind === "training") {
        change("Adicionar exercício", exercise.id, dialog);
        change("Séries", "3", dialog);
        change("Repetições", "12", dialog);
        change("Pausa entre séries, segundos", "45", dialog);
        change("Observações", "Treino assistido", dialog);
      }
      if (kind === "training_execution") {
        change("Treino", training.id, dialog);
        change("Observações", "Execução supervisionada", dialog);
        fireEvent.click(within(dialog).getByLabelText("Execução concluída"));
      }
      if (kind === "clinical_document") {
        change("Tipo", "prescription", dialog);
        change(
          "Conteúdo",
          "Orientação clínica registrada pela equipe.",
          dialog,
        );
      }
      await save("Novo registro");
      change("Data inicial", "2000-01-01", panel);
      change("Data final", "2099-12-31", panel);
      const record = (
        await repository.listClinicalResources(clinicId, actorId, patient.id)
      ).find((item) => item.name === name);
      expect(record?.data.kind).toBe(kind);
      const card = (
        await within(panel).findByRole("heading", { name })
      ).closest("article")!;
      fireEvent.click(within(card).getByRole("button", { name: "Visualizar" }));
      expect(screen.getByRole("dialog")).toHaveTextContent(name);
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Fechar",
        }),
      );
      if (kind === "evolution" || kind === "clinical_document") {
        fireEvent.click(
          within(card).getByRole("button", { name: "Finalizar" }),
        );
        await save("Finalizar registro clínico", "Confirmar finalização");
        expect(
          within(card).queryByRole("button", { name: "Editar" }),
        ).not.toBeInTheDocument();
      }
      if (kind === "equipment" || kind === "exercise") {
        fireEvent.click(within(card).getByRole("button", { name: "Editar" }));
        const editing = screen.getByRole("dialog", { name: "Editar registro" });
        fireEvent.click(within(editing).getByLabelText("Ativo"));
        await save("Editar registro");
        expect(
          (
            await repository.listClinicalResources(
              clinicId,
              actorId,
              patient.id,
            )
          ).find((item) => item.id === record!.id)?.status,
        ).toBe("inactive");
      }
      if (kind === "training") {
        fireEvent.click(
          within(card).getByRole("button", { name: "Copiar treino" }),
        );
        const copy = screen.getByRole("dialog", { name: "Copiar treino" });
        change("Nome", "Treino copiado independente", copy);
        await save("Copiar treino");
        const copied = (
          await repository.listClinicalResources(clinicId, actorId, patient.id)
        ).find((item) => item.name === "Treino copiado independente");
        expect(copied?.id).not.toBe(record!.id);
        expect(copied?.data).toMatchObject({
          kind: "training",
          exercises: [{ sets: 3, repetitions: "12", restSeconds: 45 }],
        });
      }
    },
  );
});
