import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { ClinicalMeasurementModal } from "./ClinicalMeasurementModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

const originalTimezone = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("ClinicalMeasurementModal", () => {
  it("starts the date and time field at the local clock, not UTC", () => {
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T23:43:00.000Z"));
    render(
      <AuthorizationContext.Provider value={authorization}>
        <ClinicalMeasurementModal
          patientId="11111111-1111-4111-8111-111111111111"
          goals={[]}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    expect(screen.getByLabelText("Data e hora")).toHaveValue(
      "2026-10-16T20:43",
    );
  });
});
