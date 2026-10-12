import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PermissionEditor } from "./PermissionEditor";
import type { PermissionKey } from "@crm/contracts";

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
    fireEvent.click(screen.getByRole("checkbox", { name: "Histórico: Visualizar histórico" }));
    expect(screen.getByTestId("selection")).toHaveTextContent('["history.view"]');
    expect(screen.getByRole("checkbox", { name: "Configurações: Visualizar módulo" })).not.toBeChecked();
  });
  it("selects dependencies and removes dependent actions", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Financeiro: Receber pagamento" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Financeiro: Visualizar módulo" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Financeiro: Estornar recebimento",
      }),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Financeiro: Visualizar módulo" }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
  });
  it("selects whole blocks, shows partial state and clears permissions", () => {
    render(<Editor />);
    const block = screen.getByRole("checkbox", {
      name: "Selecionar bloco Turmas",
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Turmas: Criar turma" }),
    );
    expect((block as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(block);
    expect(block).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Turmas: Cancelar matrícula" }),
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
      { target: { value: "estornar" } },
    );
    expect(
      screen.queryByRole("checkbox", { name: "Agenda: Agendar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Financeiro: Estornar recebimento",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent("agenda.create");
  });
});
