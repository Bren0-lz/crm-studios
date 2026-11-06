import { describe, expect, it } from "vitest";
import {
  appointmentLocationVariables,
  fillAutoCampaignMessage,
} from "./appointment-location.js";
import type { Branch } from "../branches/types.js";

const branch: Branch = {
  id: "unit",
  clinicId: "clinic",
  name: "Centro",
  active: true,
  isDefault: true,
  street: "Rua São José",
  number: "42",
  neighborhood: "Centro",
  city: "São Paulo",
};

describe("appointment message location", () => {
  it("formats the branch address and encodes a Maps search without an API", () => {
    const vars = appointmentLocationVariables(branch);
    expect(vars.endereco).toBe("Rua São José, 42 · Centro · São Paulo");
    expect(vars.link_mapa).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(vars.endereco)}`,
    );
    expect(
      fillAutoCampaignMessage(
        "Olá, {{nome}}!\n{{endereco}}\n{{link_mapa}}",
        "Ana Lima",
        vars,
      ),
    ).toBe(`Olá, Ana!\n${vars.endereco}\n${vars.link_mapa}`);
  });
  it.each([undefined, { ...branch, street: "" }, { ...branch, city: "" }])(
    "removes location lines when no usable address exists",
    (value) => {
      const vars = appointmentLocationVariables(value);
      expect(vars).toEqual({ endereco: "", link_mapa: "" });
      expect(
        fillAutoCampaignMessage(
          "Olá, {{nome}}!\nEndereço: {{ endereco }}\nMapa: {{link_mapa}}\nAté breve!",
          "Ana Lima",
          vars,
        ),
      ).toBe("Olá, Ana!\nAté breve!");
    },
  );
});
