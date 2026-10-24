import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saoPauloToday } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change, expand, save } from "../../test-support/workflow-ui";

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
      weeklySlots: [{ weekday: 0, startTime: "06:00", endTime: "07:00" }],
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
    const panel = expand("Agenda, turma e contrato da contratação");
    await within(panel).findByRole("option", {
      name: new RegExp(document.name),
    });
    change("Turma", group.id, dialog);
    change("Modelo de contrato ou termo", document.id, dialog);
    change(
      "Título do documento da contratação",
      "Contrato integrado emitido",
      dialog,
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Adicionar horários à contratação",
      }),
    );
    const nested = screen.getByRole("dialog", {
      name: "Horários da contratação",
    });
    expect(within(nested).getByText(patient.fullName)).toBeInTheDocument();
    fireEvent.click(within(nested).getByRole("button", { name: "Voltar" }));
    await save("Novo plano", "Criar plano e parcelas");
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
      title: "Contrato integrado emitido",
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
