import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { AppointmentPatientWarnings } from "./AppointmentPatientWarnings";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const patient = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana Gomes",
  tags: ["PAGAMENTO ATRASADO", "Pilates"],
};

function mount() {
  render(
    <AuthorizationContext.Provider value={authorization}>
      <AppointmentPatientWarnings patient={patient} />
    </AuthorizationContext.Provider>,
  );
}

describe("AppointmentPatientWarnings", () => {
  it("warns about attention tags; the plan has its own field (AP4)", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    mount();
    expect(
      await screen.findByText("Cliente com a etiqueta “Pagamento atrasado”"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sem plano/)).not.toBeInTheDocument();
  });

  it("opens the overdue payment details from the warning", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("/finance/summary")
        ? jsonResponse({
            openInCents: 0,
            overdueInCents: 30000,
            paidThisMonthInCents: 0,
            receivables: [
              {
                id: "r1",
                patientId: patient.id,
                patientName: patient.fullName,
                description: "Plano Pilates 2x",
                installmentNumber: 2,
                installmentCount: 3,
                dueDate: "2026-09-10",
                amountInCents: 18000,
                status: "open",
                overdue: true,
              },
              {
                id: "r2",
                patientId: patient.id,
                patientName: patient.fullName,
                description: "Avulso",
                installmentNumber: 1,
                installmentCount: 1,
                dueDate: "2026-09-20",
                amountInCents: 12000,
                status: "open",
                overdue: true,
              },
              {
                id: "r3",
                patientId: patient.id,
                patientName: patient.fullName,
                description: "Parcela paga",
                installmentNumber: 1,
                installmentCount: 3,
                dueDate: "2026-08-10",
                amountInCents: 18000,
                status: "paid",
                overdue: false,
              },
              {
                id: "r4",
                patientId: "outro",
                patientName: "Outra",
                description: "De outro cliente",
                installmentNumber: 1,
                installmentCount: 1,
                dueDate: "2026-09-01",
                amountInCents: 5000,
                status: "open",
                overdue: true,
              },
            ],
          })
        : jsonResponse([]),
    );
    const onNestedModalChange = vi.fn();
    render(
      <AuthorizationContext.Provider value={authorization}>
        <AppointmentPatientWarnings
          patient={patient}
          onNestedModalChange={onNestedModalChange}
        />
      </AuthorizationContext.Provider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Ver detalhes do pagamento/ }),
    );
    expect(onNestedModalChange).toHaveBeenLastCalledWith(true);
    const dialog = await screen.findByRole("dialog", {
      name: "Pagamento atrasado",
    });
    expect(
      await within(dialog).findByText("Plano Pilates 2x"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Avulso")).toBeInTheDocument();
    expect(within(dialog).getByText(/Parcela 2 de 3/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Parcela paga")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("De outro cliente"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Total em atraso").nextSibling,
    ).toHaveTextContent(/300,00/);
    expect(
      within(dialog).getByRole("link", { name: /Abrir no Financeiro/ }),
    ).toHaveAttribute("href", `/financeiro?patientId=${patient.id}`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onNestedModalChange).toHaveBeenLastCalledWith(false);
  });

  it("hides the details button without finance access", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    render(
      <AuthorizationContext.Provider
        value={{ ...authorization, canView: (module) => module !== "finance" }}
      >
        <AppointmentPatientWarnings patient={patient} />
      </AuthorizationContext.Provider>,
    );
    expect(
      await screen.findByText("Cliente com a etiqueta “Pagamento atrasado”"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ver detalhes do pagamento/ }),
    ).not.toBeInTheDocument();
  });
});
