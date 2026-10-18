import { describe, expect, it, vi } from "vitest";
import {
  bumpDataVersion,
  domainsForMutation,
  getDataVersion,
  subscribeDataVersion,
} from "./data-version";

describe("versão dos dados por domínio", () => {
  it("mapeia cada mutação para as telas que ela afeta", () => {
    expect(domainsForMutation("POST", "/patient-tabs/t1/close")).toEqual(
      expect.arrayContaining([
        "finance",
        "inventory",
        "plans",
        "agenda",
        "history",
      ]),
    );
    expect(domainsForMutation("POST", "/plans")).toEqual(
      expect.arrayContaining(["plans", "finance", "history"]),
    );
    expect(domainsForMutation("POST", "/plans/purchases")).toEqual(
      expect.arrayContaining(["plans", "finance"]),
    );
    expect(domainsForMutation("POST", "/finance/receivables/r1/pay")).toEqual(
      expect.arrayContaining(["finance", "history"]),
    );
    expect(
      domainsForMutation("POST", "/finance/receivables/r1/reverse"),
    ).toContain("finance");
    expect(domainsForMutation("PATCH", "/appointments/a1/status")).toEqual(
      expect.arrayContaining(["agenda", "plans", "finance", "history"]),
    );
    expect(domainsForMutation("DELETE", "/holidays/h1")).toContain("agenda");
    expect(domainsForMutation("PATCH", "/patients/p1")).toContain("patients");
  });

  it("ignora leituras, prévias e sessão", () => {
    expect(domainsForMutation("GET", "/finance/workspace")).toEqual([]);
    expect(domainsForMutation("POST", "/patients/merge/preview")).toEqual([]);
    expect(domainsForMutation("POST", "/patients/import/preview")).toEqual([]);
    expect(domainsForMutation("POST", "/auth/login")).toEqual([]);
  });

  it("avisa os assinantes e muda só a versão dos domínios afetados", () => {
    const listener = vi.fn();
    const stop = subscribeDataVersion(listener);
    const finance = getDataVersion(["finance"]);
    const agenda = getDataVersion(["agenda"]);
    bumpDataVersion(["finance"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getDataVersion(["finance"])).toBe(finance + 1);
    expect(getDataVersion(["agenda"])).toBe(agenda);
    bumpDataVersion([]);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    bumpDataVersion(["finance"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
