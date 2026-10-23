import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";
import { isLeadBoardUrl, leadBoardResponse } from "../test-support/lead-board";

describe("action modals instead of browser dialogs", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const writes = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([, options]) => options?.method && options.method !== "GET",
      );

  /** Responde GETs com `bodyFor(url)` (ou []) e escritas com `writeBody(url)` (ou {}). */
  function mockApi(
    bodyFor: (url: string) => unknown,
    writeBody: (url: string) => unknown = () => ({}),
  ) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const body =
        init?.method && init.method !== "GET" ? writeBody(url) : bodyFor(url);
      return {
        ok: true,
        status: 200,
        json: async () => body ?? [],
      } as Response;
    });
  }

  describe("CRM", () => {
    const leadBase = {
      clinicId: "11111111-1111-4111-8111-111111111111",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const lead = {
      ...leadBase,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Bruna Lead",
      stage: "contacted",
    };
    const cardOf = async (name: string) =>
      (await screen.findByRole("heading", { name })).closest(
        "article",
      ) as HTMLElement;

    it("asks the loss reason in a modal and sends it with the stage", async () => {
      mockApi(
        (url) =>
          isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : undefined,
        () => ({ ...lead, stage: "lost", lostReason: "Achou caro" }),
      );
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      let card = await cardOf("Bruna Lead");
      fireEvent.change(within(card).getByRole("combobox"), {
        target: { value: "lost" },
      });
      let dialog = await screen.findByRole("dialog", {
        name: "Marcar lead como perdido",
      });
      expect(
        within(dialog).getByText(/Bruna Lead sai das oportunidades abertas/),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Motivo da perda")).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);
      // Sem confirmar, o lead continua na etapa de antes.
      expect(within(card).getByRole("combobox")).toHaveValue("contacted");

      fireEvent.change(within(card).getByRole("combobox"), {
        target: { value: "lost" },
      });
      dialog = await screen.findByRole("dialog", {
        name: "Marcar lead como perdido",
      });
      fireEvent.change(within(dialog).getByLabelText("Motivo da perda"), {
        target: { value: "   " },
      });
      // Sem motivo, Confirmar fica desativado e diz o que falta (QM14).
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toHaveAccessibleDescription("Falta: Motivo da perda.");
      expect(writes()).toHaveLength(0);
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toHaveClass("danger-button");
      fireEvent.change(within(dialog).getByLabelText("Motivo da perda"), {
        target: { value: " Achou caro " },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(writes()).toHaveLength(1);
      expect(String(writes()[0]![0])).toContain(`/leads/${lead.id}/stage`);
      expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({
        stage: "lost",
        lostReason: "Achou caro",
      });
      card = await cardOf("Bruna Lead");
      expect(within(card).getByText("Achou caro")).toBeInTheDocument();
    });

    it("confirms the conversion of a lead in a modal that explains the effect", async () => {
      const patient = {
        id: "99999999-9999-4999-8999-999999999999",
        fullName: "Bruna Lead",
      };
      mockApi(
        (url) =>
          isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : undefined,
        () => ({
          lead: { ...lead, stage: "won", convertedPatientId: patient.id },
          patient,
          reusedExisting: false,
        }),
      );
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      let dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      expect(
        within(dialog).getByText(/Bruna Lead passa a ser cliente/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Bruna Lead · (11) 98765-4321"),
      ).toBeInTheDocument();
      // Os dados opcionais da conversão (U19) vêm primeiro: o foco abre no CPF.
      expect(within(dialog).getByLabelText("CPF")).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);

      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(writes()).toHaveLength(1);
      expect(String(writes()[0]![0])).toContain(`/leads/${lead.id}/convert`);
      expect(writes()[0]![1]?.method).toBe("POST");
      // Sem dados opcionais preenchidos: campos vazios, que a API ignora.
      expect(
        Object.values(JSON.parse(String(writes()[0]![1]?.body))).every(
          (value) => value === "",
        ),
      ).toBe(true);
    });

    it("keeps the modal open with the API error", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (init?.method === "POST")
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "LEAD_CONFLICT",
              message: "Não foi possível converter este lead.",
            }),
          } as Response;
        return {
          ok: true,
          status: 200,
          json: async () =>
            isLeadBoardUrl(String(input))
              ? leadBoardResponse(String(input), [lead])
              : [],
        } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      expect(
        await within(dialog).findByText(
          "Não foi possível converter este lead.",
        ),
      ).toHaveClass("form-error");
      expect(
        screen.getByRole("dialog", { name: "Converter lead em cliente" }),
      ).toBeInTheDocument();
    });
  });

  it("cancels a plan after a confirmation that shows the effect on installments and sessions", async () => {
    const plan = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi(
      (url) => (url.includes("/plans") ? [plan] : undefined),
      () => ({ ...plan, status: "cancelled" }),
    );
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    let dialog = await screen.findByRole("dialog", { name: "Cancelar plano" });
    expect(
      within(dialog).getByText("Helena Almeida · Mensalidade Pilates"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /parcelas em aberto deste plano são canceladas no Financeiro e as 2 sessões restantes não poderão mais ser usadas/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    dialog = await screen.findByRole("dialog", { name: "Cancelar plano" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(`/plans/${plan.id}/status`);
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({
      status: "cancelled",
    });
  });

  it("finalizes a clinical record after a confirmation saying it cannot be edited anymore", async () => {
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      recordNumber: 12,
    };
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: patient.id,
      professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "draft",
      version: 1,
      authorName: "Aryana Dutra",
      patientName: "Helena Almeida",
      professionalName: "Dra. Ana Martins",
      professionalCrefito: "CREFITO-3 123456-F",
      appointmentStartsAt: new Date().toISOString(),
      subjective: "Relato",
      objective: "Exame",
      assessment: "Evolução positiva",
      plan: "Manter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockApi(
      (url) =>
        url.includes("/clinical-workspace/")
          ? {
              patient,
              records: [record],
              templates: [],
              assessments: [],
              goals: [],
              measurements: [],
              closures: [],
              attachments: [],
              addenda: [],
            }
          : url.includes("/clinical-records")
            ? [record]
            : url.includes("/patients")
              ? [patient]
              : undefined,
      () => ({
        ...record,
        status: "finalized",
        finalizedAt: new Date().toISOString(),
      }),
    );
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Finalizar" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Finalizar evolução",
    });
    expect(
      within(dialog).getByText(/não poderá mais ser editada/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/^Helena Almeida · /)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    dialog = await screen.findByRole("dialog", { name: "Finalizar evolução" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(
      `/clinical-records/${record.id}/finalize`,
    );
    expect(writes()[0]![1]?.method).toBe("POST");
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Finalizar" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("cancels a schedule block after a confirmation with the reason and the time", async () => {
    const at = (hours: number) => {
      const value = new Date();
      value.setHours(hours, 0, 0, 0);
      return value;
    };
    const block = {
      id: "abababab-abab-4bab-8bab-abababababab",
      clinicId: "11111111-1111-4111-8111-111111111111",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana Martins",
      startsAt: at(14).toISOString(),
      endsAt: at(16).toISOString(),
      reason: "Curso externo",
      status: "active",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi(
      (url) => (url.includes("/schedule-blocks?") ? [block] : undefined),
      () => ({ ...block, status: "cancelled" }),
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar bloqueio" }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Cancelar bloqueio",
    });
    expect(within(dialog).getByText(/^Curso externo · /)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /das 14:00 às 16:00 \(Dra\. Ana Martins\), volta a ficar livre/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar bloqueio" }));
    dialog = await screen.findByRole("dialog", { name: "Cancelar bloqueio" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(
      `/schedule-blocks/${block.id}/cancel`,
    );
    expect(writes()[0]![1]?.method).toBe("POST");
    expect(screen.queryByText("Curso externo")).not.toBeInTheDocument();
  });
});
