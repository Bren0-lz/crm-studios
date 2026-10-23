import type { AssessmentTemplate } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

const template: AssessmentTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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

describe("clinical assessment (QM14)", () => {
  it("keeps 'Registrar avaliação' disabled listing the required fields of the template", () => {
    render(
      <AuthorizationContext.Provider value={authorization}>
        <ClinicalAssessmentModal
          patientId="99999999-9999-4999-8999-999999999999"
          templates={[template]}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    const dialog = screen.getByRole("dialog", {
      name: "Nova avaliação configurável",
    });
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
    fireEvent.change(within(dialog).getByLabelText("Sente dor"), {
      target: { value: "false" },
    });
    expect(register).toBeEnabled();
    expect(register).not.toHaveAttribute("aria-describedby");
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });

  it("asks for a template when none is published", () => {
    render(
      <AuthorizationContext.Provider value={authorization}>
        <ClinicalAssessmentModal
          patientId="99999999-9999-4999-8999-999999999999"
          templates={[]}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    const register = screen.getByRole("button", {
      name: "Registrar avaliação",
    });
    expect(register).toBeDisabled();
    expect(register).toHaveAccessibleDescription("Falta: Modelo.");
  });
});
