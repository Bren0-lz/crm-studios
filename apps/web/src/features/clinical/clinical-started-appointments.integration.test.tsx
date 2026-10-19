import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("clinical evolution appointment choices (QC3)", () => {
  it("offers only appointments that already started (from 15 minutes before)", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const now = Date.now();
    const option = (
      id: string,
      patientName: string,
      offsetMinutes: number,
    ) => ({
      id,
      patientName,
      professionalName: "Dra. Ana Martins",
      startsAt: new Date(now + offsetMinutes * 60_000).toISOString(),
      status: "scheduled",
    });
    const options = [
      option("11111111-1111-4111-8111-111111111111", "Helena Passado", -60),
      option("22222222-2222-4222-8222-222222222223", "Iara Em Breve", 10),
      option("33333333-3333-4333-8333-333333333333", "Joana Futuro", 60),
      option("44444444-4444-4444-8444-444444444444", "Karla Amanhã", 24 * 60),
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/appointments/options")
        ? options
        : url.includes("/clinical-records") || url.includes("/patients")
          ? []
          : {};
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    const newRecord = await screen.findByRole("button", {
      name: "Nova evolução",
    });
    await waitFor(() => expect(newRecord).toBeEnabled());
    fireEvent.click(newRecord);
    const dialog = screen.getByRole("dialog", {
      name: "Nova evolução clínica",
    });
    fireEvent.focus(
      within(dialog).getByRole("combobox", { name: "Atendimento" }),
    );
    expect(
      within(dialog).getByRole("option", { name: /Helena Passado/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: /Iara Em Breve/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Joana Futuro/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Karla Amanhã/ }),
    ).not.toBeInTheDocument();
  });
});
