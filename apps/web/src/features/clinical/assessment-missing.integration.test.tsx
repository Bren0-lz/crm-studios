import type { AssessmentTemplate, ClinicalAssessment } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import "../../test-support/legacy-setup";
import { ClinicalAssessmentModal } from "./ClinicalAssessmentModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

const patientId = "99999999-9999-4999-8999-999999999999";
const clinicId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const template: AssessmentTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  version: 1,
  active: true,
  createdAt: "2040-01-01T12:00:00.000Z",
  status: "published",
  name: "Avaliação postural",
  specialty: "Pilates",
  fields: [
    { key: "queixa", label: "Queixa principal", type: "text", required: true },
    {
      key: "dor",
      label: "Sente dor",
      type: "boolean",
      required: true,
    },
    { key: "extra", label: "Observação livre", type: "text", required: false },
  ],
};

function renderModal(
  templates: AssessmentTemplate[],
  assessments: ClinicalAssessment[] = [],
  onSaved = () => undefined,
) {
  render(
    <AuthorizationContext.Provider value={authorization}>
      <ClinicalAssessmentModal
        patientId={patientId}
        templates={templates}
        assessments={assessments}
        onClose={() => undefined}
        onSaved={onSaved}
      />
    </AuthorizationContext.Provider>,
  );
  return screen.getByRole("dialog", { name: "Registrar avaliação" });
}

describe("clinical assessment (QM14)", () => {
  it("keeps 'Registrar avaliação' disabled listing the required fields of the template", () => {
    const dialog = renderModal([template]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Preencher formulário" }),
    );
    const register = within(dialog).getByRole("button", {
      name: "Registrar avaliação",
    });
    expect(register).toBeDisabled();
    expect(register).toHaveAccessibleDescription(
      "Falta: Queixa principal, Sente dor.",
    );
    fireEvent.change(within(dialog).getByLabelText("Queixa principal"), {
      target: { value: "Dor lombar" },
    });
    expect(register).toHaveAccessibleDescription("Falta: Sente dor.");
    fireEvent.click(
      within(
        within(dialog).getByRole("group", { name: "Sente dor" }),
      ).getByLabelText("Não"),
    );
    expect(register).toBeEnabled();
    expect(register).not.toHaveAttribute("aria-describedby");
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });

  it("asks for a template when none is published", () => {
    const dialog = renderModal([]);
    const next = within(dialog).getByRole("button", {
      name: "Preencher formulário",
    });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription("Falta: Formulário.");
    expect(
      within(dialog).getByText("Nenhum modelo de avaliação"),
    ).toBeInTheDocument();
  });
});

describe("registrar avaliação com histórico", () => {
  const anamneseV1: AssessmentTemplate = {
    ...template,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Anamnese",
    specialty: "Fisioterapia",
    fields: [
      {
        key: "objetivo",
        label: "Objetivo",
        type: "long_text",
        required: false,
      },
      {
        key: "peso",
        label: "Peso",
        type: "number",
        unit: "kg",
        required: false,
      },
    ],
  };
  const anamneseV2: AssessmentTemplate = {
    ...anamneseV1,
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    familyId: anamneseV1.id,
    version: 2,
    fields: [
      ...anamneseV1.fields,
      { key: "sono", label: "Sono", type: "text", required: false },
    ],
  };
  const draft: AssessmentTemplate = {
    ...template,
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "Rascunho",
    status: "draft",
  };
  const archived: AssessmentTemplate = {
    ...template,
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "Arquivado",
    active: false,
  };
  const history: ClinicalAssessment[] = [
    {
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId,
      patientId,
      templateId: anamneseV1.id,
      templateName: "Anamnese",
      authorName: "Ana Martins",
      createdAt: "2026-09-10T13:00:00.000Z",
      values: { objetivo: "Voltar a correr", peso: 70 },
    },
    {
      id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId,
      patientId,
      templateId: anamneseV1.id,
      templateName: "Anamnese",
      authorName: "Paulo Nunes",
      createdAt: "2026-10-01T13:00:00.000Z",
      values: { objetivo: "Correr 5 km" },
    },
  ];

  it("lists only the latest published forms and shows the previous answers while filling", async () => {
    const posts: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "x" }),
      } as Response;
    });
    const onSaved = vi.fn();
    const dialog = renderModal(
      [anamneseV1, anamneseV2, draft, archived, template],
      history,
      onSaved,
    );
    const picker = within(dialog).getByRole("group", { name: "Formulário" });
    expect(
      within(picker)
        .getAllByRole("radio")
        .map(
          (radio) =>
            radio.closest("label")?.querySelector("strong")?.textContent,
        ),
    ).toEqual(["Anamnese", "Avaliação postural"]);
    expect(picker).toHaveTextContent(
      /preenchida 2 vezes, a última em 01 de out/,
    );
    expect(picker).toHaveTextContent("ainda não preenchida para este cliente");
    fireEvent.click(within(picker).getByLabelText(/Anamnese/));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Preencher formulário" }),
    );

    expect(dialog).toHaveTextContent(
      /Última avaliação deste tipo em 01 de out\. por Paulo Nunes/,
    );
    const objetivo = within(dialog).getByLabelText("Objetivo");
    expect(objetivo).toHaveAccessibleDescription(
      "Anterior · 01 de out.: Correr 5 km",
    );
    // Resposta em branco na mais recente: mostra a última preenchida.
    expect(
      within(dialog).getByLabelText("Peso (kg)"),
    ).toHaveAccessibleDescription("Anterior · 10 de set.: 70 kg");
    expect(objetivo).toHaveValue("");
    fireEvent.click(
      within(dialog).getByLabelText("Mostrar respostas anteriores"),
    );
    expect(objetivo).not.toHaveAccessibleDescription();

    fireEvent.change(objetivo, { target: { value: "Correr 10 km" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar avaliação" }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    // A nova avaliação usa a versão atual do modelo e só envia o que foi preenchido.
    expect(posts).toEqual([
      {
        patientId,
        templateId: anamneseV2.id,
        values: { objetivo: "Correr 10 km" },
        notes: "",
      },
    ]);
  });
});
