import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change } from "../../test-support/workflow-ui";

describe("single package purchase scheduling", () => {
  it("opens the purchase schedule on fixed weekdays with the package sessions", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do pacote avulso",
      phone: "11977776666",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pacote avulso de 10 sessões",
      kind: "single",
      totalValueInCents: 100000,
      services: [
        {
          serviceId: service!.id,
          totalSessions: 10,
          totalValueInCents: 100000,
        },
      ],
    });
    open(`/planos?patientId=${patient.id}`);
    await screen.findByText("Nenhum plano cadastrado", { exact: true });
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog", { name: "Novo plano" });
    change("Modelo", "single", dialog);
    await within(dialog).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Plano cadastrado", template.id, dialog);
    fireEvent.click(
      within(dialog).getByText("Horários da contratação", { exact: true }),
    );
    fireEvent.click(
      await within(dialog).findByRole("button", {
        name: "Adicionar horários à contratação",
      }),
    );
    const nested = screen.getByRole("dialog", {
      name: "Horários da contratação",
    });
    // Pacote avulso de várias sessões: abre em dias fixos na semana, como o pacote fixo.
    expect(
      within(nested).getByLabelText("Repetir este atendimento"),
    ).toBeChecked();
    expect(within(nested).getByLabelText("Intervalo")).toHaveValue("package");
    change("Serviço", service!.id, nested);
    expect(within(nested).getByLabelText(/^Número de sessões/)).toHaveValue(10);
    expect(
      within(nested).getByText("Sessões do pacote neste serviço: 10 sessões."),
    ).toBeInTheDocument();
  });
});
