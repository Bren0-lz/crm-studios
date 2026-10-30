import type { AdminAuditEvent } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { formatAuditEvent } from "../../audit-history";

function event(overrides: Partial<AdminAuditEvent> = {}): AdminAuditEvent {
  return {
    id: "audit-1",
    action: "clinic.updated",
    entityType: "clinic",
    createdAt: "2026-10-08T12:00:00Z",
    metadata: {},
    ...overrides,
  };
}

describe("readable audit history", () => {
  it.each([
    ["user.created", "Usuário cadastrado"],
    ["user.updated", "Usuário atualizado"],
    ["user.password_reset", "Senha redefinida"],
    ["users.permissions_updated", "Permissões de acesso alteradas"],
    ["users.commission_updated", "Comissão alterada"],
    ["users.professional_updated", "Vínculo com profissional alterado"],
    ["clinic.updated", "Dados da clínica atualizados"],
    ["patient_tag.created", "Etiqueta criada"],
    ["patient_tag.updated", "Etiqueta alterada"],
    ["patient_tag.deleted", "Etiqueta excluída"],
    ["patients.exported", "Lista de clientes exportada"],
  ])("describes %s without exposing the technical code", (action, title) => {
    expect(formatAuditEvent(event({ action })).title).toBe(title);
  });

  it("uses readable fallbacks for future actions, categories and missing actors", () => {
    expect(
      formatAuditEvent(event({ action: "future.action", entityType: "user" })),
    ).toMatchObject({
      title: "Alteração registrada",
      category: "Usuários",
      actor: "Sistema",
    });
    expect(
      formatAuditEvent(
        event({
          action: "toString",
          entityType: "constructor",
          actorUserId: "removed-user",
        }),
      ),
    ).toMatchObject({
      title: "Alteração registrada",
      category: "Outros registros",
      actor: "Usuário não identificado",
    });
    expect(
      formatAuditEvent(
        event({ actorName: "Maria Souza", actorUserId: "user-1" }),
      ).actor,
    ).toBe("Maria Souza");
    expect(
      formatAuditEvent(event({ actorName: " ", createdAt: "invalid" })),
    ).toMatchObject({ actor: "Sistema", date: "Não registrado" });
  });

  it("translates roles, account status and recorded user information", () => {
    expect(
      formatAuditEvent(
        event({
          action: "user.created",
          metadata: { email: "maria@test.local", role: "admin", active: true },
        }),
      ).details,
    ).toEqual([
      { label: "E-mail do usuário", value: "maria@test.local" },
      { label: "Perfil", value: "Administrador" },
      { label: "Situação", value: "Ativo" },
    ]);
    expect(
      formatAuditEvent(
        event({
          action: "user.updated",
          metadata: { role: "user", active: false },
        }),
      ).details,
    ).toEqual([
      { label: "Perfil", value: "Usuário comum" },
      { label: "Situação", value: "Desativado" },
    ]);
  });

  it("describes granted and removed permissions without modifying recorded data", () => {
    const input = event({
      action: "users.permissions_updated",
      metadata: {
        previousPermissions: ["finance.view", "finance.receive"],
        permissions: ["finance.view", "history.view", "history.view"],
      },
    });
    const original = JSON.stringify(input);
    expect(formatAuditEvent(input).details).toEqual([
      { label: "Acessos concedidos", value: "Visualizar Histórico" },
      { label: "Acessos removidos", value: "Financeiro: Receber pagamento" },
    ]);
    expect(JSON.stringify(input)).toBe(original);
    expect(
      formatAuditEvent(
        event({
          action: "users.permissions_updated",
          metadata: { permissions: ["future.permission"] },
        }),
      ).details,
    ).toEqual([
      { label: "Acessos permitidos", value: "Acesso não identificado" },
    ]);
  });

  it("supports older module records and does not infer missing previous permissions", () => {
    expect(
      formatAuditEvent(
        event({
          action: "users.permissions_updated",
          metadata: { modules: ["agenda", "settings"], editModules: [] },
        }),
      ).details,
    ).toEqual([
      { label: "Áreas disponíveis", value: "Agenda; Configurações" },
      { label: "Áreas com alterações permitidas", value: "Nenhum" },
    ]);
    expect(
      formatAuditEvent(
        event({
          action: "users.permissions_updated",
          metadata: { permissions: [], previousPermissions: [] },
        }),
      ).details,
    ).toEqual([
      { label: "Acessos concedidos", value: "Nenhum" },
      { label: "Acessos removidos", value: "Nenhum" },
    ]);
  });

  it("shows commission changes and valid effective dates in Brazilian format", () => {
    expect(
      formatAuditEvent(
        event({
          action: "users.commission_updated",
          metadata: {
            previousPercentage: 0,
            percentage: 12.5,
            effectiveFrom: "2026-10-08",
          },
        }),
      ).details,
    ).toEqual([
      { label: "Percentual anterior", value: "0%" },
      { label: "Novo percentual", value: "12,5%" },
      { label: "Válida a partir de", value: "08/10/2026" },
    ]);
    expect(
      formatAuditEvent(
        event({
          action: "users.commission_updated",
          metadata: { percentage: "12", effectiveFrom: "2026-02-31" },
        }),
      ).details,
    ).toEqual([]);
  });

  it("explains labels and exports using recorded values", () => {
    expect(
      formatAuditEvent(
        event({
          action: "patient_tag.updated",
          metadata: {
            name: "Gestante",
            previousName: "Gestação",
            patientsUpdated: 3,
          },
        }),
      ).details,
    ).toEqual([
      { label: "Etiqueta", value: "Gestante" },
      { label: "Nome anterior", value: "Gestação" },
      { label: "Clientes atualizados", value: "3" },
    ]);
    expect(
      formatAuditEvent(
        event({
          action: "patients.exported",
          metadata: { count: 0, format: "xlsx", columns: ["fullName"] },
        }),
      ).details,
    ).toEqual([
      { label: "Clientes exportados", value: "0" },
      { label: "Formato do arquivo", value: "Planilha do Excel" },
      { label: "Informações exportadas", value: "Nome" },
    ]);
    expect(
      formatAuditEvent(
        event({
          action: "users.professional_updated",
          metadata: { professionalId: null },
        }),
      ).details,
    ).toEqual([{ label: "Vínculo", value: "Sem profissional vinculado" }]);
  });

  it.each([
    null,
    [],
    {
      permissions: [null, 4],
      previousPermissions: {},
      name: { nested: true },
      count: -1,
    },
  ])("handles absent or unexpected metadata safely: %j", (metadata) => {
    for (const action of [
      "users.permissions_updated",
      "patient_tag.updated",
      "patients.exported",
      "users.commission_updated",
    ])
      expect(
        formatAuditEvent(
          event({
            action,
            metadata: metadata as unknown as AdminAuditEvent["metadata"],
          }),
        ).details,
      ).toEqual([]);
  });
});
