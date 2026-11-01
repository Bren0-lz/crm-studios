import { legacyPermissions } from "@crm/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("history page", () => {
  beforeEach(() => {
    vi.spyOn(api, "auditHistory").mockReset();
    vi.spyOn(api, "historyActors").mockResolvedValue([]);
  });
  const event = {
    id: "event-1",
    action: "clinic.updated",
    entityType: "clinic",
    metadata: {},
    createdAt: "2026-10-07T12:00:00.000Z",
    actorName: "Maria Souza",
  };
  function session(role: "admin" | "user" = "user", allowed = true) {
    const user = withPermissions({
      id: "history-reader",
      fullName: "History Reader",
      email: "history@test.local",
      role,
      modules: allowed ? ["history"] : ["settings"],
      editModules: [],
      permissions:
        role === "admin"
          ? legacyPermissions("admin")
          : allowed
            ? ["history.view" as const]
            : ["settings.view" as const],
    });
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify(user));
    return user;
  }
  function open() {
    return render(
      <MemoryRouter initialEntries={["/historico"]}>
        <App />
      </MemoryRouter>,
    );
  }
  it("shows the changed client fields and the edit reason", async () => {
    session();
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [
        {
          ...event,
          id: "event-edit",
          action: "operation.patients.update",
          module: "patients",
          entityType: "patients",
          metadata: {
            subjectName: "Helena Almeida",
            reason: "Cliente trocou de número",
            changes: [
              {
                field: "phone",
                label: "Telefone",
                before: "11987654321",
                after: "11911112222",
              },
            ],
          },
        },
      ],
      nextCursor: null,
    });
    open();
    const entry = (await screen.findByText("Telefone")).closest("article")!;
    expect(
      within(entry).getByText("11987654321 → 11911112222"),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText("Cliente trocou de número"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(entry).getByRole("button", { name: "Ver detalhes" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Motivo da alteração")).toBeInTheDocument();
    expect(
      within(dialog).getByText("11987654321 → 11911112222"),
    ).toBeInTheDocument();
  });

  it("shows loading and the independent history menu, then the empty state", async () => {
    session();
    let resolve!: (value: import("@crm/contracts").AdminAuditPage) => void;
    vi.spyOn(api, "auditHistory").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    open();
    expect(
      await screen.findByRole("heading", { name: "Histórico" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Histórico" })).toHaveAttribute(
      "href",
      "/historico",
    );
    expect(
      screen.queryByRole("link", { name: "Configurações" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Atividades do sistema" }),
    ).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    resolve({ items: [], nextCursor: null });
    expect(
      await screen.findByText(
        "Nenhum registro encontrado. Tente alterar a pesquisa ou os filtros.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });
  it("allows administrators and displays the responsible person, time and system fallback", async () => {
    session("admin");
    const systemEvent = {
      id: "event-2",
      action: "user.updated",
      entityType: "user",
      metadata: {},
      createdAt: event.createdAt,
    };
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [event, systemEvent],
      nextCursor: null,
    });
    const { container } = open();
    expect(
      await screen.findByRole("heading", {
        name: "Dados da clínica atualizados",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Maria Souza ·/)).toBeInTheDocument();
    expect(screen.getByText(/Sistema ·/)).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      event.createdAt,
    );
  });
  it("retries a failed first load", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockRejectedValueOnce(new Error("Falha ao carregar"))
      .mockResolvedValueOnce({ items: [event], nextCursor: null });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", {
        name: "Dados da clínica atualizados",
      }),
    ).toBeInTheDocument();
    expect(history).toHaveBeenNthCalledWith(2, undefined, {});
  });
  it("keeps loaded events when the next page fails and retries the same cursor", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id })
      .mockRejectedValueOnce(new Error("Falha na próxima página"))
      .mockResolvedValueOnce({
        items: [{ ...event, id: "event-2", action: "user.created" }],
        nextCursor: null,
      });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha na próxima página",
    );
    expect(
      screen.getByRole("heading", { name: "Dados da clínica atualizados" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", { name: "Usuário cadastrado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
    expect(history).toHaveBeenNthCalledWith(2, event.id, {});
    expect(history).toHaveBeenNthCalledWith(3, event.id, {});
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });
  it("hides history and redirects direct access without its permission", async () => {
    session("user", false);
    const history = vi.spyOn(api, "auditHistory");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    open();
    expect(
      await screen.findByRole("link", { name: "Configurações" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Histórico" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "Histórico" }),
    ).not.toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
  });
  it("removes the page and menu after a permission revocation is refreshed", async () => {
    let fresh = session();
    vi.spyOn(api, "me").mockImplementation(async () => fresh);
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [event],
      nextCursor: null,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    fresh = { ...fresh, modules: [], permissions: [] };
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Histórico" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
  });
  it("opens the readable summary and preserves all technical values in the details tab", async () => {
    session();
    const detailed = {
      ...event,
      clinicId: "clinic-1",
      actorUserId: "user-1",
      entityId: "record-1",
      ipAddress: "192.0.2.1",
      metadata: {
        untouchedKey: { nested: [false, null, 0, "<script>example</script>"] },
        longValue: "long".repeat(80),
      },
    };
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [detailed],
      nextCursor: null,
    });
    open();
    const trigger = await screen.findByRole("button", { name: "Ver detalhes" });
    expect(screen.queryByText(event.action)).not.toBeInTheDocument();
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes da alteração",
    });
    const summaryTab = within(dialog).getByRole("tab", { name: "Resumo" });
    expect(summaryTab).toHaveFocus();
    expect(summaryTab).toHaveAttribute("aria-selected", "true");
    const summaryPanel = within(dialog).getByRole("tabpanel", {
      name: "Resumo",
    });
    expect(
      within(summaryPanel).getByText("Dados da clínica atualizados"),
    ).toBeInTheDocument();
    expect(
      within(summaryPanel).queryByText(event.action),
    ).not.toBeInTheDocument();
    const technicalTab = within(dialog).getByRole("tab", {
      name: "Detalhes técnicos",
    });
    fireEvent.click(technicalTab);
    const technicalPanel = within(dialog).getByRole("tabpanel", {
      name: "Detalhes técnicos",
    });
    for (const value of [
      event.id,
      event.action,
      event.entityType,
      "record-1",
      "clinic-1",
      "user-1",
      event.actorName,
      event.createdAt,
      "192.0.2.1",
    ])
      expect(within(technicalPanel).getByText(value)).toBeInTheDocument();
    expect(technicalPanel.querySelector("pre")!.textContent).toBe(
      JSON.stringify(detailed.metadata, null, 2),
    );
    expect(technicalPanel.querySelector("script")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("supports keyboard tabs, Escape and focus restoration without technical data inventing", async () => {
    session();
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [
        {
          ...event,
          action: "future.action",
          entityType: "user",
          actorName: "",
          actorUserId: "removed-user",
        },
      ],
      nextCursor: null,
    });
    open();
    expect(
      await screen.findByRole("heading", { name: "Alteração registrada" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Usuário não identificado/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Ver detalhes" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const summary = within(dialog).getByRole("tab", { name: "Resumo" });
    const technical = within(dialog).getByRole("tab", {
      name: "Detalhes técnicos",
    });
    fireEvent.keyDown(summary, { key: "ArrowRight" });
    expect(technical).toHaveFocus();
    expect(technical).toHaveAttribute("aria-selected", "true");
    expect(
      within(dialog).getByRole("tabpanel", { name: "Detalhes técnicos" }),
    ).toHaveTextContent("Não registrado");
    fireEvent.keyDown(technical, { key: "Home" });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "ArrowLeft" });
    expect(technical).toHaveFocus();
    fireEvent.keyDown(technical, { key: "ArrowRight" });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "End" });
    expect(technical).toHaveFocus();
    fireEvent.keyDown(technical, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("applies search and combined filters on submit and resets the page", async () => {
    session();
    const actor = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Aryana Dutra",
    };
    vi.spyOn(api, "historyActors").mockResolvedValue([actor]);
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValue({ items: [event], nextCursor: event.id });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    await screen.findByRole("option", { name: actor.name });
    fireEvent.change(screen.getByLabelText("Pesquisar"), {
      target: { value: "pagamento" },
    });
    fireEvent.change(screen.getByLabelText("Área"), {
      target: { value: "finance" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de atividade"), {
      target: { value: "financial.payment" },
    });
    fireEvent.change(screen.getByLabelText("Responsável"), {
      target: { value: actor.id },
    });
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-10-08" },
    });
    expect(history).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Pesquisar e filtrar" }),
    );
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    const filters = {
      search: "pagamento",
      module: "finance",
      action: "financial.payment",
      actorUserId: actor.id,
      from: "2026-10-01",
      to: "2026-10-08",
    };
    expect(history).toHaveBeenLastCalledWith(undefined, filters);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Próxima" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(event.id, filters),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(undefined, {}),
    );
    expect(screen.getByLabelText("Pesquisar")).toHaveValue("");
    expect(screen.getByLabelText("Área")).toHaveValue("");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Página 1"),
    );
  });
  it("keeps only the current page and retrieves the previous page again", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id })
      .mockResolvedValueOnce({
        items: [{ ...event, id: "second", action: "user.created" }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByRole("heading", { name: "Usuário cadastrado" });
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Página 2");
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    expect(
      screen.queryByRole("heading", { name: "Usuário cadastrado" }),
    ).not.toBeInTheDocument();
    expect(history).toHaveBeenLastCalledWith(undefined, {});
  });
  it("does not offer clinical technical details without the required permissions", async () => {
    session();
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [
        {
          ...event,
          action: "clinical.access.read",
          module: "clinical",
          detailsRestricted: true,
          metadata: {},
        },
      ],
      nextCursor: null,
    });
    open();
    expect(
      await screen.findByRole("heading", { name: "Prontuário consultado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ver detalhes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Detalhes disponíveis para quem tem acesso aos Prontuários.",
      ),
    ).toBeInTheDocument();
  });
});
