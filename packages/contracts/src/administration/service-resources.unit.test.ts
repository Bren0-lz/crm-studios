import { describe, expect, it } from "vitest";
import { serviceAvailableFor } from "./model.js";

describe("serviceAvailableFor", () => {
  it("treats empty lists as everyone and filters by professional and room", () => {
    expect(serviceAvailableFor({}, "ana", "sala-1")).toBe(true);
    const pilates = { professionalIds: ["ana"], roomIds: ["studio"] };
    expect(serviceAvailableFor(pilates, "ana", "studio")).toBe(true);
    expect(serviceAvailableFor(pilates, "bia", "studio")).toBe(false);
    expect(serviceAvailableFor(pilates, "ana", "sala-1")).toBe(false);
    expect(serviceAvailableFor(pilates, "", "")).toBe(true);
  });
});
