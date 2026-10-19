import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("patient search while typing", () => {
  it("searches shortly after the user stops typing, without pressing Enter", async () => {
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
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const input = await screen.findByPlaceholderText(
      "Buscar por nome, CPF ou telefone",
    );
    const searches = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          String(url).includes("/patients?search=an"),
        );
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    expect(searches()).toHaveLength(0);
    await vi.waitFor(() => expect(searches()).toHaveLength(1), {
      timeout: 2000,
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/patients?search=a")),
    ).toBe(false);
  });
});
