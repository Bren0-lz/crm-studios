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
                  professionalIds: [ana],
                  roomIds: [],
                },
                {
                  id: "s2",
                  name: "Avaliação",
                  durationMinutes: 30,
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

  it("does not offer depilation in the Pilates room and marks the client as required (QM3)", async () => {
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
    const carolina = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const beatriz = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const pilatesRoom = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const aestheticsRoom = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/professionals")
        ? [
            { id: carolina, fullName: "Carolina Rocha", color: "#db8290" },
            { id: beatriz, fullName: "Beatriz Lima", color: "#6699a1" },
          ]
        : url.includes("/rooms")
          ? [
              { id: pilatesRoom, name: "Sala Pilates", capacity: 1 },
              { id: aestheticsRoom, name: "Sala Estética", capacity: 1 },
            ]
          : url.includes("/services")
            ? [
                {
                  id: "s1",
                  name: "Depilação pernas",
                  durationMinutes: 45,
                  professionalIds: [carolina],
                  roomIds: [aestheticsRoom],
                },
                {
                  id: "s2",
                  name: "Pilates individual",
                  durationMinutes: 50,
                  professionalIds: [beatriz],
                  roomIds: [pilatesRoom],
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
    // Cliente obrigatório: o "*" é só visual (CSS), o nome acessível continua "Cliente".
    expect(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
    ).toBeRequired();
    const service = within(dialog).getByLabelText("Serviço");
    // Escolher o serviço antes e depois a sala incompatível limpa o serviço.
    fireEvent.change(service, { target: { value: "s1" } });
    fireEvent.change(within(dialog).getByLabelText("Sala"), {
      target: { value: pilatesRoom },
    });
    expect(service).toHaveValue("");
    expect(
      within(service).queryByRole("option", { name: /Depilação/ }),
    ).not.toBeInTheDocument();
    expect(
      within(service).getByRole("option", { name: /Pilates individual/ }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Sala"), {
      target: { value: aestheticsRoom },
    });
    expect(
      within(service).getByRole("option", { name: /Depilação/ }),
    ).toBeInTheDocument();
  });
});
