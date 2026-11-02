import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { sellSessionForAppointment } from "../../../../api/src/test-support/commission-billing.js";
import { createSalariedUser } from "../../../../api/src/test-support/payroll-users.js";
import { serviceWithSinglePlan } from "../../../../api/src/test-support/single-plan-service.js";
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
      service = await serviceWithSinglePlan(
        repository,
        clinicId,
        actorId,
        18000,
      ),
      [room] = await repository.listRooms(clinicId),
      patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente da folha",
        phone: "11988887777",
        tags: [],
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
    await sellSessionForAppointment(repository, clinicId, actorId, appointment);
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    await repository.generateCommissions(clinicId, "2025-03");
    const commission = Math.round(18000 * 0.1);
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
    // O salário fixo não muda na folha; descontos e recompensas entram pelo "Ajustar".
    expect(
      within(matriz).queryByRole("button", { name: "Editar Marina Folha" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(matriz).getByRole("button", {
        name: "Desconto ou recompensa de Marina Folha",
      }),
    );
    const adjust = await screen.findByRole("dialog", {
      name: "Desconto ou recompensa · Marina Folha",
    });
    change("Forma", "percent", adjust);
    change("Porcentagem (%)", "10", adjust);
    change("Motivo", "Faltas sem justificativa", adjust);
    expect(
      within(adjust).getByText("Sai do pagamento: R$ 150,00"),
    ).toBeInTheDocument();
    await save("Desconto ou recompensa · Marina Folha", "Adicionar");
    const withDiscount = await within(matriz).findByRole("list", {
      name: "Itens de Marina Folha",
    });
    await within(withDiscount).findByText("Desconto (10% do salário)");
    expect(
      within(withDiscount).getByText("Faltas sem justificativa"),
    ).toBeInTheDocument();
    expect(within(withDiscount).getByText("Salário fixo")).toBeInTheDocument();
    // Recompensa adicionada por engano: sai antes de lançar.
    fireEvent.click(
      within(matriz).getByRole("button", {
        name: "Desconto ou recompensa de Marina Folha",
      }),
    );
    const bonus = await screen.findByRole("dialog", {
      name: "Desconto ou recompensa · Marina Folha",
    });
    change("Tipo", "bonus", bonus);
    change("Valor (R$)", "50,00", bonus);
    change("Motivo", "Lançada por engano", bonus);
    await save("Desconto ou recompensa · Marina Folha", "Adicionar");
    fireEvent.click(
      await within(matriz).findByRole("button", {
        name: "Remover recompensa de Marina Folha",
      }),
    );
    await save("Remover recompensa", "Remover");
    await waitFor(() =>
      expect(
        within(matriz).queryByText("Lançada por engano"),
      ).not.toBeInTheDocument(),
    );
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
    // Só o vencimento: categoria "Folha de pagamento" e sem centro de custo.
    expect(within(launch).getByLabelText(/Vencimento/)).toBeInTheDocument();
    expect(within(launch).queryByLabelText(/Categoria/)).toBeNull();
    expect(within(launch).queryByLabelText(/Centro de custo/)).toBeNull();
    await save("Lançar folha de 03/2025", "Lançar folha");
    await waitFor(async () => {
      const payables = (await repository.getFinancialWorkspace(clinicId))
        .payables;
      expect(
        payables
          .filter((item) => item.payroll)
          .map((item) => [
            item.description,
            item.amountInCents,
            item.categoryName,
          ]),
      ).toEqual(
        expect.arrayContaining([
          [
            "Folha 03/2025 · Marina Folha",
            150000 + commission - 15000,
            "Folha de pagamento",
          ],
          ["Folha 03/2025 · Recepção Centro", 90000, "Folha de pagamento"],
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
