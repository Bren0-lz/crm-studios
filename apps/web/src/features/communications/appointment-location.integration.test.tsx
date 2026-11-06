import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoCampaignEditorModal } from "./auto-campaigns/AutoCampaignEditorModal";
import { api } from "../../api";
import type { AutoCampaign, Branch } from "@crm/contracts";

const campaign: AutoCampaign = {
  id: "campaign",
  name: "Lembrete",
  active: true,
  trigger: "appointment_upcoming",
  steps: [
    {
      id: "step",
      offset: 1,
      message: "Olá, {{nome}}!\nEndereço: {{endereco}}\nMapa: {{link_mapa}}",
    },
  ],
  createdAt: "2039-01-01T00:00:00Z",
  updatedAt: "2039-01-01T00:00:00Z",
  createdByName: "Admin",
};
describe("appointment location editor", () => {
  it.each([false, true])(
    "offers location variables and previews the available address (%s)",
    async (hasAddress) => {
      vi.spyOn(api, "branches").mockResolvedValue([
        {
          id: "unit",
          name: "Matriz",
          ...(hasAddress
            ? { street: "Rua das Flores", number: "100", city: "Campinas" }
            : {}),
        } as Branch,
      ]);
      render(
        <AutoCampaignEditorModal
          campaign={campaign}
          canSeeFinance
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Inserir endereço" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Inserir link do mapa" }),
      ).toBeVisible();
      if (hasAddress) {
        expect(
          await within(
            screen.getByRole("figure", { name: "Prévia no WhatsApp" }),
          ).findByText(/Rua das Flores, 100/),
        ).toBeVisible();
        expect(
          screen.queryByText("Cadastre o endereço da unidade em Configurações"),
        ).not.toBeInTheDocument();
      } else {
        expect(
          await screen.findByText(
            "Cadastre o endereço da unidade em Configurações",
          ),
        ).toBeVisible();
        expect(
          screen.getByRole("figure", { name: "Prévia no WhatsApp" }),
        ).not.toHaveTextContent("{{endereco}}");
        expect(
          screen.getByRole("figure", { name: "Prévia no WhatsApp" }),
        ).not.toHaveTextContent("Endereço:");
      }
    },
  );
});
