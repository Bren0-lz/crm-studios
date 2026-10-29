import type { AssessmentTemplate, ClinicalAssessment } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { ChartAssessmentsTab } from "./ChartAssessmentsTab";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "99999999-9999-4999-8999-999999999999";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

function template(
  id: string,
  name: string,
  patch: Partial<AssessmentTemplate> = {},
): AssessmentTemplate {
  return {
    id,
    clinicId,
    name,
    specialty: "Fisioterapia",
    status: "published",
    version: 1,
    active: true,
    createdAt: "2026-09-01T12:00:00.000Z",
    fields: [
      { key: "s1", label: "Vista anterior", type: "section", required: false },
      { key: "cabeca", label: "Cabeça", type: "text", required: false },
      {
        key: "peso",
        label: "Peso",
        type: "number",
        unit: "kg",
        required: false,
      },
    ],
    ...patch,
  };
}

function assessment(
  id: string,
  templateId: string,
  createdAt: string,
  authorName: string,
  values: ClinicalAssessment["values"],
): ClinicalAssessment {
  return {
    id,
    clinicId,
    patientId,
    templateId,
    templateName: "nome antigo",
    authorName,
    createdAt,
    values,
  };
}

describe("aba Avaliações do prontuário", () => {
  const postural = template("a0000000-0000-4000-8000-000000000001", "Postural");
  const posturalV2 = template(
    "a0000000-0000-4000-8000-000000000002",
    "Avaliação postural",
    { familyId: postural.id, version: 2 },
  );
  const anamnese = template(
    "b0000000-0000-4000-8000-000000000001",
    "Anamnese",
    {
      active: false,
      fields: [
        { key: "objetivo", label: "Objetivo", type: "text", required: false },
      ],
    },
  );
  const assessments = [
    assessment("c1", postural.id, "2026-09-05T13:00:00.000Z", "Ana Martins", {
      cabeca: "Anteriorizada",
      peso: 70,
    }),
    assessment("c2", posturalV2.id, "2026-10-10T13:00:00.000Z", "Paulo Nunes", {
      cabeca: "Alinhada",
    }),
    assessment("c3", anamnese.id, "2026-10-01T13:00:00.000Z", "Ana Martins", {
      objetivo: "Correr",
    }),
  ];

  function renderTab() {
    const onNew = vi.fn();
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={authorization}>
          <ChartAssessmentsTab
            assessments={assessments}
            templates={[postural, posturalV2, anamnese]}
            editable
            onNew={onNew}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    return onNew;
  }

  it("separates the history by form type, newest first, keeping every version together", () => {
    const onNew = renderTab();
    expect(
      screen.getByText("3 avaliações registradas em 2 tipos."),
    ).toBeInTheDocument();
    const groups = screen.getAllByRole("region");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Avaliação postural",
      "Anamnese",
    ]);
    const postural = groups[0]!;
    expect(postural).toHaveTextContent("2 avaliações · última em 10 de out.");
    const items = within(postural).getAllByRole("group");
    expect(items[0]).toHaveTextContent("Paulo Nunes · versão 2 do modelo");
    // Respostas com os rótulos e seções do modelo usado no registro.
    expect(items[1]).toHaveTextContent("Vista anterior");
    expect(items[1]).toHaveTextContent(/Cabeça\s*Anteriorizada/);
    expect(items[1]).toHaveTextContent(/Peso\s*70 kg/);
    expect(
      screen.getByRole("link", { name: "Gerenciar modelos" }),
    ).toHaveAttribute("href", "/prontuarios?aba=modelos");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar avaliação" }),
    );
    expect(onNew).toHaveBeenCalled();
  });

  it("filters by type, professional, period and answer text", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Anamnese · 1" }));
    expect(
      screen
        .getAllByRole("region")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["Anamnese"]);
    fireEvent.click(screen.getByRole("button", { name: "Todas · 3" }));

    fireEvent.change(screen.getByLabelText("Profissional"), {
      target: { value: "Paulo Nunes" },
    });
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region")).toHaveTextContent("1 avaliação");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-09-30" },
    });
    expect(screen.getByRole("region")).toHaveTextContent("1 avaliação");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    fireEvent.change(screen.getByLabelText("Buscar nas respostas"), {
      target: { value: "anteriorizada" },
    });
    expect(screen.getByRole("region")).toHaveAccessibleName(
      "Avaliação postural",
    );
    fireEvent.change(screen.getByLabelText("Buscar nas respostas"), {
      target: { value: "nada disso" },
    });
    expect(
      screen.getByText("Nenhuma avaliação com esses filtros."),
    ).toBeInTheDocument();
  });
});

describe("modelos de avaliação na página Prontuários", () => {
  it("lists, archives, duplicates and creates forms like the contract templates", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    let templates: AssessmentTemplate[] = [
      template("d0000000-0000-4000-8000-000000000001", "Anamnese", {
        fields: [
          {
            key: "objetivo",
            label: "Objetivo",
            type: "long_text",
            required: false,
          },
          {
            key: "atividades",
            label: "Pratica atividades físicas?",
            type: "select",
            options: ["Sim", "Não", "Passado"],
            required: false,
          },
        ],
      }),
      template("d0000000-0000-4000-8000-000000000002", "Avaliação postural"),
    ];
    const writes: Array<{ method: string; url: string; body: unknown }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = JSON.parse(String(init?.body));
        writes.push({ method, url, body });
        if (url.endsWith("/status")) {
          const id = url.split("/").at(-2);
          templates = templates.map((item) =>
            item.id === id ? { ...item, active: body.active } : item,
          );
          return {
            ok: true,
            status: 200,
            json: async () => templates.find((item) => item.id === id),
          } as Response;
        }
        const created = {
          ...body,
          id: "d0000000-0000-4000-8000-000000000003",
          clinicId,
          version: 1,
          active: true,
          createdAt: "2026-10-20T12:00:00.000Z",
        };
        templates = [...templates, created];
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      const body = url.includes("/assessment-templates") ? templates : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios?aba=modelos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("tab", { name: "Modelos de avaliação" }),
    ).toHaveAttribute("aria-selected", "true");
    const library = await screen.findByRole("tabpanel", {
      name: "Modelos de avaliação",
    });
    const anamnese = (await within(library).findByText("Anamnese")).closest(
      "li",
    )!;
    expect(anamnese).toHaveTextContent("Fisioterapia · 2 perguntas · versão 1");
    expect(anamnese).toHaveTextContent("Publicado");

    // Prévia mostra o formulário como será preenchido.
    fireEvent.click(
      within(anamnese).getByRole("button", { name: "Visualizar Anamnese" }),
    );
    const preview = screen.getByRole("dialog", { name: "Anamnese" });
    expect(
      within(preview).getByRole("group", {
        name: "Pratica atividades físicas?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(preview).getAllByRole("button", { name: "Fechar" }).at(-1)!,
    );

    // Arquivar tira o modelo da lista (a menos que se peça para mostrar).
    fireEvent.click(
      within(library).getByRole("button", {
        name: "Arquivar Avaliação postural",
      }),
    );
    const confirm = screen.getByRole("dialog", { name: "Arquivar modelo" });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Arquivar modelo" }),
    );
    await screen.findByLabelText("Mostrar arquivados (1)");
    expect(within(library).queryByText("Avaliação postural")).toBeNull();
    expect(writes.at(-1)).toMatchObject({
      method: "PATCH",
      url: expect.stringContaining(
        "/assessment-templates/d0000000-0000-4000-8000-000000000002/status",
      ),
      body: { active: false },
    });
    fireEvent.click(screen.getByLabelText("Mostrar arquivados (1)"));
    expect(
      within(library).getByText("Avaliação postural").closest("li"),
    ).toHaveTextContent("Arquivado");

    // Duplicar abre Criar modelo com uma cópia editável.
    fireEvent.click(
      within(library).getByRole("button", { name: "Duplicar Anamnese" }),
    );
    expect(screen.getByRole("tab", { name: "Criar modelo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const studio = screen.getByRole("tabpanel", { name: "Criar modelo" });
    expect(within(studio).getByLabelText("Nome do modelo")).toHaveValue(
      "Anamnese (cópia)",
    );
    fireEvent.change(within(studio).getByLabelText("Nome do modelo"), {
      target: { value: "Anamnese esportiva" },
    });
    // Trocar de aba com alterações pergunta antes de descartar.
    fireEvent.click(screen.getByRole("tab", { name: "Prontuários" }));
    const unsaved = await screen.findByRole("dialog", {
      name: "Salvar as alterações?",
    });
    expect(unsaved).toHaveTextContent("Modelo de avaliação tem edição");
    fireEvent.click(
      within(unsaved).getByRole("button", { name: "Continuar editando" }),
    );
    expect(screen.getByRole("tab", { name: "Criar modelo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(
      within(studio).getByRole("button", { name: "Publicar modelo" }),
    );
    expect(
      await screen.findByRole("tabpanel", { name: "Modelos de avaliação" }),
    ).toHaveTextContent("Anamnese esportiva");
    expect(writes.at(-1)).toMatchObject({
      method: "POST",
      url: expect.stringContaining("/assessment-templates/drafts"),
      body: {
        name: "Anamnese esportiva",
        status: "published",
        fields: [
          expect.objectContaining({ key: "objetivo" }),
          expect.objectContaining({ key: "atividades" }),
        ],
      },
    });

    // Começar do zero a partir da aba Criar modelo.
    fireEvent.click(screen.getByRole("tab", { name: "Criar modelo" }));
    const blank = screen.getByRole("tabpanel", { name: "Criar modelo" });
    expect(within(blank).getByLabelText("Nome do modelo")).toHaveValue("");
    expect(
      within(blank).getByRole("button", { name: "Publicar modelo" }),
    ).toBeDisabled();
    await within(blank).findByRole("option", { name: "Anamnese" });
    fireEvent.change(within(blank).getByLabelText("Partir de um modelo"), {
      target: { value: "d0000000-0000-4000-8000-000000000001" },
    });
    fireEvent.click(
      within(blank).getByRole("button", { name: "Usar como base" }),
    );
    expect(within(blank).getByLabelText("Nome do modelo")).toHaveValue(
      "Anamnese (cópia)",
    );
    fireEvent.click(
      within(blank).getByRole("button", { name: "Começar do zero" }),
    );
    expect(within(blank).getByLabelText("Nome do modelo")).toHaveValue("");
  });
});
