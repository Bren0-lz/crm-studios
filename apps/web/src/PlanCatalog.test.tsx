import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  effectivePermissions,
  permissionModules,
  permissionEditModules,
  type PatientPlan,
  type PlanCatalogEntry,
  type PermissionKey,
  type UserSummary,
} from "@crm/contracts";
import App from "./App";
import { api } from "./api";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  fullName: "Helena Almeida",
};
const service = { id: "77777777-7777-4777-8777-777777777777", name: "Pilates" };
const entry: PlanCatalogEntry = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Mensalidade Pilates",
  totalValueInCents: 40000,
  createdAt: "2026-10-07T12:00:00.000Z",
  updatedAt: "2026-10-07T12:00:00.000Z",
};
const freeEntry: PlanCatalogEntry = {
  ...entry,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Sessão gratuita",
  totalValueInCents: 0,
};
const sold: PatientPlan = {
  id: "55555555-5555-4555-8555-555555555555",
  clinicId,
  patientId: patient.id,
  patientName: patient.fullName,
  serviceId: service.id,
  serviceName: service.name,
  name: entry.name,
  kind: "recurring",
  totalSessions: 8,
  remainingSessions: 2,
  validFrom: "2026-09-01",
  validUntil: "2026-09-30",
  totalValueInCents: 35000,
  installments: 1,
  firstDueDate: "2026-09-05",
  status: "active",
  autoRenew: false,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
};
function session(permissions?: PermissionKey[]) {
  const chosen = permissions ?? effectivePermissions("admin");
  const user: UserSummary = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Catalog User",
    email: "test@local.test",
    role: permissions ? "user" : "admin",
    modules: permissionModules(chosen),
    editModules: permissionEditModules(chosen),
    permissions: chosen,
  };
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem("crm.auth.user", JSON.stringify(user));
  vi.spyOn(api, "me").mockResolvedValue(user);
}
function page(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
async function sale() {
  page("/planos");
  fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
  return screen.getByRole("dialog");
}
async function settings() {
  page("/configuracoes");
  fireEvent.click(await screen.findByRole("button", { name: "Planos" }));
  return (await screen.findByRole("button", { name: "Planos" })).closest(
    "section",
  )!;
}
beforeEach(() => {
  session();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.includes("/patients")
            ? [patient]
            : url.includes("/services")
              ? [service]
              : [],
      } as Response;
    }),
  );
  vi.spyOn(api, "planCatalog").mockResolvedValue([entry, freeEntry]);
  vi.spyOn(api, "createPlan").mockImplementation(async (input) => ({
    ...sold,
    ...input,
    autoRenew: Boolean(input.autoRenew),
    validUntil: input.validUntil || "",
    remainingSessions: input.totalSessions,
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("plan selection", () => {
  it("fills name and price, switches plans including zero prices and saves a negotiated price", async () => {
    const dialog = await sale();
    const selector = within(dialog).getByLabelText("Plano cadastrado");
    await waitFor(() => expect(selector).not.toBeDisabled());
    expect(within(dialog).getByLabelText("Nome do plano")).toHaveValue("");
    fireEvent.change(selector, { target: { value: freeEntry.id } });
    expect(within(dialog).getByLabelText("Nome do plano")).toHaveValue(
      freeEntry.name,
    );
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(0);
    fireEvent.change(selector, { target: { value: entry.id } });
    expect(within(dialog).getByLabelText("Nome do plano")).toHaveValue(
      entry.name,
    );
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(400);
    expect(within(dialog).getByLabelText("Sessões")).toHaveValue(10);
    expect(within(dialog).getByLabelText("Serviço")).toHaveValue(service.id);
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "375.55" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() =>
      expect(api.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ name: entry.name, totalValueInCents: 37555 }),
      ),
    );
    expect(entry.totalValueInCents).toBe(40000);
  });

  it("supports a custom sale with an empty catalog", async () => {
    vi.mocked(api.planCatalog).mockResolvedValue([]);
    const dialog = await sale();
    await within(dialog).findByText(/Nenhum plano cadastrado em Configurações/);
    fireEvent.change(within(dialog).getByLabelText("Nome do plano"), {
      target: { value: "Pacote personalizado" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "123.45" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() =>
      expect(api.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Pacote personalizado",
          totalValueInCents: 12345,
        }),
      ),
    );
  });

  it("preserves manual input while retrying a failed catalog load", async () => {
    vi.mocked(api.planCatalog).mockRejectedValueOnce(
      new Error("Falha ao carregar planos"),
    );
    const dialog = await sale();
    await within(dialog).findByText("Falha ao carregar planos");
    fireEvent.change(within(dialog).getByLabelText("Nome do plano"), {
      target: { value: "Pacote manual" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "123.45" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Tentar novamente" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Plano cadastrado"),
      ).not.toBeDisabled(),
    );
    expect(within(dialog).getByLabelText("Nome do plano")).toHaveValue(
      "Pacote manual",
    );
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(123.45);
    expect(
      within(dialog).queryByText("Falha ao carregar planos"),
    ).not.toBeInTheDocument();
  });

  it("keeps sold terms on renewal until another catalog entry is explicitly selected", async () => {
    vi.spyOn(api, "plans").mockResolvedValue([sold]);
    vi.spyOn(api, "renewPlan").mockImplementation(async (_id, input) => ({
      ...sold,
      ...input,
      autoRenew: Boolean(input.autoRenew),
      validUntil: input.validUntil || "",
      id: "renewed",
      renewedFromPlanId: sold.id,
    }));
    page("/planos");
    fireEvent.click(await screen.findByRole("button", { name: "Renovar" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Plano cadastrado"),
      ).not.toBeDisabled(),
    );
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(350);
    expect(within(dialog).getByLabelText("Plano cadastrado")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: entry.id },
    });
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(400);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Renovar plano e gerar parcelas",
      }),
    );
    await waitFor(() =>
      expect(api.renewPlan).toHaveBeenCalledWith(
        sold.id,
        expect.objectContaining({ name: entry.name, totalValueInCents: 40000 }),
      ),
    );
  });
});

describe("catalog settings", () => {
  it("loads on opening and creates, edits and removes catalog entries", async () => {
    vi.mocked(api.planCatalog).mockResolvedValue([]);
    vi.spyOn(api, "createPlanCatalogEntry").mockResolvedValue(entry);
    vi.spyOn(api, "updatePlanCatalogEntry").mockResolvedValue({
      ...entry,
      name: "Pilates mensal",
      totalValueInCents: 42055,
    });
    vi.spyOn(api, "deletePlanCatalogEntry").mockResolvedValue(undefined);
    page("/configuracoes");
    const toggle = await screen.findByRole("button", {
      name: "Planos",
    });
    expect(api.planCatalog).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    const section = toggle.closest("section")!;
    fireEvent.click(
      await within(section).findByRole("button", { name: "Adicionar plano" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await within(dialog).findByText(
      "Informe um nome entre 3 e 120 caracteres.",
    );
    fireEvent.change(within(dialog).getByLabelText("Nome do plano"), {
      target: { value: entry.name },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "400" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    fireEvent.click(
      await within(section).findByRole("button", {
        name: `Editar plano ${entry.name}`,
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome do plano"), {
      target: { value: "Pilates mensal" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "420.55" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    fireEvent.click(
      await within(section).findByRole("button", {
        name: "Excluir plano Pilates mensal",
      }),
    );
    dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /Os planos já vendidos e suas parcelas serão preservados/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Excluir plano",
      }),
    );
    await within(section).findByText("Nenhum plano configurado");
    expect(api.createPlanCatalogEntry).toHaveBeenCalledWith({
      name: entry.name,
      totalValueInCents: 40000,
    });
    expect(api.updatePlanCatalogEntry).toHaveBeenCalledWith(entry.id, {
      name: "Pilates mensal",
      totalValueInCents: 42055,
    });
    expect(api.deletePlanCatalogEntry).toHaveBeenCalledWith(entry.id);
  });

  it("shows the catalog read-only for settings viewers", async () => {
    vi.mocked(api.me).mockRestore();
    session(["settings.view"]);
    const section = await settings();
    await within(section).findByText(entry.name);
    expect(
      within(section).queryByRole("button", { name: "Adicionar plano" }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: /Editar plano/ }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: /Excluir plano/ }),
    ).not.toBeInTheDocument();
  });

  it("allows an edit-only permission and keeps input on failed save", async () => {
    vi.mocked(api.me).mockRestore();
    session(["settings.view", "settings.plans_update"]);
    vi.spyOn(api, "updatePlanCatalogEntry")
      .mockRejectedValueOnce(new Error("Falha ao salvar plano"))
      .mockResolvedValue({ ...entry, totalValueInCents: 45000 });
    const section = await settings();
    fireEvent.click(
      await within(section).findByRole("button", {
        name: `Editar plano ${entry.name}`,
      }),
    );
    expect(
      within(section).queryByRole("button", { name: "Adicionar plano" }),
    ).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "450" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await within(dialog).findByText("Falha ao salvar plano");
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue(450);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
