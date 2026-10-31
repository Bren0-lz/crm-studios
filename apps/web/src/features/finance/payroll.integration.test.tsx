import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { createSalariedUser } from "../../../../api/src/test-support/payroll-users.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open, save } from "../../test-support/workflow-ui";

describe("folha de pagamento pela API real", () => {
  it("mostra quem recebe salário no cadastro do usuário, separa por filial, lança e desfaz a folha", async () => {
    const { repository } = await setupApi();
    const professional = await repository.createProfessional(clinicId, {
        fullName: "Marina Folha",
        crefito: "CREFITO-FOLHA-1",
        specialty: "Pilates",
        color: "#547A6B",
      }),
      service = (await repository.listServices(clinicId)).find(
        (item) => item.priceInCents >= 1000,
      )!,
      [room] = await repository.listRooms(clinicId),
      patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente da folha",
        phone: "11988887777",
        tags: [],
      }),
      category = await repository.createFinancialCategory(clinicId, {
        name: "Folha de pagamento",
        kind: "expense",
      });
    await repository.createCommissionRule(clinicId, {
      professionalId: professional.id,
      percentage: 10,
      effectiveFrom: "2025-01-01",
    });
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional.id,
      roomId: room!.id,
      serviceId: service.id,
      startsAt: "2025-03-10T13:00:00Z",
      visitType: "regular",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    await repository.generateCommissions(clinicId, "2025-03");
    const commission = Math.round(service.priceInCents * 0.1);
    const centro = (await repository.saveBranch(clinicId, actorId, {
      name: "Centro",
    }))!;
    await createSalariedUser(repository, clinicId, actorId, {
      name: "Recepção Centro",
      branchId: centro.id,
      salaryInCents: 90000,
    });

    open("/financeiro");
    fireEvent.click(await screen.findByRole("button", { name: "Folha" }));
    const panel = (
      await screen.findByRole("heading", { name: "Folha de pagamento" })
    ).closest("section")!;
    change("Competência", "2025-03", panel);
    await within(panel).findByText("Competência 03/2025");

    // Profissional com comissão e sem usuário com salário: só o aviso, sem cadastro na folha.
    await within(panel).findByText(/Marina Folha · 1 lançamento/);
    expect(
      within(panel).getByText(/ligue o profissional a um usuário/),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Cadastrar na folha" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: /Novo colaborador/ }),
    ).not.toBeInTheDocument();
    await createSalariedUser(repository, clinicId, actorId, {
      name: "Marina Folha",
      professionalId: professional.id,
      salaryInCents: 150000,
    });
    // Recarrega a folha (desmarca e volta a marcar as filiais).
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Matriz" }));
    await waitFor(() =>
      expect(
        within(panel).queryByRole("region", { name: "Folha de Matriz" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Selecionar todas" }),
    );

    const matriz = await within(panel).findByRole("region", {
      name: "Folha de Matriz",
    });
    fireEvent.click(
      await within(matriz).findByRole("button", {
        name: "Detalhes da folha de Marina Folha",
      }),
    );
    const items = within(matriz).getByRole("list", {
      name: "Itens de Marina Folha",
    });
    expect(within(items).getByText("Salário fixo")).toBeInTheDocument();
    expect(within(items).getByText("Comissão")).toBeInTheDocument();
    expect(within(items).getByText(service.name)).toBeInTheDocument();
    expect(within(items).getAllByText("A lançar")).toHaveLength(2);
    // O salário muda no cadastro do usuário, não na folha.
    expect(
      within(matriz).queryByRole("button", { name: "Editar Marina Folha" }),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Marina Folha · 1 lançamento/)).toBeNull();
    expect(
      within(panel).getByRole("region", { name: "Folha de Centro" }),
    ).toBeInTheDocument();

    // Só uma filial; "Selecionar todas" volta ao consolidado.
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Matriz" }));
    await waitFor(() =>
      expect(
        within(panel).queryByRole("region", { name: "Folha de Matriz" }),
      ).not.toBeInTheDocument(),
    );
    await within(panel).findByRole("region", { name: "Folha de Centro" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Selecionar todas" }),
    );
    await within(panel).findByRole("region", { name: "Folha de Matriz" });
    expect(
      within(panel).getByLabelText("Totais de todas as filiais selecionadas"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Lançar folha do mês" }),
    );
    const launch = await screen.findByRole("dialog", {
      name: "Lançar folha de 03/2025",
    });
    change("Categoria da despesa", category.id, launch);
    await save("Lançar folha de 03/2025", "Lançar folha");
    await waitFor(async () => {
      const payables = (await repository.getFinancialWorkspace(clinicId))
        .payables;
      expect(
        payables
          .filter((item) => item.payroll)
          .map((item) => [item.description, item.amountInCents]),
      ).toEqual(
        expect.arrayContaining([
          ["Folha 03/2025 · Marina Folha", 150000 + commission],
          ["Folha 03/2025 · Recepção Centro", 90000],
        ]),
      );
    });

    const lanced = await within(panel).findByRole("region", {
      name: "Folha de Matriz",
    });
    await within(lanced).findByText("Lançada");
    fireEvent.click(
      within(lanced).getByRole("button", { name: "Desfazer lançamento" }),
    );
    await save("Desfazer lançamento", "Desfazer lançamento");
    await waitFor(async () =>
      expect(
        (await repository.getFinancialWorkspace(clinicId)).payables.find(
          (item) => item.description === "Folha 03/2025 · Marina Folha",
        )?.status,
      ).toBe("cancelled"),
    );
    expect(
      (await within(lanced).findAllByText("A lançar")).length,
    ).toBeGreaterThan(0);
  });
});
