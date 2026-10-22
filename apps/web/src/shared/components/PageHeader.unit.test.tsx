import { fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

function Pages() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/clientes"
          element={
            <>
              <h1>Lista de clientes</h1>
              <Link to="/clientes/1">Abrir cliente</Link>
            </>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <PageHeader
              back={{ to: "/clientes", label: "Voltar aos clientes" }}
              title="Ana"
              description="Ficha"
            />
          }
        />
        <Route path="/agenda" element={<h1>Agenda</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

describe("PageHeader", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("não mostra o voltar nas páginas principais", () => {
    window.history.replaceState(null, "", "/agenda");
    render(<Pages />);
    expect(screen.queryByRole("button", { name: /Voltar/ })).toBeNull();
  });

  it("aberta direto pelo endereço, volta para a página pai", async () => {
    window.history.replaceState(null, "", "/clientes/1");
    render(<Pages />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos clientes" }));
    expect(await screen.findByText("Lista de clientes")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/clientes");
  });

  it("vinda de outra página do app, volta para a página anterior", async () => {
    window.history.replaceState(null, "", "/clientes");
    render(<Pages />);
    fireEvent.click(screen.getByRole("link", { name: "Abrir cliente" }));
    const back = await screen.findByRole("button", {
      name: "Voltar aos clientes",
    });
    const length = window.history.length;
    fireEvent.click(back);
    expect(await screen.findByText("Lista de clientes")).toBeInTheDocument();
    // Voltou no histórico em vez de empilhar uma nova entrada.
    expect(window.history.length).toBe(length);
  });
});
