import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  patientInputSchema,
  saoPauloToday,
  type PatientPlanInput,
} from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { fillAppointmentForm } from "../../test-support/legacy-fixtures";
import { change, open } from "../../test-support/workflow-ui";

/** Agendar exige plano (AP4): campo "Plano", venda do avulso e experimental. */
async function scenario() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: "Paula Plano",
      phone: "11999994444",
      whatsapp: "11999994444",
      emergencyContactName: "Paula Plano",
      emergencyContactPhone: "11999994444",
    }),
  );
  const services = await api.repository.listServices(clinicId);
  async function plan(
    name: string,
    validUntil: string,
    only?: (typeof services)[number],
  ) {
    const items = (only ? [only] : services).map((service) => ({
      serviceId: service.id,
      totalSessions: 4,
      totalValueInCents: 20000,
    }));
    const template = await api.repository.createPlanTemplate(
      clinicId,
      actorId,
      { name, totalValueInCents: items.length * 20000, services: items },
    );
    const input: PatientPlanInput = {
      patientId: patient.id,
      planTemplateId: template.id,
      name,
      kind: "fixed_package",
      services: items,
      totalValueInCents: template.totalValueInCents,
      installments: 1,
      validFrom: "2020-01-01",
      validUntil,
      firstDueDate: "2020-01-01",
    };
    return api.repository.createPatientPlan(clinicId, actorId, input);
  }
  async function openBooking() {
    open("/agenda");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    await fillAppointmentForm(dialog, patient.fullName);
    // Fora dos atendimentos demo de hoje.
    change("Horário", "19:00", dialog);
    return dialog;
  }
  async function booked() {
    let found:
      | Awaited<ReturnType<typeof api.repository.listAppointments>>[number]
      | undefined;
    await waitFor(async () => {
      found = (
        await api.repository.listAppointments(
          clinicId,
          new Date(Date.now() - 30 * 86_400_000).toISOString(),
          new Date(Date.now() + 30 * 86_400_000).toISOString(),
        )
      ).find((item) => item.patientId === patient.id);
      expect(found).toBeDefined();
    });
    return found!;
  }
  function confirm(dialog: HTMLElement) {
    return within(dialog).getByRole("button", {
      name: "Confirmar atendimento",
    });
  }
  return { ...api, patient, services, plan, openBooking, booked, confirm };
}

describe("agendamento com plano (AP4)", () => {
  it("sugere o plano que vence antes e agenda no plano escolhido", async () => {
    const { plan, openBooking, booked, confirm } = await scenario();
    const first = await plan("Pacote que vence antes", "2040-01-31");
    const later = await plan("Pacote que vence depois", "2045-12-31");
    const dialog = await openBooking();
    const field = await within(dialog).findByLabelText("Plano");
    await waitFor(() => expect(field).toHaveValue(first.id));
    expect(
      within(field)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Pacote que vence antes · 4 sessões",
      "Pacote que vence depois · 4 sessões",
    ]);
    fireEvent.change(field, { target: { value: later.id } });
    await waitFor(() => expect(confirm(dialog)).toBeEnabled());
    fireEvent.click(confirm(dialog));
    expect((await booked()).planId).toBe(later.id);
  });

  it("vende o plano avulso do serviço no agendamento e já seleciona o plano novo", async () => {
    const { repository, patient, services, openBooking, booked, confirm } =
      await scenario();
    for (const service of services)
      await repository.createPlanTemplate(clinicId, actorId, {
        name: `${service.name} (avulso)`,
        kind: "single",
        totalValueInCents: 15000,
        services: [
          { serviceId: service.id, totalSessions: 1, totalValueInCents: 15000 },
        ],
      });
    const dialog = await openBooking();
    expect(
      await within(dialog).findByText("Cliente sem plano para este serviço"),
    ).toBeInTheDocument();
    // Sem plano, o "Serviço" está no modo "Vender plano avulso…": todos, com o preço.
    const serviceField = within(dialog).getByLabelText("Serviço");
    expect(
      within(serviceField).getByRole("option", {
        name: "Voltar aos serviços dos planos",
      }),
    ).toBeInTheDocument();
    expect(
      within(serviceField)
        .getAllByRole("option")
        .some((option) => option.textContent?.includes("R$")),
    ).toBe(true);
    // Sem plano, "Confirmar" fica desativado dizendo o que falta.
    expect(confirm(dialog)).toBeDisabled();
    expect(confirm(dialog)).toHaveAccessibleDescription("Falta: Plano.");
    const serviceId = (
      within(dialog).getByLabelText("Serviço") as HTMLSelectElement
    ).value;
    const serviceName = services.find((item) => item.id === serviceId)!.name;

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Vender plano avulso" }),
    );
    const sale = await screen.findByRole("dialog", {
      name: "Novo plano avulso",
    });
    // Já vem com o plano avulso do serviço escolhido.
    const catalog = await within(sale).findByLabelText("Plano cadastrado");
    await waitFor(() =>
      expect(
        within(catalog)
          .getByRole("option", { selected: true })
          .textContent?.startsWith(`${serviceName} (avulso)`),
      ).toBe(true),
    );
    // A contratação vinda do agendamento não marca sessões: o atendimento é este.
    expect(
      within(sale).queryByText("Horários da contratação"),
    ).not.toBeInTheDocument();
    change("Parcelas", "1", sale);
    change("Primeiro vencimento", saoPauloToday(), sale);
    fireEvent.click(
      within(sale).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo plano avulso" }),
      ).not.toBeInTheDocument(),
    );

    const [sold] = await repository.listPatientPlans(clinicId, patient.id);
    expect(sold).toMatchObject({
      kind: "single",
      name: `${serviceName} (avulso)`,
    });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Plano")).toHaveValue(sold!.id),
    );
    // Vendido o avulso, o serviço passa a constar dos planos do cliente.
    await waitFor(() =>
      expect(
        within(serviceField)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Selecione", serviceName, "Vender plano avulso…"]),
    );
    expect(serviceField).toHaveValue(serviceId);
    await waitFor(() => expect(confirm(dialog)).toBeEnabled());
    fireEvent.click(confirm(dialog));
    expect((await booked()).planId).toBe(sold!.id);
  });

  it("sem plano avulso cadastrado, orienta a criar em Configurações › Planos", async () => {
    const { openBooking, confirm } = await scenario();
    const dialog = await openBooking();
    expect(
      await within(dialog).findByText(
        /cadastre o plano avulso do serviço em Configurações › Planos/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Vender plano avulso" }),
    ).not.toBeInTheDocument();
    expect(confirm(dialog)).toBeDisabled();
  });

  it("lista só os serviços dos planos do cliente e a venda do avulso (AP7)", async () => {
    const { plan, services, openBooking, booked, confirm } = await scenario();
    const covered = services[1]!;
    const contracted = await plan(
      "Pacote de um serviço",
      "2045-12-31",
      covered,
    );
    const dialog = await openBooking();
    const serviceField = within(dialog).getByLabelText("Serviço");
    // Sem preço: o valor sai do plano.
    expect(
      within(serviceField)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Selecione", covered.name, "Vender plano avulso…"]);
    expect(serviceField).toHaveValue(covered.id);
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Plano")).toHaveValue(contracted.id),
    );
    // "Vender plano avulso…" mostra todos os serviços; "Voltar" retorna aos dos planos.
    change("Serviço", "__sell-single-plan", dialog);
    expect(
      within(dialog).getByText("Escolha o serviço do plano avulso a vender."),
    ).toBeInTheDocument();
    expect(within(serviceField).getAllByRole("option").length).toBeGreaterThan(
      3,
    );
    change("Serviço", "__plan-services", dialog);
    change("Serviço", covered.id, dialog);
    await waitFor(() => expect(confirm(dialog)).toBeEnabled());
    fireEvent.click(confirm(dialog));
    expect((await booked()).planId).toBe(contracted.id);
  });

  it("aula experimental não pede plano", async () => {
    const { openBooking, booked, confirm } = await scenario();
    const dialog = await openBooking();
    change("Tipo", "trial", dialog);
    expect(within(dialog).queryByLabelText("Plano")).not.toBeInTheDocument();
    // Experimental não sai de plano: o "Serviço" lista todos.
    expect(
      within(within(dialog).getByLabelText("Serviço")).queryByRole("option", {
        name: /Vender plano avulso|Voltar aos serviços/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Cliente sem plano para este serviço"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(confirm(dialog)).toBeEnabled());
    fireEvent.click(confirm(dialog));
    const appointment = await booked();
    expect(appointment.visitType).toBe("trial");
    expect(appointment.planId).toBeUndefined();
  });
});
