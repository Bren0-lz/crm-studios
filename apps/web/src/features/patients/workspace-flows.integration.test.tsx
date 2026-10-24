import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { findMoreAction } from "../../test-support/patient-actions";
import { open, change, save } from "../../test-support/workflow-ui";

describe("client management through real HTTP handlers", () => {
  it("resolves conflicting fields before merging two client histories", async () => {
    const { repository } = await setupApi();
    const source = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro duplicado de teste",
      phone: "11988887777",
      tags: [],
    });
    const target = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro principal de teste",
      phone: "11999998888",
      tags: [],
    });
    open("/clientes");
    await findMoreAction("Mesclar clientes");
    const dialog = screen.getByRole("dialog", { name: "Mesclar clientes" });
    // Sem os dois cadastros, a prévia diz o que falta (QM14).
    const previewButton = within(dialog).getByRole("button", {
      name: "Visualizar prévia",
    });
    expect(previewButton).toBeDisabled();
    expect(previewButton).toHaveAccessibleDescription(
      "Falta: Cadastro duplicado, Cadastro principal.",
    );
    for (const [label, patient] of [
      ["Cadastro duplicado", source],
      ["Cadastro principal", target],
    ] as const) {
      fireEvent.change(
        within(dialog).getByRole("combobox", { name: new RegExp(`^${label}`) }),
        { target: { value: patient.fullName } },
      );
      fireEvent.click(
        await within(dialog).findByRole("option", { name: patient.fullName }),
      );
    }
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Visualizar prévia" })
        .closest("form")!,
    );
    const confirm = await within(dialog).findByRole("button", {
      name: "Confirmar mesclagem",
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("Falta: Nome, CPF, Telefone.");
    for (const select of within(dialog).getAllByRole("combobox"))
      fireEvent.change(select, { target: { value: "target" } });
    expect(confirm).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    await save("Mesclar clientes", "Confirmar mesclagem");
    expect(
      await screen.findByText(
        "Cadastros mesclados. Os históricos foram preservados.",
      ),
    ).toBeInTheDocument();
    expect(
      (await repository.listPatients(clinicId)).some(
        (item) => item.id === source.id,
      ),
    ).toBe(false);
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === target.id,
      ),
    ).toMatchObject({ fullName: target.fullName, phone: target.phone });
  });

  it("previews old registrations before applying bulk inactivation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-01-10T12:00:00Z"));
    const { repository, app } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro antigo de teste",
      phone: "11988887777",
      tags: [],
    });
    vi.setSystemTime(new Date("2040-01-10T12:00:00Z"));
    localStorage.setItem(
      "crm.auth.token",
      app.jwt.sign({ sub: actorId, clinicId, role: "admin" }),
    );
    open("/clientes");
    await findMoreAction("Inativar antigos");
    const dialog = screen.getByRole("dialog", {
      name: "Inativar clientes antigos",
    });
    change("Meses sem atendimentos", "6", dialog);
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Visualizar prévia" })
        .closest("form")!,
    );
    await within(dialog).findByText(new RegExp(patient.fullName));
    await save("Inativar clientes antigos", "Confirmar inativação");
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === patient.id,
      )?.status,
    ).toBe("inactive");
  });
});
