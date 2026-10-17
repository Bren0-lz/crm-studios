import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../../App";
import { clinicId, setupApi } from "../../test-support/api-server";

describe("client workspace against the API", () => {
  it("opens a client, changes status and preserves the contextual navigation", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente do prontuário",
      phone: "11988887777",
      tags: [],
      city: "São Paulo",
    });
    render(
      <MemoryRouter initialEntries={[`/clientes/${patient.id}`]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: patient.fullName }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inativar cliente" }));
    expect(
      await screen.findByRole("button", { name: "Reativar cliente" }),
    ).toBeInTheDocument();
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === patient.id,
      )?.status,
    ).toBe("inactive");
  });
});
