import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fieldForMessage, installInlineValidation } from "./inline-validation";

let uninstall = () => undefined as void;
afterEach(() => uninstall());

describe("inline validation", () => {
  it("shows Portuguese messages under the fields, focuses the first and clears when fixed", () => {
    uninstall = installInlineValidation(document);
    render(
      <form className="form-grid">
        <label>
          Nome
          <input required />
        </label>
        <label>
          E-mail
          <input type="email" defaultValue="x" />
        </label>
        <label>
          Serviço
          <select required defaultValue="">
            <option value="">Selecione</option>
            <option value="a">A</option>
          </select>
        </label>
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(form.reportValidity()).toBe(false);
    const name = screen.getByRole("textbox", { name: /Nome/ });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-description", "Preencha este campo.");
    expect(name).toHaveAccessibleName("Nome");
    expect(
      name.closest("label")!.querySelector(".inline-field-error"),
    ).toHaveAttribute("data-message", "Preencha este campo.");
    expect(name).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "E-mail" })).toHaveAttribute(
      "aria-description",
      "Informe um e-mail válido.",
    );
    expect(screen.getByRole("combobox", { name: "Serviço" })).toHaveAttribute(
      "aria-description",
      "Selecione uma opção.",
    );

    fireEvent.input(name, { target: { value: "Ana" } });
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(name).not.toHaveAttribute("aria-description");
    expect(document.querySelector(".inline-field-error")).not.toBe(null);
    expect(
      name.closest("label")!.querySelector(".inline-field-error"),
    ).toBeNull();
  });

  it("never creates an error while typing in a field without one", () => {
    uninstall = installInlineValidation(document);
    render(
      <form>
        <label>
          E-mail
          <input type="email" required minLength={5} />
        </label>
      </form>,
    );
    const email = screen.getByRole("textbox", { name: "E-mail" });
    fireEvent.input(email, { target: { value: "jo" } });
    fireEvent.change(email, { target: { value: "joao" } });
    fireEvent.input(email, { target: { value: "" } });
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-description");
    expect(document.querySelector(".inline-field-error")).toBeNull();
  });

  it("updates the message of a marked field that is still invalid and clears it when valid", () => {
    uninstall = installInlineValidation(document);
    render(
      <form>
        <label>
          E-mail
          <input type="email" required />
        </label>
        <label>
          Nome
          <input required minLength={3} />
        </label>
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(form.reportValidity()).toBe(false);
    const email = screen.getByRole("textbox", { name: /E-mail/ });
    const name = screen.getByRole("textbox", { name: /Nome/ });
    const errorOf = (field: HTMLElement) =>
      field.closest("label")!.querySelector(".inline-field-error");
    expect(email).toHaveAttribute("aria-description", "Preencha este campo.");

    fireEvent.input(email, { target: { value: "joao" } });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute(
      "aria-description",
      "Informe um e-mail válido.",
    );
    expect(errorOf(email)).toHaveAttribute(
      "data-message",
      "Informe um e-mail válido.",
    );

    // jsdom não calcula tooShort em valor definido por script: simula a regra.
    Object.defineProperty(name, "validity", {
      configurable: true,
      get: () => ({ valid: false, valueMissing: false, tooShort: true }),
    });
    fireEvent.input(name, { target: { value: "Jo" } });
    expect(name).toHaveAttribute(
      "aria-description",
      "Use pelo menos 3 caracteres.",
    );
    expect(errorOf(name)).toHaveAttribute(
      "data-message",
      "Use pelo menos 3 caracteres.",
    );

    fireEvent.input(email, { target: { value: "joao@exemplo.com" } });
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-description");
    expect(errorOf(email)).toBeNull();
  });

  it("moves a submit error to the field it mentions, focused, and clears it when edited", async () => {
    uninstall = installInlineValidation(document);
    function Form() {
      const [error, setError] = useState("");
      return (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setError("Já existe um cliente com este CPF.");
          }}
        >
          <label>
            Nome
            <input defaultValue="Ana" />
          </label>
          <label>
            CPF
            <input defaultValue="111" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button>Salvar</button>
        </form>
      );
    }
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await act(async () => {});
    const cpf = screen.getByRole("textbox", { name: "CPF" });
    expect(cpf).toHaveFocus();
    expect(cpf).toHaveAttribute("aria-invalid", "true");
    expect(cpf).toHaveAttribute(
      "aria-description",
      "Já existe um cliente com este CPF.",
    );
    expect(
      cpf.closest("label")!.querySelector(".inline-field-error"),
    ).toHaveAttribute("data-message", "Já existe um cliente com este CPF.");
    expect(document.querySelector(".form-error")).toHaveClass("is-at-field");

    fireEvent.input(cpf, { target: { value: "222" } });
    expect(cpf).not.toHaveAttribute("aria-invalid");
    expect(document.querySelector(".inline-field-error")).toBeNull();
  });

  it("keeps generic or unrelated submit errors in the form footer", async () => {
    uninstall = installInlineValidation(document);
    render(
      <form className="form-grid">
        <label>
          Cliente
          <input defaultValue="Ana" />
        </label>
        <div className="form-error">Não foi possível salvar o cliente.</div>
      </form>,
    );
    await act(async () => {});
    expect(screen.getByRole("textbox", { name: "Cliente" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(document.querySelector(".form-error")).not.toHaveClass("is-at-field");
  });

  it("matches labels ignoring accents, articles and option texts", () => {
    render(
      <form>
        <label>
          Serviço
          <select defaultValue="a">
            <option value="a">Data e horário</option>
          </select>
        </label>
        <label>
          Data e horário
          <input type="datetime-local" />
        </label>
        <label>
          Data
          <input type="date" />
        </label>
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(
      fieldForMessage(form, "Informe a data e o horario da aula."),
    ).toBe(screen.getByLabelText("Data e horário"));
    expect(fieldForMessage(form, "Este SERVICO está inativo.")).toBe(
      screen.getByRole("combobox", { name: "Serviço" }),
    );
    expect(fieldForMessage(form, "Revise os dados informados.")).toBeNull();
  });
});
