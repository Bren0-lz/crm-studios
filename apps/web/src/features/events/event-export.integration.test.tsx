import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEventIndicators,
  type CommercialEventDetail,
  type EventParticipant,
} from "@crm/contracts";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const eventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ana: EventParticipant = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  clinicId: "clinic",
  fullName: "Ana Participante",
  phone: "11987654321",
  source: "Evento: Aulão de Pilates",
  interest: "Evento",
  stage: "new_contact",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  eventId,
  createdAt: "2039-06-10T13:00:00.000Z",
  updatedAt: "2039-06-10T13:00:00.000Z",
};
const detail: CommercialEventDetail = {
  id: eventId,
  clinicId: "clinic",
  name: "Aulão de Pilates",
  startsAt: "2039-06-10T13:00:00.000Z",
  participantCount: 1,
  createdAt: "2039-01-01T00:00:00Z",
  updatedAt: "2039-01-01T00:00:00Z",
  participants: [ana],
  indicators: buildEventIndicators([ana]),
};

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.restoreAllMocks();
});

function setup({ failExport = false } = {}) {
  localStorage.setItem("crm.auth.token", "test-token");
  // Só ver eventos já basta para exportar.
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify(
      withPermissions({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Consulta",
        email: "viewer@example.com",
        role: "user",
        permissions: ["events.view"],
      }),
    ),
  );
  const exports: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as Response;
    if (url.includes(`/events/${eventId}/participants/export.xlsx`)) {
      exports.push(url);
      if (failExport)
        return json({ message: "Falha ao gerar a planilha" }, 500);
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(["xlsx"]),
      } as Response;
    }
    if (url.endsWith(`/events/${eventId}`)) return json(detail);
    if (url.includes("branding"))
      return json({ name: "Studios Aryana", timezone: "America/Sao_Paulo" });
    if (url.includes("/notifications")) return json({ date: "2039-06-10" });
    return json([]);
  });
  const createObjectURL = vi.fn(() => "blob:participantes");
  const revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {});
  render(
    <MemoryRouter initialEntries={[`/eventos/${eventId}`]}>
      <App />
    </MemoryRouter>,
  );
  return { exports, createObjectURL, revokeObjectURL, click };
}

describe("exportar participantes do evento", () => {
  it("baixa a planilha dos participantes", async () => {
    const { exports, createObjectURL, revokeObjectURL, click } = setup();
    expect(await screen.findByText("Ana Participante")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar participantes" }),
    );
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(exports).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalled();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("participantes-aulao-de-pilates.xlsx");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:participantes");
    expect(
      screen.getByRole("button", { name: "Exportar participantes" }),
    ).toBeEnabled();
  });

  it("mostra o erro quando a exportação falha", async () => {
    const { click } = setup({ failExport: true });
    expect(await screen.findByText("Ana Participante")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar participantes" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao gerar a planilha",
    );
    expect(click).not.toHaveBeenCalled();
  });
});
