import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { findMoreAction } from "../../test-support/patient-actions";
import { open, change, save } from "../../test-support/workflow-ui";

describe("client management through real HTTP handlers", () => {
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
