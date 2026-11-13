import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../../App";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("shows the login when there is no session", () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Acesse sua clínica" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Studios Aryana")).toBeInTheDocument();
    expect(
      screen.getByText("Studios Aryana", { selector: ".brand-name" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".brand-mark")).toBeNull();
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    expect(screen.queryByText(/Admin@123/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Acesso de demonstração"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^movimenta$/i)).not.toBeInTheDocument();
  });
});
