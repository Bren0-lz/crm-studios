import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const agendaCss = readFileSync(
  `${process.cwd()}/src/styles/05-agenda.css`,
  "utf8",
);

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(agendaCss)?.[1];
}

function appointmentRanges() {
  return vi
    .mocked(fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.includes("/appointments?from="));
}

const views = [
  { name: "Dia", next: "Próximo dia" },
  { name: "Semana", next: "Próxima semana" },
  { name: "Mês", next: "Próximo mês" },
] as const;

describe("agenda: botão Hoje e cabeçalho fixo (QM17)", () => {
  it.each(views)(
    "na visão $name, Hoje volta ao período de hoje mantendo a visão",
    async ({ name, next }) => {
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
        async () =>
          ({ ok: true, status: 200, json: async () => [] }) as Response,
      );
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(await screen.findByRole("button", { name }));
      const today = await screen.findByRole("button", { name: "Hoje" });
      expect(today).toHaveClass("secondary-button", "button-sm");
      expect(today).toBeDisabled();
      await waitFor(() =>
        expect(appointmentRanges().length).toBeGreaterThan(0),
      );
      const todayRange = appointmentRanges().at(-1);

      fireEvent.click(screen.getByRole("button", { name: next }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Hoje" })).toBeEnabled(),
      );
      await waitFor(() =>
        expect(appointmentRanges().at(-1)).not.toBe(todayRange),
      );

      fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Hoje" })).toBeDisabled(),
      );
      await waitFor(() => expect(appointmentRanges().at(-1)).toBe(todayRange));
      expect(screen.getByRole("button", { name })).toHaveClass("active");
    },
  );

  it("mantém fixos o cabeçalho dos profissionais e a coluna de horários", () => {
    const scroll = cssRule(".day-grid-scroll") ?? "";
    expect(scroll).toContain("overflow: auto");
    expect(scroll).toMatch(/max-height: /);

    // Com border-collapse as bordas são da tabela e rolam por baixo das células fixas.
    const table = cssRule(".day-grid") ?? "";
    expect(table).toContain("border-collapse: separate");
    expect(table).toContain("border-spacing: 0");
    const cells = cssRule(".day-grid th,\n.day-grid td") ?? "";
    expect(cells).toContain("border-top: 1px solid");
    expect(cells).toContain("border-right: 1px solid");
    expect(cssRule(".day-grid tr > :first-child")).toContain(
      "box-shadow: inset 1px 0 0",
    );

    const header = cssRule(".day-grid thead th") ?? "";
    expect(header).toContain("position: sticky");
    expect(header).toContain("top: 0");
    expect(header).toMatch(/z-index: [1-9]/);
    expect(header).toMatch(/background: /);

    const time = cssRule(".day-grid .day-grid-time") ?? "";
    expect(time).toContain("position: sticky");
    expect(time).toContain("left: 0");
    expect(time).toMatch(/background: /);
    expect(cssRule(".day-grid thead .day-grid-time")).toContain("z-index: 2");
  });
});
