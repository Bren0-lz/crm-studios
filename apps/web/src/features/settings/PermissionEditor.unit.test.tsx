import type { PermissionKey } from "@crm/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PermissionEditor } from "../../PermissionEditor";

afterEach(cleanup);
function Editor() {
  const [value, setValue] = useState<PermissionKey[]>([]);
  return (
    <>
      <PermissionEditor value={value} onChange={setValue} />
      <output data-testid="selection">{JSON.stringify(value)}</output>
    </>
  );
}
describe("permission editor", () => {
  it("offers history access independently of settings", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Histórico: Acessar o histórico" }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent(
      '["history.view"]',
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Configurações: Acessar as configurações",
      }),
    ).not.toBeChecked();
  });
  it("selects dependencies and removes dependent actions", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Financeiro: Registrar pagamento recebido",
      }),
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Financeiro: Acessar o financeiro",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Financeiro: Desfazer recebimento",
      }),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Financeiro: Acessar o financeiro",
      }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
  });
  it("selects whole blocks, shows partial state and clears permissions", () => {
    render(<Editor />);
    const block = screen.getByRole("checkbox", {
      name: "Marcar todas de Turmas",
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Turmas: Criar turma" }),
    );
    expect((block as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(block);
    expect(block).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Turmas: Tirar cliente da turma" }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Limpar permissões" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
  });
  it("searches without removing selections outside the filter", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Agenda: Agendar atendimento" }),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar permissão" }),
      { target: { value: "desfazer" } },
    );
    expect(
      screen.queryByRole("checkbox", { name: "Agenda: Agendar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Financeiro: Desfazer recebimento",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent("agenda.create");
  });
});
