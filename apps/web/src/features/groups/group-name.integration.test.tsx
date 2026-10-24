import type { GroupClass, PermissionKey } from "@crm/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const initial: GroupClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "11111111-1111-4111-8111-111111111111",
  name: "Pilates Turma A",
  sequence: 1,
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Pilates",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  professionalName: "Ana Martins",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala Movimento",
  capacity: 4,
  activeEnrollments: 0,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
function setup(permissions: PermissionKey[], write?: () => Promise<Response>) {
  let group = structuredClone(initial);
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify(
      withPermissions({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Usuário",
        email: "user@example.com",
        role: "user",
        modules: ["groups"],
        editModules: [],
        permissions,
      }),
    ),
  );
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    if (options?.method === "PATCH") {
      if (write) return write();
      group = { ...group, ...JSON.parse(String(options.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(group),
      } as Response;
    }
    if (options?.method === "POST") {
      group = { ...group, ...JSON.parse(String(options.body)) };
      return {
        ok: true,
        status: 201,
        json: async () => structuredClone(group),
      } as Response;
    }
    const body = url.includes("/groups/workspace?")
      ? {
          groups: [structuredClone(group)],
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        }
      : url.includes("/rooms")
        ? [{ id: group.roomId, name: group.roomName, capacity: 10 }]
        : url.includes("/professionals")
          ? [{ id: group.professionalId, fullName: group.professionalName }]
          : url.includes("/services")
            ? [{ id: group.serviceId, name: group.serviceName }]
            : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

async function openGroup() {
  fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
  return screen.getByRole("dialog", { name: initial.name });
}

describe("group name editing", () => {
  it("renames with only the name permission and refreshes the persisted name", async () => {
    setup(["groups.view", "groups.rename"]);
    const dialog = await openGroup();
    expect(
      within(dialog).queryByLabelText("Máximo de pessoas"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome da turma"), {
      target: { value: "  Pilates manhã  " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nome" }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Pilates manhã")).toBeInTheDocument();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PATCH")!;
    expect(call[0]).toContain(`/groups/${initial.id}/name`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      name: "Pilates manhã",
    });
    fireEvent.click(screen.getByRole("button", { name: "Abrir turma" }));
    expect(screen.getByLabelText("Nome da turma")).toHaveValue("Pilates manhã");
  });

  it("keeps the name read only without the new permission", async () => {
    setup(["groups.view", "groups.update", "groups.create"]);
    const dialog = await openGroup();
    expect(
      within(dialog).queryByLabelText("Nome da turma"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Salvar nome" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova turma" }));
    expect(screen.queryByLabelText("Nome da turma")).not.toBeInTheDocument();
  });

  it("guards unsaved names and preserves input after a failed save", async () => {
    setup(
      ["groups.view", "groups.rename"],
      async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({
            code: "GROUP_ACCESS_DENIED",
            message: "Permissão removida.",
          }),
        }) as Response,
    );
    const dialog = await openGroup();
    fireEvent.change(within(dialog).getByLabelText("Nome da turma"), {
      target: { value: "Alterado" },
    });
    fireEvent.keyDown(window, { key: "Escape" });
    const discard = screen.getByRole("dialog", {
      name: "Descartar alterações?",
    });
    fireEvent.click(
      within(discard).getByRole("button", { name: "Continuar editando" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nome" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Permissão removida.",
    );
    expect(within(dialog).getByLabelText("Nome da turma")).toHaveValue(
      "Alterado",
    );
  });

  it("blocks closing while saving and rejects whitespace names", async () => {
    let finish!: (response: Response) => void;
    setup(
      ["groups.view", "groups.rename"],
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const dialog = await openGroup();
    const name = within(dialog).getByLabelText("Nome da turma");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nome" }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Informe o nome da turma.",
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "PATCH"),
    ).toBe(false);
    fireEvent.change(name, { target: { value: "Válido" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nome" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toBeDisabled();
    expect(name).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: initial.name }),
    ).toBeInTheDocument();
    await act(async () =>
      finish({
        ok: false,
        status: 500,
        json: async () => ({ message: "Tente novamente." }),
      } as Response),
    );
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toBeEnabled();
  });

  it.each(["Turma personalizada", ""])(
    "creates with custom or automatic name: %s",
    async (name) => {
      setup(["groups.view", "groups.create", "groups.rename"]);
      fireEvent.click(
        await screen.findByRole("button", { name: "Nova turma" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Nova turma" });
      for (const [label, value] of [
        ["Serviço", initial.serviceId],
        ["Profissional", initial.professionalId],
        ["Sala", initial.roomId],
      ])
        fireEvent.change(within(dialog).getByLabelText(label!), {
          target: { value },
        });
      expect(within(dialog).getByLabelText(/Nome da turma/)).toHaveAttribute(
        "placeholder",
        "Pilates Turma B",
      );
      fireEvent.change(within(dialog).getByLabelText(/Nome da turma/), {
        target: { value: name },
      });
      if (name) expect(within(dialog).getByText(name)).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Adicionar horário" }),
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Criar turma" }),
      );
      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.some(([, options]) => options?.method === "POST"),
        ).toBe(true),
      );
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "POST")!;
      const body = JSON.parse(String(call[1]?.body));
      if (name) expect(body.name).toBe(name);
      else expect(body).not.toHaveProperty("name");
    },
  );
});
