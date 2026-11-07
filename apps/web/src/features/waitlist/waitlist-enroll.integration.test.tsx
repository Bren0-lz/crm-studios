import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saoPauloToday, waitlistDesiredGroupNote } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

/** Cliente na Lista de espera de um serviço com turma (TW3). */
async function seed(capacity: number) {
  const { repository } = await setupApi();
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Dora Espera",
    phone: "11988887777",
    tags: [],
  });
  const [service] = await repository.listServices(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const room = (await repository.listRooms(clinicId)).find(
    (item) => item.capacity >= capacity,
  );
  const group = await repository.createGroupClass(clinicId, {
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity,
    // Fora dos horários dos atendimentos demo.
    weeklySlots: [{ weekday: 0, startTime: "20:00", endTime: "21:00" }],
  });
  const template = await repository.createPlanTemplate(clinicId, actorId, {
    name: "Plano da espera",
    kind: "fixed_package",
    totalValueInCents: 20000,
    services: [
      { serviceId: service!.id, totalSessions: 4, totalValueInCents: 20000 },
    ],
  });
  const entry = await repository.createWaitlistEntry(clinicId, actorId, {
    patientId: patient.id,
    kind: "service",
    serviceId: service!.id,
    productId: null,
    notes: waitlistDesiredGroupNote(group.name),
  });
  return { repository, patient, service: service!, group, template, entry };
}

async function openEntry(name: string) {
  open("/lista-de-espera");
  const list = await screen.findByRole("region", {
    name: "Clientes na lista de espera",
  });
  fireEvent.click(
    await within(list).findByRole("button", {
      name: `Abrir entrada de ${name}`,
    }),
  );
  return screen.findByRole("dialog", { name: name });
}

describe("matrícula pela Lista de espera (TW3)", () => {
  it("matricula numa turma com vaga, cria o plano com contrato e marca a entrada como atendida", async () => {
    const { repository, patient, group, template, entry } = await seed(2);
    const document = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato da espera",
      kind: "contract",
      body: "Contrato de {{paciente_nome}}.",
    });
    const dialog = await openEntry(patient.fullName);
    const section = within(dialog).getByRole("group", {
      name: "Matricular em turma",
    });
    // A turma desejada (observações) já vem escolhida.
    const turma = await within(section).findByLabelText("Turma com vaga");
    expect(turma).toHaveValue(group.id);
    expect(
      within(section).getByRole("region", {
        name: `Detalhes da turma ${group.name}`,
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Matricular e configurar pagamento",
      }),
    );
    const planDialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    await within(planDialog).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Plano cadastrado", template.id, planDialog);
    // A turma da espera entra escolhida assim que o plano cobre o serviço dela.
    await waitFor(() =>
      expect(within(planDialog).getByLabelText("Turma")).toHaveValue(group.id),
    );
    change("Parcelas", "1", planDialog);
    change("Primeiro vencimento", saoPauloToday(), planDialog);
    const signature = within(planDialog).getByLabelText(
      "Documento para o cliente assinar",
    );
    await within(signature).findByRole("option", {
      name: new RegExp(document.name),
    });
    change("Documento para o cliente assinar", document.id, planDialog);
    fireEvent.click(
      within(planDialog).getByRole("button", {
        name: "Criar plano e parcelas",
      }),
    );
    // Plano salvo: o link de assinatura vai para o WhatsApp do cliente.
    const whatsapp = await within(planDialog).findByRole("link", {
      name: "Abrir WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5511988887777");
    fireEvent.click(
      within(planDialog).getByRole("button", { name: "Concluir" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: patient.fullName }),
      ).not.toBeInTheDocument(),
    );
    expect(
      (await repository.listWaitlist(clinicId)).find(
        (item) => item.id === entry.id,
      )?.status,
    ).toBe("served");
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-01-02T00:00:00Z",
    );
    expect(
      workspace.enrollments.find((item) => item.patientId === patient.id),
    ).toMatchObject({ groupId: group.id, status: "active" });
    const plans = (await repository.listPatientPlans(clinicId)).filter(
      (item) => item.patientId === patient.id,
    );
    expect(plans).toHaveLength(1);
    expect(
      (await repository.listIssuedDocuments(clinicId)).find(
        (item) => item.patientId === patient.id,
      ),
    ).toMatchObject({ status: "issued", planId: plans[0]!.id });
  });

  it("avisa quando nenhuma turma do serviço tem vaga", async () => {
    const { repository, patient, service, group } = await seed(1);
    const other = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Ocupa Vaga",
      phone: "11977776666",
      tags: [],
    });
    await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: other.id,
    });
    const dialog = await openEntry(patient.fullName);
    expect(
      await within(dialog).findByText(
        `Nenhuma turma de ${service.name} com vaga no momento.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: "Matricular e configurar pagamento",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("Novo plano com turma cheia (TW3)", () => {
  it("coloca o cliente na Lista de espera sem plano, cobrança nem contrato", async () => {
    const { repository, patient, service, group, template, entry } =
      await seed(1);
    // Turma cheia; a entrada da semente sai para o cliente voltar à fila pelo plano.
    await repository.deleteWaitlistEntry(clinicId, entry.id);
    const other = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Ocupa Vaga",
      phone: "11977776666",
      tags: [],
    });
    await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: other.id,
    });
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    const panel = screen.getByRole("tabpanel");
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Plano recorrente" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    await within(dialog).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Plano cadastrado", template.id, dialog);
    const turma = await within(dialog).findByLabelText("Turma");
    await within(turma).findByRole("option", { name: new RegExp(group.name) });
    change("Turma", group.id, dialog);
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, colocar na lista de espera" }),
    );
    // Sem venda: somem pagamento, vencimento e contrato.
    expect(
      await within(dialog).findByText(/^Turma cheia: o plano não é vendido/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Primeiro vencimento"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Documento para o cliente assinar"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Colocar na lista de espera",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo plano recorrente" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(
        `Turma cheia: Dora entrou na Lista de espera de ${service.name}, sem plano nem cobrança.`,
      ),
    ).toBeInTheDocument();
    expect(
      (await repository.listWaitlist(clinicId)).filter(
        (item) => item.patientId === patient.id,
      ),
    ).toEqual([
      expect.objectContaining({
        serviceId: service.id,
        status: "waiting",
        notes: waitlistDesiredGroupNote(group.name),
      }),
    ]);
    expect(
      (await repository.listPatientPlans(clinicId)).filter(
        (item) => item.patientId === patient.id,
      ),
    ).toEqual([]);
  });
});
