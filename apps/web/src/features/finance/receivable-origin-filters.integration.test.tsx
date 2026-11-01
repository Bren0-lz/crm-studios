import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

describe("receivable filters by sold plan and service", () => {
  it("filters receivables by plan, service, tab and manual origin without manual categories", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente dos planos",
      phone: "11988887777",
      tags: [],
    });
    const pilates = await repository.createService(clinicId, {
      name: "Pilates estúdio",
      durationMinutes: 50,
      color: "#336699",
    });
    const physio = await repository.createService(clinicId, {
      name: "Fisioterapia ortopédica",
      durationMinutes: 50,
      color: "#669933",
    });
    const combo = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pilates + fisio",
      kind: "fixed_package",
      totalValueInCents: 40000,
      services: [
        { serviceId: pilates.id, totalSessions: 4, totalValueInCents: 25000 },
        { serviceId: physio.id, totalSessions: 2, totalValueInCents: 15000 },
      ],
    });
    const solo = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pilates mensal",
      kind: "fixed_package",
      totalValueInCents: 30000,
      services: [
        { serviceId: pilates.id, totalSessions: 8, totalValueInCents: 30000 },
      ],
    });
    for (const template of [combo, solo])
      await repository.createPatientPlan(clinicId, actorId, {
        planTemplateId: template.id,
        patientId: patient.id,
        name: template.name,
        kind: "fixed_package",
        services: template.services,
        validFrom: "2040-06-01",
        totalValueInCents: template.totalValueInCents,
        installments: 1,
        firstDueDate: "2040-06-10",
      });
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Ajuste avulso",
      amountInCents: 5000,
      dueDate: "2040-06-15",
    });
    const summary = await repository.getFinancialSummary(clinicId);
    expect(
      summary.receivables.find((item) => item.planName === combo.name),
    ).toMatchObject({
      source: "plan",
      services: [
        { id: pilates.id, name: pilates.name },
        { id: physio.id, name: physio.name },
      ],
    });
    expect(
      summary.receivables.find((item) => item.description === "Ajuste avulso"),
    ).toMatchObject({ source: "manual" });

    open(`/financeiro?patientId=${patient.id}`);
    await screen.findByText("Ajuste avulso");
    const visible = () =>
      ["Pilates + fisio", "Pilates mensal", "Ajuste avulso"].filter(
        (text) =>
          screen.queryAllByText((content) => content.startsWith(text)).length >
          0,
      );
    expect(visible()).toEqual([
      "Pilates + fisio",
      "Pilates mensal",
      "Ajuste avulso",
    ]);
    const filter = async (values: Array<[string, string]>) => {
      fireEvent.click(
        screen.getByRole("button", { name: /^Filtrar lançamentos/ }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Filtrar lançamentos",
      });
      expect(
        within(dialog).queryByLabelText("Categoria do lançamento"),
      ).not.toBeInTheDocument();
      for (const [label, value] of values) change(label, value, dialog);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar filtros" }),
      );
    };

    await filter([["Serviço do lançamento", physio.id]]);
    expect(visible()).toEqual(["Pilates + fisio"]);
    await filter([
      ["Serviço do lançamento", pilates.id],
      ["Plano do lançamento", `plan:${solo.name}`],
    ]);
    expect(screen.getByText("2 filtros aplicados")).toBeInTheDocument();
    expect(visible()).toEqual(["Pilates mensal"]);
    await filter([
      ["Serviço do lançamento", ""],
      ["Plano do lançamento", "manual"],
    ]);
    expect(visible()).toEqual(["Ajuste avulso"]);
    await filter([["Plano do lançamento", "plan"]]);
    expect(visible()).toEqual(["Pilates + fisio", "Pilates mensal"]);
  });
});
