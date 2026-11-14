import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

// RT6: a ficha do cliente mostra o CPF com máscara.
describe("ficha do cliente", () => {
  it("mostra o CPF formatado", async () => {
    const api = await setupApi();
    const patient = await api.repository.createPatient(clinicId, {
      cpf: "52998224725",
      fullName: "Ivo Máscara",
      phone: "11988887766",
      tags: [],
    });
    open(`/clientes/${patient.id}`);
    const label = await screen.findByText("CPF", { selector: "dt" });
    expect(label.nextElementSibling).toHaveTextContent("529.982.247-25");
  });
});
