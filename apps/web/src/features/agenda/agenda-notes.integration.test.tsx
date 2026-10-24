import type { AgendaNote } from "@crm/contracts";
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
import { localIsoDate } from "../../shared/lib/formatting";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const professionalId = "33333333-3333-4333-8333-333333333333";
const otherProfessionalId = "44444444-4444-4444-8444-444444444444";
function note(
  id: string,
  description: string,
  target: string | null = professionalId,
): AgendaNote {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10);
  return {
    id,
    description,
    professionalId: target,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    backgroundColor: "#facc15",
    seriesId: "55555555-5555-4555-8555-555555555555",
    clinicId: "clinic",
    branchId: "branch",
    authorUserId: "author",
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  };
}
function setup(initialNotes: AgendaNote[] = [], professional = false) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Equipe",
      email: "test@example.com",
      role: professional ? "physiotherapist" : "owner",
    }),
  );
  if (professional) {
    const stored = JSON.parse(localStorage.getItem("crm.auth.user")!);
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        ...stored,
        permissions: [...stored.permissions, "agenda.notes"],
      }),
    );
  }
  let notes = initialNotes;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes("/agenda-notes")) {
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        const created = {
          ...note("new", payload.description, payload.professionalId),
          ...payload,
        };
        notes = [...notes, created];
        body = [created];
      } else if (init?.method === "PATCH") {
        notes = notes.map((item) => ({
          ...item,
          ...JSON.parse(String(init.body)),
        }));
        body = notes;
      } else if (init?.method === "DELETE") {
        notes = [];
      } else body = notes;
    } else if (url.includes("/professionals"))
      body = [
        { id: professionalId, fullName: "Ana", color: "#276749" },
        { id: otherProfessionalId, fullName: "Paulo", color: "#2563eb" },
      ];
    else if (url.endsWith("/profile"))
      body = { professional: professional ? { id: professionalId } : null };
    return {
      ok: true,
      status: init?.method === "DELETE" ? 204 : 200,
      json: async () => body,
    } as Response;
  });
  return render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
}
describe("notes in the agenda", () => {
  it("creates a repeated note using the chosen weekdays and fixed palette", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Nova nota" })).toBeEnabled(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nova nota" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Reunião da equipe" },
    });
    fireEvent.change(within(dialog).getByLabelText("Para quem mostrar"), {
      target: { value: "all" },
    });
    fireEvent.click(within(dialog).getByLabelText("Repetir nota"));
    const until = new Date();
    until.setDate(until.getDate() + 7);
    fireEvent.change(within(dialog).getByLabelText("Repetir até"), {
      target: { value: localIsoDate(until) },
    });
    expect(
      within(dialog).getByRole("checkbox", {
        name: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][
          new Date().getDay()
        ]!,
      }),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nota" }),
    );
    await screen.findByRole("button", {
      name: "Detalhes da nota: Reunião da equipe",
    });
    const request = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/agenda-notes") && init?.method === "POST",
      );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      description: "Reunião da equipe",
      professionalId: null,
      repeat: { until: localIsoDate(until), weekdays: [new Date().getDay()] },
      backgroundColor: "#64748b",
    });
    expect(screen.queryByLabelText("Cor do texto")).not.toBeInTheDocument();
  });
  it("shows notes in grid, list, week and month; remembers the toggle", async () => {
    const view = setup([note("n1", "Lembrete"), note("n2", "Equipe", null)]);
    const button = await screen.findByRole("button", {
      name: "Detalhes da nota: Lembrete",
    });
    expect(button.style.getPropertyValue("--tag-color")).toBe("#facc15");
    expect(button.style.getPropertyValue("--tag-text")).toBe("#000000");
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(
      screen.getByRole("button", { name: "Detalhes da nota: Lembrete" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(
      await screen.findByRole("button", { name: "Detalhes da nota: Lembrete" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    fireEvent.click(await screen.findByRole("button", { name: "2 notas" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Detalhes da nota: Lembrete",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Detalhes da nota: Lembrete",
      }),
    );
    // A nota abre sozinha, sem ficar atrás da agenda do dia.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Detalhes da nota",
      }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar notas" }));
    expect(
      screen.queryByRole("button", { name: "2 notas" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("crm.agenda.showNotes")).toBe("false");
    view.unmount();
    setup([note("n1", "Lembrete")]);
    expect(
      await screen.findByRole("checkbox", { name: "Mostrar notas" }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: /Detalhes da nota/ }),
    ).not.toBeInTheDocument();
  });
  it("requires the series scope when editing and deleting", async () => {
    setup([note("n1", "Lembrete")]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes da nota: Lembrete" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Editar",
      }),
    );
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Aplicar a")).toBeRequired();
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Atualizada" },
    });
    fireEvent.change(within(dialog).getByLabelText("Aplicar a"), {
      target: { value: "following" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nota" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Detalhes da nota: Atualizada",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Excluir",
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Aplicar a"), {
      target: { value: "this" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar exclusão" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Detalhes da nota: Atualizada" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            String(url).includes("scope=following") && init?.method === "PATCH",
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            String(url).includes("scope=this") && init?.method === "DELETE",
        ),
    ).toBe(true);
  });
  it("hides other professionals' notes and only allows managing own notes", async () => {
    setup(
      [
        note("n1", "Minha nota"),
        note("n2", "Nota privada", otherProfessionalId),
        note("n3", "Nota compartilhada", null),
      ],
      true,
    );
    await screen.findByRole("button", { name: "Detalhes da nota: Minha nota" });
    expect(
      screen.queryByRole("button", { name: "Detalhes da nota: Nota privada" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Detalhes da nota: Nota compartilhada",
      }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Editar",
      }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes da nota: Minha nota" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Editar",
      }),
    ).toBeInTheDocument();
  });
});
