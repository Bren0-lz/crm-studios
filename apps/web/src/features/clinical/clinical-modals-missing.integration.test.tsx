import type { ClinicalRecord } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import "../../test-support/legacy-setup";
import { ClinicalAddendumModal } from "./ClinicalAddendumModal";
import { ClinicalMeasurementModal } from "./ClinicalMeasurementModal";
import { TherapeuticGoalModal } from "./TherapeuticGoalModal";
import { TreatmentClosureModal } from "./TreatmentClosureModal";

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
const noop = () => undefined;

function mount(modal: ReactNode, title: string) {
  render(
    <AuthorizationContext.Provider value={authorization}>
      {modal}
    </AuthorizationContext.Provider>,
  );
  return screen.getByRole("dialog", { name: title });
}

function type(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), {
    target: { value },
  });
}

// Botão principal desativado com "Falta: …" ligado por aria-describedby (QM14).
function expectMissing(button: HTMLElement, text: string) {
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(text);
}
function expectComplete(dialog: HTMLElement, button: HTMLElement) {
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute("aria-describedby");
  expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
}

describe("clinical modals list what is missing (QM14)", () => {
  it("therapeutic goal", () => {
    const dialog = mount(
      <TherapeuticGoalModal
        patientId={patientId}
        onClose={noop}
        onSaved={noop}
      />,
      "Novo objetivo terapêutico",
    );
    const save = within(dialog).getByRole("button", {
      name: "Salvar objetivo",
    });
    expectMissing(save, "Falta: Objetivo.");
    type(dialog, "Objetivo", "Subir escadas sem dor");
    expectComplete(dialog, save);
  });

  it("treatment closure", () => {
    const dialog = mount(
      <TreatmentClosureModal
        patientId={patientId}
        onClose={noop}
        onSaved={noop}
      />,
      "Encerramento do tratamento",
    );
    const save = within(dialog).getByRole("button", {
      name: "Registrar encerramento",
    });
    expectMissing(save, "Falta: Resumo clínico (pelo menos 10 caracteres).");
    type(dialog, "Resumo clínico", "Curto");
    expectMissing(save, "Falta: Resumo clínico (pelo menos 10 caracteres).");
    type(dialog, "Resumo clínico", "Alta com ganho funcional completo");
    expectComplete(dialog, save);
  });

  it("clinical addendum", () => {
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentStartsAt: "2040-06-01T12:00:00.000Z",
      professionalName: "Dra. Ana Martins",
    } as ClinicalRecord;
    const dialog = mount(
      <ClinicalAddendumModal
        records={[record]}
        onClose={noop}
        onSaved={noop}
      />,
      "Adendo ao prontuário",
    );
    const save = within(dialog).getByRole("button", {
      name: "Registrar adendo",
    });
    expectMissing(
      save,
      "Falta: Motivo do adendo (pelo menos 5 caracteres), Conteúdo complementar (pelo menos 10 caracteres).",
    );
    type(dialog, "Motivo do adendo", "Correção de digitação");
    expectMissing(
      save,
      "Falta: Conteúdo complementar (pelo menos 10 caracteres).",
    );
    type(dialog, "Conteúdo complementar", "Escala de dor correta: 4/10.");
    expectComplete(dialog, save);
  });

  it("clinical measurement", () => {
    const dialog = mount(
      <ClinicalMeasurementModal
        patientId={patientId}
        goals={[]}
        onClose={noop}
        onSaved={noop}
      />,
      "Nova medição clínica",
    );
    const save = within(dialog).getByRole("button", {
      name: "Registrar medição",
    });
    expectMissing(save, "Falta: Medida, Unidade.");
    type(dialog, "Medida", "Flexão de joelho");
    expectMissing(save, "Falta: Unidade.");
    type(dialog, "Unidade", "graus");
    expectComplete(dialog, save);
  });
});
