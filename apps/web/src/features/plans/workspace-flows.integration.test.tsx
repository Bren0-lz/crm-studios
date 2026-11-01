import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saoPauloToday } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change } from "../../test-support/workflow-ui";

describe("integrated plan purchase", () => {
  it("creates one plan, invoice, group enrollment and issued contract and records attendance", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente da contratação",
      phone: "11988887777",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const group = await repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 1,
      // Fora dos horários dos atendimentos demo de hoje (06:00 a 14:00 conforme o fuso).
      weeklySlots: [{ weekday: 0, startTime: "20:00", endTime: "21:00" }],
    });
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Contratação integrada",
      kind: "fixed_package",
      totalValueInCents: 20000,
      services: [
        { serviceId: service!.id, totalSessions: 4, totalValueInCents: 20000 },
      ],
    });
    const document = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato da contratação",
      kind: "contract",
      body: "Contrato de {{paciente_nome}} com {{plano_servicos}}.",
    });
    const view = open(`/planos?patientId=${patient.id}`);
    await screen.findByText("Nenhum plano cadastrado", { exact: true });
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog", { name: "Novo plano" });
    await within(dialog).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Plano cadastrado", template.id, dialog);
    change("Parcelas", "1", dialog);
    change("Primeiro vencimento", saoPauloToday(), dialog);
    // O serviço tem turma: plano de aulas em grupo só é criado com a turma escolhida.
    const turma = await within(dialog).findByLabelText("Turma");
    await within(turma).findByRole("option", { name: new RegExp(group.name) });
    expect(turma).toBeRequired();
    expect(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeDisabled();
    change("Turma", group.id, dialog);
    expect(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeEnabled();
    // O documento para assinatura fica à vista no formulário, fora do bloco recolhido.
    const signature = within(dialog).getByLabelText(
      "Documento para o cliente assinar",
    );
    await within(signature).findByRole("option", {
      name: new RegExp(document.name),
    });
    change("Documento para o cliente assinar", document.id, dialog);
    // Turma com horários fixos: a seção de horários já abre preenchida com eles.
    const fixed = await within(dialog).findByRole("region", {
      name: `Horários fixos da turma ${group.name}`,
    });
    expect(fixed).toHaveTextContent("Domingo");
    expect(fixed).toHaveTextContent(
      `20:00 às 21:00 · ${professional!.fullName}`,
    );
    expect(
      screen
        .getByText("Horários da contratação", { exact: true })
        .closest("details"),
    ).toHaveAttribute("open");
    fireEvent.click(
      await within(dialog).findByRole("button", {
        name: "Adicionar horários à contratação",
      }),
    );
    const nested = screen.getByRole("dialog", {
      name: "Horários da contratação",
    });
    expect(within(nested).getByText(patient.fullName)).toBeInTheDocument();
    // Pacote fixo: os horários já abrem em dias fixos na semana até acabar as sessões.
    expect(
      within(nested).getByLabelText("Repetir este atendimento"),
    ).toBeChecked();
    expect(within(nested).getByLabelText("Intervalo")).toHaveValue("package");
    expect(
      within(nested).getByRole("heading", { name: "Dias e horários fixos" }),
    ).toBeInTheDocument();
    fireEvent.click(within(nested).getByRole("button", { name: "Voltar" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    // Plano salvo: o mesmo modal mostra o link pronto para o WhatsApp do cliente.
    const whatsapp = await within(dialog).findByRole("link", {
      name: "Abrir WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5511988887777");
    expect(
      within(dialog).getByLabelText<HTMLInputElement>("Link de assinatura")
        .value,
    ).toMatch(/\/assinar-contrato\/[A-Za-z0-9_-]{43}$/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo plano" }),
      ).not.toBeInTheDocument(),
    );
    const plans = (await repository.listPatientPlans(clinicId)).filter(
      (item) => item.patientId === patient.id,
    );
    expect(plans).toHaveLength(1);
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables.filter(
        (item) => item.patientId === patient.id,
      ),
    ).toHaveLength(1);
    expect(
      (await repository.listIssuedDocuments(clinicId)).find(
        (item) => item.patientId === patient.id,
      ),
    ).toMatchObject({
      status: "issued",
      planId: plans[0]!.id,
      title: document.name,
      signatureLink: { viewCount: 0 },
    });
    const from = new Date().toISOString(),
      to = new Date(Date.now() + 14 * 86400000).toISOString();
    const workspace = await repository.getGroupWorkspace(clinicId, from, to);
    expect(workspace.enrollments).toMatchObject([
      { patientId: patient.id, groupId: group.id, status: "active" },
    ]);
    const session = workspace.sessions.find(
      (item) => item.groupId === group.id,
    )!;
    view.unmount();
    open(`/turmas?patientId=${patient.id}&sessionId=${session.id}`);
    const meeting = await screen.findByRole("dialog");
    change(`Frequência de ${patient.fullName}`, "present", meeting);
    await waitFor(() =>
      expect(
        within(meeting).getByLabelText(`Frequência de ${patient.fullName}`),
      ).toHaveValue("present"),
    );
    expect(
      (await repository.listPatientPlans(clinicId)).find(
        (item) => item.id === plans[0]!.id,
      )?.remainingSessions,
    ).toBe(3);
    change(`Frequência de ${patient.fullName}`, "excused_absence", meeting);
    await waitFor(() =>
      expect(
        within(meeting).getByLabelText(`Frequência de ${patient.fullName}`),
      ).toHaveValue("excused_absence"),
    );
    expect(
      (await repository.listPatientPlans(clinicId)).find(
        (item) => item.id === plans[0]!.id,
      )?.remainingSessions,
    ).toBe(4);
  });
});
