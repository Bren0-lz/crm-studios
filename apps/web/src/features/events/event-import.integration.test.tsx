import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  buildEventIndicators,
  type CommercialEventDetail,
} from "@crm/contracts";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const eventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const event: CommercialEventDetail = {
  id: eventId,
  clinicId: "clinic",
  name: "Aulão de Pilates",
  startsAt: "2039-06-10T13:00:00.000Z",
  participantCount: 0,
  createdAt: "2039-01-01T00:00:00Z",
  updatedAt: "2039-01-01T00:00:00Z",
  participants: [],
  indicators: buildEventIndicators([]),
};

describe("importar participantes do evento (EN1)", () => {
  it("abre pelo botão Importar participantes e mostra novos, vinculados e ignorados", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana",
        email: "admin@example.com",
        role: "owner",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/import/preview")
        ? {
            columns: [
              { index: 0, title: "Nome", samples: ["Ana"] },
              { index: 1, title: "Telefone", samples: ["11999990000"] },
            ],
            mapping: ["fullName", "phone"],
            rows: [
              {
                line: 2,
                fullName: "Ana",
                phone: "11999990000",
                status: "valid",
                errors: [],
              },
            ],
            errors: [],
            totals: { valid: 1, error: 0 },
          }
        : url.endsWith(`/events/${eventId}/import`)
          ? { created: 2, linked: 1, skipped: 3, errors: 0 }
          : url.endsWith(`/events/${eventId}`)
            ? event
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={[`/eventos/${eventId}`]}>
        <App />
      </MemoryRouter>,
    );
    const open = await screen.findByRole("button", {
      name: "Importar participantes",
    });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog", {
      name: "Importar participantes",
    });
    expect(
      within(dialog).getByText(/Quem já é cliente \(mesmo telefone/),
    ).toBeVisible();
    fireEvent.change(
      within(dialog).getByLabelText("Planilha de participantes"),
      {
        target: {
          files: [new File(["Nome;Telefone\n"], "lista.csv")],
        },
      },
    );
    fireEvent.click(
      await within(dialog).findByRole("button", {
        name: "Importar 1 participante(s)",
      }),
    );
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "2 participante(s) novo(s), 1 já cliente(s) vinculado(s), 3 ignorado(s) por já estar(em) no evento e 0 com erro.",
    );
  });
});
