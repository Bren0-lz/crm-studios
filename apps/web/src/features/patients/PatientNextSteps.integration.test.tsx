import {
  effectivePermissions,
  permissionEditModules,
  permissionModules,
  type Appointment,
  type GroupClass,
  type GroupEnrollment,
  type Patient,
  type PatientPlan,
  type PermissionKey,
  type PlanTemplate,
  type UserSummary,
} from "@crm/contracts";
import {
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
import { api, ApiClientError } from "../../api";

const clinicId = "11111111-1111-4111-8111-111111111111";
const serviceId = "77777777-7777-4777-8777-777777777777";
const otherServiceId = "88888888-8888-4888-8888-888888888888";
const professionalId = "33333333-3333-4333-8333-333333333333";
const roomId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-10-10T12:00:00Z";
const patient: Patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId,
  fullName: "Nova Cliente",
  phone: "11999998888",
  tags: [],
  recordNumber: "CLI-0100",
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const template: PlanTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates mensal",
  planType: "monthly",
  kind: "recurring",
  services: [
    {
      serviceId,
      totalSessions: 8,
      totalValueInCents: 16000,
      sessionsPerWeek: 2,
    },
  ],
  totalValueInCents: 16000,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const plan: PatientPlan = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  clinicId,
  patientId: patient.id,
  patientName: patient.fullName,
  name: template.name,
  planTemplateId: template.id,
  kind: "recurring",
  serviceId,
  serviceName: "Pilates",
  totalSessions: 8,
  remainingSessions: 8,
  services: [
    {
      serviceId,
      serviceName: "Pilates",
      totalSessions: 8,
      remainingSessions: 8,
      totalValueInCents: 16000,
    },
  ],
  validFrom: "2026-10-10",
  validUntil: "2026-11-09",
  totalValueInCents: 16000,
  installments: 3,
  firstDueDate: "2026-10-10",
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
  serviceId,
  serviceName: "Pilates",
  professionalId,
  professionalName: "Dra. Ana",
  roomId,
  roomName: "Sala Movimento",
  weeklySlots: [{ weekday: 1, startTime: "09:00", endTime: "09:50" }],
  capacity: 4,
  activeEnrollments: 2,
  waitlistCount: 0,
  active: true,
  createdAt: timestamp,
};
const enrollment: GroupEnrollment = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  clinicId,
  patientId: patient.id,
  patientName: patient.fullName,
  groupId: group.id,
  status: "active",
  enrolledAt: timestamp,
  updatedAt: timestamp,
};
const appointment: Appointment = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  clinicId,
  patientId: patient.id,
  patientName: patient.fullName,
  professionalId,
  professionalName: "Dra. Ana",
  professionalColor: "#276749",
  roomId,
  roomName: "Sala Movimento",
  serviceId,
  serviceName: "Pilates",
  visitType: "evaluation",
  startsAt: "2035-10-10T12:00:00Z",
  endsAt: "2035-10-10T12:50:00Z",
  status: "scheduled",
  createdAt: timestamp,
  updatedAt: timestamp,
};

function session(permissions?: PermissionKey[]) {
  const chosen = permissions ?? effectivePermissions("admin");
  const user: UserSummary = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Usuária",
    email: "test@local.test",
    role: permissions ? "user" : "admin",
    permissions: chosen,
    modules: permissionModules(chosen),
    editModules: permissionEditModules(chosen),
  };
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem("crm.auth.user", JSON.stringify(user));
  vi.spyOn(api, "me").mockResolvedValue(user);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    ),
  );
  vi.spyOn(api, "patients").mockResolvedValue([]);
  vi.spyOn(api, "patientTags").mockResolvedValue([]);
  vi.spyOn(api, "patientTimeline").mockResolvedValue([]);
  vi.spyOn(api, "createPatient").mockResolvedValue(patient);
  vi.spyOn(api, "updatePatient").mockResolvedValue(patient);
  vi.spyOn(api, "createPlan").mockResolvedValue(plan);
  vi.spyOn(api, "planTemplates").mockResolvedValue([template]);
  vi.spyOn(api, "services").mockResolvedValue([
    {
      id: serviceId,
      clinicId,
      name: "Pilates",
      active: true,
      durationMinutes: 50,
      priceInCents: 16000,
      color: "#276749",
    },
    {
      id: otherServiceId,
      clinicId,
      name: "Avaliação",
      active: true,
      durationMinutes: 50,
      priceInCents: 12000,
      color: "#276749",
    },
  ]);
  vi.spyOn(api, "professionals").mockResolvedValue([
    {
      id: professionalId,
      clinicId,
      fullName: "Dra. Ana",
      crefito: "12345",
      specialty: "Pilates",
      color: "#276749",
      active: true,
    },
  ]);
  vi.spyOn(api, "rooms").mockResolvedValue([
    { id: roomId, clinicId, name: "Sala Movimento", capacity: 4, active: true },
  ]);
  vi.spyOn(api, "groupWorkspace").mockResolvedValue({
    groups: [group],
    enrollments: [],
    sessions: [],
    attendance: [],
    replacementCredits: [],
  });
  vi.spyOn(api, "createGroupEnrollment").mockResolvedValue(enrollment);
  vi.spyOn(api, "createAppointment").mockResolvedValue(appointment);
  vi.spyOn(api, "createRecurringAppointments").mockResolvedValue([appointment]);
  vi.spyOn(api, "appointments").mockResolvedValue([]);
  vi.spyOn(api, "groupSessions").mockResolvedValue([]);
  vi.spyOn(api, "scheduleBlocks").mockResolvedValue([]);
  vi.spyOn(api, "holidays").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function openCreation(permissions?: PermissionKey[]) {
  session(permissions);
  render(
    <MemoryRouter initialEntries={["/clientes"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Novo cliente" }));
  const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
  fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
    target: { value: patient.fullName },
  });
  const contact = within(dialog).getByRole("group", { name: /^Contato$/ });
  fireEvent.change(within(contact).getByLabelText("Telefone"), {
    target: { value: patient.phone },
  });
  return dialog;
}
async function createClient(permissions?: PermissionKey[]) {
  const dialog = await openCreation(permissions);
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Salvar cliente" }),
  );
  return screen.findByRole("dialog", { name: "Cliente cadastrado" });
}
async function openPlan() {
  fireEvent.click(screen.getByRole("button", { name: "Vincular a plano" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Vincular a plano",
  });
  const selector = await within(dialog).findByLabelText("Plano cadastrado");
  await within(dialog).findByRole("option", { name: /Pilates mensal/ });
  fireEvent.change(selector, { target: { value: template.id } });
  return dialog;
}
async function savePlan(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
  );
  return screen.findByRole("dialog", { name: "Cliente cadastrado" });
}
async function openAppointment() {
  fireEvent.click(screen.getByRole("button", { name: "Agendar atendimento" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Agendar atendimento",
  });
  const type = await within(dialog).findByLabelText("Tipo");
  fireEvent.change(type, { target: { value: "evaluation" } });
  for (const [label, value] of [
    ["Profissional", professionalId],
    ["Sala", roomId],
    ["Serviço", serviceId],
  ])
    fireEvent.change(within(dialog).getByLabelText(label!), {
      target: { value },
    });
  fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
  fireEvent.click(
    dialog.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Fechar calendário" }),
  );
  fireEvent.change(within(dialog).getByLabelText("Horário"), {
    target: { value: "09:00" },
  });
  return dialog;
}
async function saveAppointment(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirmar atendimento" }),
  );
  return screen.findByRole("dialog", { name: "Cliente cadastrado" });
}

describe("client next steps", () => {
  it("saves once, updates the list and completes without loading other actions", async () => {
    const hub = await createClient();
    expect(within(hub).getByText(patient.fullName)).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: `Editar ${patient.fullName}` }),
    ).toBeInTheDocument();
    expect(api.createPatient).toHaveBeenCalledTimes(1);
    for (const action of [
      api.planTemplates,
      api.services,
      api.professionals,
      api.rooms,
      api.groupWorkspace,
    ])
      expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(hub).getByRole("button", { name: "Concluir" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Novo cliente" }),
      ).toHaveFocus(),
    );
  });

  it.each(["plan-first", "appointment-first"])(
    "completes both actions in either order: %s",
    async (order) => {
      await createClient();
      if (order === "plan-first") {
        await savePlan(await openPlan());
        await saveAppointment(await openAppointment());
      } else {
        await saveAppointment(await openAppointment());
        await savePlan(await openPlan());
      }
      const hub = screen.getByRole("dialog", { name: "Cliente cadastrado" });
      expect(within(hub).getByText("Plano vinculado")).toBeInTheDocument();
      expect(within(hub).getByText("Atendimento agendado")).toBeInTheDocument();
      expect(within(hub).getByText(/Pilates · .* às/)).toBeInTheDocument();
      expect(
        within(hub).queryByRole("button", { name: "Vincular a plano" }),
      ).not.toBeInTheDocument();
      expect(
        within(hub).queryByRole("button", { name: "Agendar atendimento" }),
      ).not.toBeInTheDocument();
      expect(api.createPatient).toHaveBeenCalledTimes(1);
      expect(api.createPlan).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          patientId: patient.id,
          planTemplateId: template.id,
        }),
      );
      expect(api.createAppointment).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          patientId: patient.id,
          visitType: "evaluation",
        }),
      );
      expect(api.createGroupEnrollment).not.toHaveBeenCalled();
    },
  );

  it("uses a fixed client, filters compatible groups and clears incompatible selections", async () => {
    const otherTemplate = {
      ...template,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "Plano de avaliação",
      services: [
        {
          serviceId: otherServiceId,
          totalSessions: 2,
          totalValueInCents: 16000,
        },
      ],
    };
    vi.mocked(api.planTemplates).mockResolvedValue([
      template,
      otherTemplate,
      {
        ...otherTemplate,
        id: "aa000000-0000-4000-8000-000000000001",
        name: "Plano avulso",
        planType: "single",
        kind: "single",
      },
    ]);
    vi.mocked(api.groupWorkspace).mockResolvedValue({
      groups: [
        group,
        {
          ...group,
          id: "aa000000-0000-4000-8000-000000000002",
          name: "Turma avaliação",
          serviceId: otherServiceId,
        },
        {
          ...group,
          id: "aa000000-0000-4000-8000-000000000003",
          name: "Turma inativa",
          active: false,
        },
      ],
      enrollments: [],
      sessions: [],
      attendance: [],
      replacementCredits: [],
    });
    await createClient();
    const dialog = await openPlan();
    expect(
      within(dialog).queryByRole("combobox", { name: "Cliente" }),
    ).not.toBeInTheDocument();
    const groupSelect = await within(dialog).findByLabelText("Turma");
    await within(dialog).findByRole("option", {
      name: /Pilates 01 · Dra. Ana · Seg 09:00–09:50 · 2 vagas/,
    });
    expect(groupSelect).toHaveValue("");
    expect(
      within(dialog).queryByRole("option", {
        name: /Turma avaliação|Turma inativa/,
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(groupSelect, { target: { value: group.id } });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: otherTemplate.id },
    });
    expect(groupSelect).toHaveValue("");
    expect(
      within(dialog).queryByRole("option", { name: /Pilates 01/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: "aa000000-0000-4000-8000-000000000001" },
    });
    expect(within(dialog).queryByLabelText("Turma")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    const appointmentDialog = await openAppointment();
    expect(
      within(appointmentDialog).queryByRole("combobox", { name: "Cliente" }),
    ).not.toBeInTheDocument();
    expect(
      within(appointmentDialog).queryByRole("button", {
        name: "Adicionar cliente",
      }),
    ).not.toBeInTheDocument();
  });

  it.each(["active", "waitlisted"] as const)(
    "shows the actual enrollment outcome: %s",
    async (status) => {
      vi.mocked(api.groupWorkspace).mockResolvedValue({
        groups: [
          { ...group, activeEnrollments: status === "waitlisted" ? 4 : 2 },
        ],
        enrollments: [],
        sessions: [],
        attendance: [],
        replacementCredits: [],
      });
      vi.mocked(api.createGroupEnrollment).mockResolvedValue({
        ...enrollment,
        status,
        ...(status === "waitlisted" ? { queuePosition: 3 } : {}),
      });
      await createClient();
      const dialog = await openPlan();
      await within(dialog).findByRole("option", { name: /Pilates 01/ });
      fireEvent.change(within(dialog).getByLabelText("Turma"), {
        target: { value: group.id },
      });
      if (status === "waitlisted")
        expect(
          within(dialog).getByText(/Esta turma está cheia/),
        ).toBeInTheDocument();
      const hub = await savePlan(dialog);
      expect(
        within(hub).getByText(
          status === "active"
            ? "Matriculado na turma Pilates 01"
            : "Na lista de espera de Pilates 01 · posição 3",
        ),
      ).toBeInTheDocument();
      expect(api.createGroupEnrollment).toHaveBeenCalledExactlyOnceWith({
        patientId: patient.id,
        groupId: group.id,
      });
    },
  );

  it("keeps the plan after an enrollment failure and retries only enrollment after returning", async () => {
    vi.mocked(api.createGroupEnrollment).mockRejectedValueOnce(
      new Error("Turma temporariamente indisponível"),
    );
    await createClient();
    const dialog = await openPlan();
    await within(dialog).findByRole("option", { name: /Pilates 01/ });
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    const recovery = await screen.findByRole("dialog", {
      name: "Concluir matrícula",
    });
    expect(
      within(recovery).getByText(/Plano vinculado; matrícula não concluída/),
    ).toBeInTheDocument();
    expect(
      within(recovery).getByText("Turma temporariamente indisponível"),
    ).toBeInTheDocument();
    fireEvent.click(within(recovery).getByRole("button", { name: "Voltar" }));
    const hub = screen.getByRole("dialog", { name: "Cliente cadastrado" });
    expect(
      within(hub).queryByRole("button", { name: "Vincular a plano" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(hub).getByRole("button", { name: "Retomar matrícula" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Tentar matrícula novamente" }),
    );
    await screen.findByText("Matriculado na turma Pilates 01");
    expect(api.createPlan).toHaveBeenCalledTimes(1);
    expect(api.createPatient).toHaveBeenCalledTimes(1);
    expect(api.createGroupEnrollment).toHaveBeenCalledTimes(2);
  });

  it("can continue without enrollment after a failure", async () => {
    vi.mocked(api.createGroupEnrollment).mockRejectedValue(
      new Error("Falha na matrícula"),
    );
    await createClient();
    const dialog = await openPlan();
    await within(dialog).findByRole("option", { name: /Pilates 01/ });
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Continuar sem turma" }),
    );
    await screen.findByRole("dialog", { name: "Cliente cadastrado" });
    expect(
      screen.queryByRole("button", { name: "Retomar matrícula" }),
    ).not.toBeInTheDocument();
    expect(api.createPlan).toHaveBeenCalledTimes(1);
  });

  it("allows a plan without compatible groups or when the optional group lookup fails", async () => {
    vi.mocked(api.groupWorkspace).mockRejectedValueOnce(
      new Error("Falha de consulta"),
    );
    await createClient();
    const dialog = await openPlan();
    await within(dialog).findByText(/Não foi possível carregar as turmas/);
    vi.mocked(api.groupWorkspace).mockResolvedValue({
      groups: [],
      enrollments: [],
      sessions: [],
      attendance: [],
      replacementCredits: [],
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Tentar carregar turmas" }),
    );
    await within(dialog).findByText(/Nenhuma turma compatível/);
    await savePlan(dialog);
    expect(api.createPlan).toHaveBeenCalledTimes(1);
    expect(api.createGroupEnrollment).not.toHaveBeenCalled();
  });

  it("retries required resources and the catalog independently", async () => {
    vi.mocked(api.services).mockRejectedValueOnce(
      new Error("Serviços indisponíveis"),
    );
    vi.mocked(api.planTemplates).mockRejectedValueOnce(
      new Error("Catálogo indisponível"),
    );
    await createClient();
    fireEvent.click(screen.getByRole("button", { name: "Vincular a plano" }));
    await screen.findByText("Serviços indisponíveis");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Catálogo indisponível");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("option", { name: /Pilates mensal/ });
    expect(api.services).toHaveBeenCalledTimes(2);
    expect(api.planTemplates).toHaveBeenCalledTimes(2);
    expect(api.createPlan).not.toHaveBeenCalled();
  });

  it("keeps fields on plan and appointment save failures", async () => {
    vi.mocked(api.createPlan).mockRejectedValueOnce(
      new Error("Falha ao vincular plano"),
    );
    vi.mocked(api.createAppointment).mockRejectedValueOnce(
      new ApiClientError("Horário ocupado", "APPOINTMENT_CONFLICT", 409),
    );
    await createClient();
    const planDialog = await openPlan();
    fireEvent.change(within(planDialog).getByLabelText("Valor do serviço 1"), {
      target: { value: "150" },
    });
    fireEvent.click(
      within(planDialog).getByRole("button", {
        name: "Criar plano e parcelas",
      }),
    );
    await within(planDialog).findByText("Falha ao vincular plano");
    expect(within(planDialog).getByLabelText("Valor do serviço 1")).toHaveValue(
      "150",
    );
    fireEvent.click(within(planDialog).getByRole("button", { name: "Voltar" }));
    const appointmentDialog = await openAppointment();
    fireEvent.change(within(appointmentDialog).getByLabelText("Observação"), {
      target: { value: "Primeira avaliação" },
    });
    fireEvent.click(
      within(appointmentDialog).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    );
    await within(appointmentDialog).findByText("Horário ocupado");
    expect(within(appointmentDialog).getByLabelText("Observação")).toHaveValue(
      "Primeira avaliação",
    );
    expect(api.createPatient).toHaveBeenCalledTimes(1);
  });

  it.each([
    { permissions: [] as PermissionKey[], plan: false, appointment: false },
    {
      permissions: ["plans.view", "plans.create"] as PermissionKey[],
      plan: true,
      appointment: false,
    },
    {
      permissions: ["agenda.view", "agenda.create"] as PermissionKey[],
      plan: false,
      appointment: true,
    },
  ])("offers only authorized actions: $permissions", async (options) => {
    const hub = await createClient([
      "patients.view",
      "patients.create",
      ...options.permissions,
    ]);
    expect(
      Boolean(within(hub).queryByRole("button", { name: "Vincular a plano" })),
    ).toBe(options.plan);
    expect(
      Boolean(
        within(hub).queryByRole("button", { name: "Agendar atendimento" }),
      ),
    ).toBe(options.appointment);
    if (options.plan) {
      const dialog = await openPlan();
      expect(within(dialog).queryByLabelText("Turma")).not.toBeInTheDocument();
    }
    if (options.appointment) await openAppointment();
    expect(api.groupWorkspace).not.toHaveBeenCalled();
    if (!options.plan) expect(api.planTemplates).not.toHaveBeenCalled();
    if (!options.appointment) {
      expect(api.professionals).not.toHaveBeenCalled();
      expect(api.rooms).not.toHaveBeenCalled();
    }
  });

  it("supports a user allowed to schedule only recurring appointments", async () => {
    await createClient([
      "patients.view",
      "patients.create",
      "agenda.view",
      "agenda.recurring",
    ]);
    const dialog = await openAppointment();
    expect(
      within(dialog).getByLabelText("Repetir este atendimento"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Repetir este atendimento"),
    ).toBeDisabled();
    await saveAppointment(dialog);
    expect(api.createRecurringAppointments).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        patientId: patient.id,
        occurrences: 4,
        intervalWeeks: 1,
      }),
    );
    expect(api.createAppointment).not.toHaveBeenCalled();
  });

  it("blocks repeated submissions, X, Escape and back while saving a plan", async () => {
    let resolve!: (value: PatientPlan) => void;
    vi.mocked(api.createPlan).mockReturnValueOnce(
      new Promise((value) => {
        resolve = value;
      }),
    );
    await createClient();
    const dialog = await openPlan();
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(api.createPlan).toHaveBeenCalledTimes(1);
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Voltar" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    resolve(plan);
    await screen.findByRole("dialog", { name: "Cliente cadastrado" });
  });

  it("blocks repeated client creation and keeps fields after a failure", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(api.createPatient).mockReturnValueOnce(
      new Promise((_, value) => {
        reject = value;
      }),
    );
    const dialog = await openCreation();
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(api.createPatient).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    reject(new Error("CPF já cadastrado"));
    await within(dialog).findByText("CPF já cadastrado");
    expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
      patient.fullName,
    );
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
  });

  it("blocks repeated appointment submissions and closing until the booking finishes", async () => {
    let resolve!: (value: Appointment) => void;
    vi.mocked(api.createAppointment).mockReturnValueOnce(
      new Promise((value) => {
        resolve = value;
      }),
    );
    await createClient();
    const dialog = await openAppointment();
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(api.createAppointment).toHaveBeenCalledTimes(1);
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Voltar" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    resolve(appointment);
    await screen.findByRole("dialog", { name: "Cliente cadastrado" });
  });

  it("blocks repeated enrollment retries and closing without recreating the plan", async () => {
    let resolve!: (value: GroupEnrollment) => void;
    vi.mocked(api.createGroupEnrollment)
      .mockRejectedValueOnce(new Error("Falha na matrícula"))
      .mockReturnValueOnce(
        new Promise((value) => {
          resolve = value;
        }),
      );
    await createClient();
    const dialog = await openPlan();
    await within(dialog).findByRole("option", { name: /Pilates 01/ });
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    const recovery = await screen.findByRole("dialog", {
      name: "Concluir matrícula",
    });
    fireEvent.submit(recovery.querySelector("form")!);
    fireEvent.submit(recovery.querySelector("form")!);
    expect(api.createGroupEnrollment).toHaveBeenCalledTimes(2);
    expect(api.createPlan).toHaveBeenCalledTimes(1);
    expect(
      within(recovery).getByRole("button", { name: "Fechar" }),
    ).toBeDisabled();
    expect(
      within(recovery).getByRole("button", { name: "Continuar sem turma" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(recovery).toBeInTheDocument();
    resolve(enrollment);
    await screen.findByText("Matriculado na turma Pilates 01");
  });

  it("returns to the choice on back, traps focus and closes the flow with Escape", async () => {
    await createClient();
    const dialog = await openPlan();
    expect(within(dialog).getByLabelText("Modelo")).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    const hub = screen.getByRole("dialog", { name: "Cliente cadastrado" });
    const conclude = within(hub).getByRole("button", { name: "Concluir" });
    conclude.focus();
    fireEvent.keyDown(conclude, { key: "Tab" });
    expect(within(hub).getByRole("button", { name: "Fechar" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Editar ${patient.fullName}` }),
    ).toBeInTheDocument();
  });

  it("keeps editing existing clients separate from onboarding", async () => {
    session();
    vi.mocked(api.patients).mockResolvedValue([patient]);
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: `Editar ${patient.fullName}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(api.updatePatient).toHaveBeenCalledExactlyOnceWith(
      patient.id,
      expect.any(Object),
    );
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it("shows missing appointment resources and an empty catalog without losing the client", async () => {
    vi.mocked(api.rooms).mockResolvedValue([]);
    vi.mocked(api.planTemplates).mockResolvedValue([]);
    await createClient();
    fireEvent.click(
      screen.getByRole("button", { name: "Agendar atendimento" }),
    );
    await screen.findByText(/Para agendar, é necessário/);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(screen.getByRole("button", { name: "Vincular a plano" }));
    await screen.findByText(/Nenhum plano ativo cadastrado/);
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeDisabled();
    expect(api.createPatient).toHaveBeenCalledTimes(1);
  });
});
