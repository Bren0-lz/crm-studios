import { fireEvent, render, screen, within } from "@testing-library/react";
import { LEAD_BOARD_PAGE_SIZE } from "@crm/contracts";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

describe("commercial board pagination", () => {
  it("shows the stage total and loads the next page of a column", async () => {
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
    const total = LEAD_BOARD_PAGE_SIZE + 4;
    const leads = Array.from({ length: total }, (_, index) => ({
      id: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: `Lead ${String(index).padStart(2, "0")}`,
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "new_contact",
      // Mais recente primeiro: "Lead 00" abre a coluna e "Lead 33" fica na 2ª página.
      updatedAt: new Date(
        Date.UTC(2026, 8, 1, 12, 0, total - index),
      ).toISOString(),
    }));
    const urls: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input) => {
      urls.push(String(input));
      const body = isLeadBoardUrl(input) ? leadBoardResponse(input, leads) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Lead 00");
    const column = screen.getByRole("region", { name: "Novos" });
    expect(within(column).getByText(String(total))).toBeInTheDocument();
    expect(within(column).getAllByRole("article")).toHaveLength(
      LEAD_BOARD_PAGE_SIZE,
    );
    expect(within(column).queryByText("Lead 33")).not.toBeInTheDocument();
    expect(urls.some((url) => /\/leads(\?|$)/.test(url))).toBe(false);

    fireEvent.click(
      within(column).getByRole("button", { name: "Carregar mais (4)" }),
    );
    expect(await within(column).findByText("Lead 33")).toBeInTheDocument();
    expect(within(column).getAllByRole("article")).toHaveLength(total);
    expect(
      within(column).queryByRole("button", { name: /Carregar mais/ }),
    ).not.toBeInTheDocument();
    expect(
      urls.some((url) =>
        url.endsWith(`/leads/board/new_contact?offset=${LEAD_BOARD_PAGE_SIZE}`),
      ),
    ).toBe(true);
  });
});
