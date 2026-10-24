import {
  documentContentFromText,
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
import { installDocumentBrowserMocks } from "../../test-support/document-editor";

vi.mock("../contracts/document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
}));

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
    alerts: [],
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
    term === ana.fullName ? [ana] : term ? [breno] : [ana],
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
  vi.spyOn(api, "communicationPreferences").mockResolvedValue([]);
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
    installDocumentBrowserMocks();
    const snapshotBody = `Contrato para ${breno.fullName}. Condições combinadas.`;
    const snapshotContent = documentContentFromText(snapshotBody);
    const branding = {
      name: "Studios Aryana",
      logoDataUrl: "",
      timezone: "America/Sao_Paulo",
    };
    vi.spyOn(api, "previewDocument").mockResolvedValue({
      snapshotBody,
      snapshotContent,
      branding,
      missingFields: [],
      templateName: "Contrato padrão",
      templateVersion: 1,
      patientName: breno.fullName,
    });
    const create = vi
      .spyOn(api, "createDocument")
      .mockImplementation(async (input) => ({
        ...input,
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        clinicId,
        snapshotBody,
        snapshotContent,
        branding,
        templateName: "Contrato padrão",
        templateVersion: 1,
        patientName: breno.fullName,
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
    page("/contratos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    const save = await screen.findByRole("button", {
      name: "Preparar conteúdo",
    });
    expect(save).toBeDisabled();
    const input = screen.getByRole("combobox", { name: "Cliente" });
    fireEvent.change(input, {
      target: { value: ana.fullName },
    });
    fireEvent.click(await screen.findByRole("option", { name: ana.fullName }));
    const linked = screen.getByLabelText("Plano vinculado");
    fireEvent.change(linked, { target: { value: plan.id } });
    expect(linked).toHaveValue(plan.id);
    fireEvent.change(input, { target: { value: "Breno" } });
    expect(linked).toHaveValue("");
    expect(save).toBeDisabled();
    await selectBreno(document.body);
    fireEvent.click(save);
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: breno.id }),
      ),
    );
    expect(create.mock.calls[0]![0]).not.toHaveProperty("planId");
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

  it("opens the chosen client's chart and ignores results for a previous client", async () => {
    let finishOld!: (data: ClinicalWorkspace) => void;
    vi.mocked(api.clinicalWorkspace).mockImplementation((id) =>
      id === ana.id
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve(workspace(breno)),
    );
    vi.mocked(api.patientOptions).mockResolvedValue([ana, breno]);
    page("/prontuarios");
    const search = await screen.findByRole("searchbox", {
      name: "Buscar cliente",
    });
    // Nenhum prontuário abre sozinho: a equipe escolhe o cliente na lista.
    expect(api.clinicalWorkspace).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: "breno" } });
    expect(
      screen.queryByRole("button", { name: new RegExp(ana.fullName) }),
    ).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(ana.fullName) }),
    );
    await waitFor(() =>
      expect(api.clinicalWorkspace).toHaveBeenCalledWith(ana.id),
    );
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(breno.fullName) }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: breno.fullName }),
    ).toBeInTheDocument();
    await act(async () => {
      finishOld(workspace(ana));
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: ana.fullName }),
    ).not.toBeInTheDocument();
    expect(api.clinicalWorkspace).not.toHaveBeenCalledWith("");
  });
});
