import {
  effectivePermissions,
  permissionEditModules,
  permissionModules,
  saoPauloToday,
  type ClinicalWorkspace,
  type GroupClass,
  type Patient,
  type PatientPlan,
  type PlanTemplate,
  type Service,
  type UserSummary,
} from "@crm/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { api } from "../../api";

const clinicId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-12T12:00:00Z";
const ana: Patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId,
  fullName: "Ana Azevedo Gomes",
  phone: "11999998888",
  cpf: "12345678909",
  tags: [],
  recordNumber: "CLI-0001",
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const breno: Patient = {
  ...ana,
  id: "88888888-8888-4888-8888-888888888888",
  fullName: "Breno Luiz Silva do Carmo",
  recordNumber: "CLI-0002",
};
const service: Service = {
  id: "77777777-7777-4777-8777-777777777777",
  clinicId,
  name: "Pilates",
  active: true,
  durationMinutes: 50,
  priceInCents: 16000,
  color: "#276749",
};
const template: PlanTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates mensal",
  kind: "recurring",
  totalValueInCents: 16000,
  services: [
    { serviceId: service.id, totalSessions: 8, totalValueInCents: 16000 },
  ],
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const plan: PatientPlan = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  clinicId,
  patientId: ana.id,
  patientName: ana.fullName,
  name: template.name,
  planTemplateId: template.id,
  kind: "recurring",
  serviceId: service.id,
  serviceName: service.name,
  totalSessions: 8,
  remainingSessions: 8,
  services: [
    {
      ...template.services[0]!,
      serviceName: service.name,
      remainingSessions: 8,
    },
  ],
  validFrom: "2026-10-12",
  validUntil: "2026-11-11",
  firstDueDate: "2026-10-12",
  installments: 3,
  totalValueInCents: 16000,
  autoRenew: false,
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const group: GroupClass = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  clinicId,
  name: "Pilates 01",
  sequence: 1,
  serviceId: service.id,
  serviceName: service.name,
  professionalId: "33333333-3333-4333-8333-333333333333",
  professionalName: "Dra. Ana",
  roomId: "55555555-5555-4555-8555-555555555555",
  roomName: "Sala Movimento",
  weeklySlots: [],
  capacity: 4,
  activeEnrollments: 1,
  waitlistCount: 0,
  active: true,
  createdAt: timestamp,
};

function workspace(patient: Patient): ClinicalWorkspace {
  return {
    patient,
    records: [],
    templates: [],
    assessments: [],
    goals: [
      {
        id: `goal-${patient.id}`,
        clinicId,
        patientId: patient.id,
        title: `Objetivo de ${patient.fullName}`,
        status: "active",
        authorName: "Dra. Ana",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    measurements: [],
    closures: [],
    attachments: [],
    addenda: [],
  };
}

beforeEach(() => {
  const permissions = effectivePermissions("admin");
  const user: UserSummary = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Admin",
    email: "admin@test.local",
    role: "admin",
    permissions,
    modules: permissionModules(permissions),
    editModules: permissionEditModules(permissions),
  };
  localStorage.setItem("crm.auth.token", "token");
  localStorage.setItem("crm.auth.user", JSON.stringify(user));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    ),
  );
  vi.spyOn(api, "me").mockResolvedValue(user);
  vi.spyOn(api, "patientOptions").mockImplementation(async (term) =>
    term ? [breno] : [ana],
  );
  vi.spyOn(api, "patientTags").mockResolvedValue([]);
  vi.spyOn(api, "services").mockResolvedValue([service]);
  vi.spyOn(api, "professionals").mockResolvedValue([]);
  vi.spyOn(api, "rooms").mockResolvedValue([]);
  vi.spyOn(api, "plans").mockResolvedValue([plan]);
  vi.spyOn(api, "planTemplates").mockResolvedValue([template]);
  vi.spyOn(api, "createPlan").mockResolvedValue({
    ...plan,
    patientId: breno.id,
    patientName: breno.fullName,
  });
  vi.spyOn(api, "communications").mockResolvedValue({
    deliveryMode: "outbox_only",
    messages: [],
    preferences: [],
  });
  vi.spyOn(api, "documentTemplates").mockResolvedValue([
    {
      id: template.id,
      clinicId,
      name: "Contrato padrão",
      kind: "contract",
      body: "Contrato para {{paciente_nome}}",
      version: 1,
      active: true,
      createdAt: timestamp,
    },
  ]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "groupWorkspace").mockResolvedValue({
    groups: [group],
    enrollments: [],
    sessions: [],
    attendance: [],
    replacementCredits: [],
  });
  vi.spyOn(api, "clinicalRecords").mockResolvedValue([]);
  vi.spyOn(api, "clinicalAppointmentOptions").mockResolvedValue([]);
  vi.spyOn(api, "clinicalWorkspace").mockImplementation(async (id) =>
    workspace(id === ana.id ? ana : breno),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function page(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
async function selectBreno(container: HTMLElement, term = "123.456.789-09") {
  const input = within(container).getByRole("combobox", { name: "Cliente" });
  fireEvent.change(input, { target: { value: term } });
  fireEvent.click(
    await within(container).findByRole("option", { name: breno.fullName }),
  );
  expect(api.patientOptions).toHaveBeenCalledWith(term);
  return input;
}

describe("searchable client selection across modules", () => {
  it("creates a plan for the explicitly selected search result", async () => {
    page("/planos");
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog", { name: "Novo plano" });
    const save = within(dialog).getByRole("button", {
      name: "Criar plano e parcelas",
    });
    expect(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("");
    const catalog = await within(dialog).findByLabelText("Plano cadastrado");
    await within(dialog).findByRole("option", { name: /Pilates mensal/ });
    fireEvent.change(catalog, { target: { value: template.id } });
    expect(save).toBeDisabled();
    await selectBreno(dialog, "Breno");
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: breno.id }),
      ),
    );
  });

  it("clears a linked contract plan on client edits and issues for the new selection", async () => {
    const create = vi.spyOn(api, "createDocument");
    page("/contratos");
    const save = await screen.findByRole("button", { name: "Criar rascunho" });
    expect(save).toBeDisabled();
    const input = screen.getByRole("combobox", { name: "Cliente" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: ana.fullName }));
    const linked = screen.getByLabelText("Plano vinculado");
    fireEvent.change(linked, { target: { value: plan.id } });
    expect(linked).toHaveValue(plan.id);
    fireEvent.change(input, { target: { value: "Breno" } });
    expect(linked).toHaveValue("");
    expect(save).toBeDisabled();
    await selectBreno(document.body);
    fireEvent.click(save);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: breno.id }),
      ),
    );
    expect(create.mock.calls[0]![0]).not.toHaveProperty("planId");
  });

  it("requires a valid client for messages and preferences and retains remote selection after reload", async () => {
    const queue = vi.spyOn(api, "queueMessage");
    page("/comunicacoes");
    const panel = (
      await screen.findByRole("heading", { name: "Adicionar à fila" })
    ).closest("section")!;
    const save = within(panel).getByRole("button", {
      name: "Adicionar à fila",
    });
    const preference = within(panel).getByLabelText("WhatsApp permitido");
    expect(preference).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText("Mensagem administrativa"), {
      target: { value: "Olá, seu plano está pronto." },
    });
    expect(save).toBeDisabled();
    const input = await selectBreno(panel);
    expect(preference).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(queue).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: breno.id }),
      ),
    );
    await screen.findByText("Mensagem adicionada à fila com segurança.");
    expect(input).toHaveValue(breno.fullName);
    fireEvent.change(input, { target: { value: "Outro" } });
    expect(preference).toBeDisabled();
    expect(save).toBeDisabled();
  });

  it("enrolls the chosen search result and preserves the client supplied by a shortcut", async () => {
    const enroll = vi.spyOn(api, "createGroupEnrollment");
    page("/turmas");
    fireEvent.click(
      await screen.findByRole("button", { name: "Matricular cliente" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    const save = within(dialog).getByRole("button", { name: "Matricular" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    await selectBreno(dialog);
    fireEvent.click(save);
    await waitFor(() =>
      expect(enroll).toHaveBeenCalledWith({
        patientId: breno.id,
        groupId: group.id,
        startsOn: saoPauloToday(),
      }),
    );
    cleanup();
    page(`/turmas?matricular=${ana.id}`);
    const shortcut = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    await waitFor(() =>
      expect(
        within(shortcut).getByRole("combobox", { name: "Cliente" }),
      ).toHaveValue(ana.fullName),
    );
  });

  it("clears the clinical workspace and ignores results for a previous client", async () => {
    let finishOld!: (data: ClinicalWorkspace) => void;
    vi.mocked(api.clinicalWorkspace).mockImplementation((id) =>
      id === ana.id
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve(workspace(breno)),
    );
    page("/prontuarios");
    const input = await screen.findByRole("combobox", { name: "Cliente" });
    expect(input).toHaveValue(ana.fullName);
    fireEvent.change(input, { target: { value: "12345678909" } });
    expect(
      screen.getByText(/Busque e selecione um cliente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nova avaliação" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("option", { name: breno.fullName }),
    );
    await waitFor(() =>
      expect(api.clinicalWorkspace).toHaveBeenCalledWith(breno.id),
    );
    await screen.findAllByText(`Objetivo de ${breno.fullName}`);
    await act(async () => {
      finishOld(workspace(ana));
    });
    expect(
      screen.queryByText(`Objetivo de ${ana.fullName}`),
    ).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(
      screen.queryByText(`Objetivo de ${breno.fullName}`),
    ).not.toBeInTheDocument();
    expect(api.clinicalWorkspace).not.toHaveBeenCalledWith("");
  });
});
