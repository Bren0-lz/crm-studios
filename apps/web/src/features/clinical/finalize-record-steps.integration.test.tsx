import type { ClinicalRecord } from "@crm/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalizeRecordModal } from "./FinalizeRecordModal";

afterEach(cleanup);

const draft: ClinicalRecord = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientId: "99999999-9999-4999-8999-999999999999",
  patientName: "Helena Almeida",
  professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  professionalName: "Dra. Ana Martins",
  appointmentStartsAt: "2040-06-01T12:00:00.000Z",
  status: "draft",
  version: 1,
  authorName: "Aryana Dutra",
  subjective: "Dor ao subir escadas.",
  objective: "",
  assessment: "",
  plan: "",
  createdAt: "2040-06-01T12:00:00.000Z",
  updatedAt: "2040-06-01T12:00:00.000Z",
} as ClinicalRecord;

describe("finalizing a SOAP record (QM14)", () => {
  it("keeps Confirmar disabled listing the missing steps once, and enables it when all are filled", () => {
    const onConfirm = vi.fn(async () => {});
    const { rerender } = render(
      <FinalizeRecordModal
        record={draft}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Finalizar evolução" });
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(
      /^Falta: O — Objetivo, A — Avaliação, P — Plano\./,
    );
    expect(within(dialog).getAllByText(/Objetivo/)).toHaveLength(1);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <FinalizeRecordModal
        record={{ ...draft, objective: "Teste", assessment: "Melhora" }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(confirm).toHaveAccessibleDescription(/^Falta: P — Plano\./);

    rerender(
      <FinalizeRecordModal
        record={{
          ...draft,
          objective: "Teste",
          assessment: "Melhora",
          plan: "Manter",
        }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute("aria-describedby");
  });

  it("shows an error from the API a single time", async () => {
    const message =
      "Preencha as quatro etapas do SOAP antes de finalizar a evolução.";
    render(
      <FinalizeRecordModal
        record={{
          ...draft,
          objective: "Teste",
          assessment: "Melhora",
          plan: "Manter",
        }}
        onClose={() => {}}
        onConfirm={async () => {
          throw new Error(message);
        }}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Finalizar evolução" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
  });
});
