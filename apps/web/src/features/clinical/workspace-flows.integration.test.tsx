import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clinicalResourceInputSchema } from "@crm/contracts";
import {
  actorId,
  captureDownloads,
  clinicId,
  setupApi,
} from "../../test-support/api-server";
import { open, change, expand, save } from "../../test-support/workflow-ui";
import type { EditableResourceKind } from "./ClinicalResourceEditor";

describe("clinical resource workflows through real HTTP handlers", () => {
  it("offers no evolution sections, even when legacy evolutions exist", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente sem evolução",
      phone: "11988887777",
      tags: [],
    });
    await repository.saveClinicalResource(
      clinicId,
      actorId,
      clinicalResourceInputSchema.parse({
        kind: "evolution_template",
        name: "Modelo antigo de evolução",
        format: "text",
        status: "published",
        body: "Texto antigo",
      }),
    );
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Prontuário" }));
    fireEvent.click(
      await screen.findByRole("tab", { name: "Treinos e documentos" }),
    );
    await screen.findByText("Treinos, relatórios e prescrições", {
      exact: true,
    });
    const panel = expand("Treinos, relatórios e prescrições");
    await within(panel).findByRole("button", { name: "Novo registro" });
    const sections = within(panel)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(sections).toEqual([
      "Aparelhos",
      "Exercícios e procedimentos",
      "Treinos",
      "Treinos executados",
      "Relatórios e prescrições",
    ]);
    expect(
      within(panel).queryByText("Modelo antigo de evolução"),
    ).not.toBeInTheDocument();
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
    "training",
    "training_execution",
    "clinical_document",
  ] as const)(
    "creates and reads back a %s from the client context",
    async (kind: EditableResourceKind) => {
      const { repository } = await setupApi();
      const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente de recursos",
        phone: "11988887777",
        tags: [],
      });
      const [professional] = await repository.listProfessionals(clinicId);
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
      await screen.findByText("Treinos, relatórios e prescrições", {
        exact: true,
      });
      const panel = expand("Treinos, relatórios e prescrições");
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
      if (kind === "clinical_document") {
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
