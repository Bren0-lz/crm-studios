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
    expect(domainsForMutation("POST", "/product-sales")).toEqual(
      expect.arrayContaining(["finance", "inventory", "history"]),
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
    // Editar serviço/sala/observação (QM6) muda a agenda e o histórico.
    expect(domainsForMutation("PATCH", "/appointments/a1")).toEqual(
      expect.arrayContaining(["agenda", "history"]),
    );
    expect(domainsForMutation("DELETE", "/holidays/h1")).toContain("agenda");
    expect(domainsForMutation("PATCH", "/patients/p1")).toContain("patients");
    expect(domainsForMutation("POST", "/relationship/activities")).toEqual([
      "relationship",
    ]);
    // Tarefas comerciais entram no sino.
    expect(domainsForMutation("POST", "/leads/l1/tasks")).toEqual(["crm"]);
    expect(domainsForMutation("PATCH", "/lead-tasks/t1/status")).toEqual([
      "crm",
    ]);
    expect(domainsForMutation("POST", "/leads/l1/appointments")).toEqual(
      expect.arrayContaining(["agenda", "crm"]),
    );
  });

  it("ignora leituras, prévias e sessão", () => {
    expect(domainsForMutation("GET", "/finance/workspace")).toEqual([]);
    expect(domainsForMutation("POST", "/patients/merge/preview")).toEqual([]);
    expect(domainsForMutation("POST", "/patients/import/preview")).toEqual([]);
    expect(domainsForMutation("POST", "/auth/login")).toEqual([]);
  });

  it("atualiza agenda, comissões e histórico após salvar o cadastro unificado", () => {
    for (const [method, path] of [
      ["POST", "/admin/users"],
      ["PATCH", "/admin/users/ana"],
      ["PUT", "/admin/users/ana/professional"],
      ["PUT", "/admin/users/ana/commission"],
    ]) {
      expect(domainsForMutation(method!, path!)).toEqual(
        expect.arrayContaining(["agenda", "finance", "history"]),
      );
    }
    expect(domainsForMutation("GET", "/admin/users")).toEqual([]);
    expect(
      domainsForMutation("POST", "/admin/users/ana/reset-password"),
    ).toEqual([]);
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
