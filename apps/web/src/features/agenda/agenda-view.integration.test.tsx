import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { weekRangeLabel } from "./model";

describe("agenda view", () => {
  it("labels the week with its range", () => {
    expect(
      weekRangeLabel(new Date(2026, 9, 19, 12), new Date(2026, 9, 25, 12)),
    ).toBe("19 – 25 de outubro");
    expect(
      weekRangeLabel(new Date(2026, 8, 28, 12), new Date(2026, 9, 4, 12)),
    ).toBe("28 de set. – 4 de out.");
    expect(
      weekRangeLabel(new Date(2026, 11, 28, 12), new Date(2027, 0, 3, 12)),
    ).toBe("28 de dez. de 2026 – 3 de jan. de 2027");
  });

  it("remembers the last chosen view after reloading", async () => {
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
    const first = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Semana" }));
    first.unmount();
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Semana" })).toHaveClass(
      "active",
    );
  });
});
