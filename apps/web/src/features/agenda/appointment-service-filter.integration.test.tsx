import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("new appointment services", () => {
  it("lists only the services attended by the chosen professional and room", async () => {
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
    const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const bia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const room = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/professionals")
        ? [
            { id: ana, fullName: "Ana Martins", color: "#547A6B" },
            { id: bia, fullName: "Bia Souza", color: "#547A6B" },
          ]
        : url.includes("/rooms")
          ? [{ id: room, name: "Estúdio", capacity: 4 }]
          : url.includes("/services")
            ? [
                {
                  id: "s1",
                  name: "Pilates",
                  durationMinutes: 50,
                  priceInCents: 9000,
                  professionalIds: [ana],
                  roomIds: [],
                },
                {
                  id: "s2",
                  name: "Avaliação",
                  durationMinutes: 30,
                  priceInCents: 0,
                  professionalIds: [],
                  roomIds: [],
                },
              ]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo atendimento" }),
    );
    const dialog = await screen.findByRole("dialog");
    const service = within(dialog).getByLabelText("Serviço");
    expect(within(service).getAllByRole("option")).toHaveLength(3);
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: ana },
    });
    fireEvent.change(service, { target: { value: "s1" } });
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: bia },
    });
    expect(
      within(service).queryByRole("option", { name: /Pilates/ }),
    ).not.toBeInTheDocument();
    expect(service).toHaveValue("");
    expect(
      within(service).getByRole("option", { name: /Avaliação/ }),
    ).toBeInTheDocument();
  });
});
