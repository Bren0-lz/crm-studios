import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("lean lead form", () => {
  it("creates a lead with name and phone and asks CPF, emergency contact and address on conversion", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const leads: Array<Record<string, unknown>> = [];
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        posts.push({ url, body });
        if (url.endsWith("/leads")) {
          const lead = {
            ...body,
            id: "44444444-4444-4444-8444-444444444444",
            clinicId: "11111111-1111-4111-8111-111111111111",
            stage: "new_contact",
            openTasks: 0,
            overdueTasks: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          leads.push(lead);
          return { ok: true, status: 201, json: async () => lead } as Response;
        }
        if (url.endsWith("/convert"))
          return {
            ok: true,
            status: 200,
            json: async () => ({
              lead: { ...leads[0], stage: "won", convertedPatientId: "p1" },
              patient: { id: "p1", fullName: "Lead Enxuto" },
              reusedExisting: false,
            }),
          } as Response;
      }
      const body = url.endsWith("/leads") ? leads : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Novo lead/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo lead" });
    expect(within(dialog).queryByLabelText(/CPF/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/emergência/i),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Endereço")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("CEP")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Mais informações")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Lead Enxuto" },
    });
    fireEvent.change(within(dialog).getByLabelText("Telefone"), {
      target: { value: "11977776666" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({
      fullName: "Lead Enxuto",
      phone: "11977776666",
    });

    const card = (await screen.findByText("Lead Enxuto")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Converter" }));
    const convert = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    fireEvent.change(within(convert).getByLabelText("CPF"), {
      target: { value: "529.982.247-25" },
    });
    fireEvent.change(within(convert).getByLabelText("Contato de emergência"), {
      target: { value: "Joana Mãe" },
    });
    fireEvent.change(within(convert).getByLabelText("Endereço"), {
      target: { value: "Rua das Flores, 10" },
    });
    fireEvent.click(within(convert).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]!.url).toMatch(/\/convert$/);
    expect(posts[1]!.body).toMatchObject({
      cpf: "52998224725",
      emergencyContactName: "Joana Mãe",
      address: "Rua das Flores, 10",
    });
  });
});
