import { appModuleSchema, type AppModule, type UserRole } from "@crm/contracts";

/**
 * HISTÓRICO — perfis fixos de antes da T055 e os padrões de módulos de cada um (eram
 * `roleDefaultModules`/`roleDefaultEditModules` nos contratos). Só servem para conferir a
 * migração 0042 (que grava esses padrões em `users.modules`/`users.edit_modules`) e para os
 * testes montarem usuários com o acesso de um perfil antigo. Não usar em regra de negócio.
 */
export const legacyRoles = [
  "owner",
  "reception",
  "physiotherapist",
  "finance",
] as const;
export type LegacyRole = (typeof legacyRoles)[number];
type LegacyCommonRole = Exclude<LegacyRole, "owner">;

/** Padrão de visualização de cada perfil antigo (o menu lateral de antes). */
export const legacyRoleDefaultModules: Record<
  LegacyCommonRole,
  readonly AppModule[]
> = {
  reception: [
    "agenda",
    "groups",
    "patients",
    "plans",
    "crm",
    "relationship",
    "communications",
    "contracts",
    "settings",
  ],
  physiotherapist: ["agenda", "groups", "patients", "plans", "clinical"],
  finance: [
    "agenda",
    "patients",
    "plans",
    "crm",
    "relationship",
    "communications",
    "contracts",
    "finance",
    "reports",
    "settings",
  ],
};

/** Padrão de edição de cada perfil antigo. */
export const legacyRoleDefaultEditModules: Record<
  LegacyCommonRole,
  readonly AppModule[]
> = {
  reception: [
    "agenda",
    "groups",
    "patients",
    "plans",
    "crm",
    "relationship",
    "communications",
    "contracts",
  ],
  physiotherapist: ["agenda", "groups", "clinical"],
  finance: [
    "agenda",
    "patients",
    "plans",
    "crm",
    "relationship",
    "communications",
    "contracts",
    "finance",
  ],
};

function ordered(modules: readonly AppModule[]): AppModule[] {
  return appModuleSchema.options.filter((module) => modules.includes(module));
}

/** Regra de antes da T055: módulos vistos (owner: todos; sem ajuste: padrão do perfil). */
export function legacyEffectiveModules(
  role: LegacyRole,
  modules: readonly AppModule[] | null,
): AppModule[] {
  if (role === "owner") return [...appModuleSchema.options];
  return ordered(modules ?? legacyRoleDefaultModules[role]);
}

/** Regra de antes da T055: módulos editados (sempre dentro dos vistos). */
export function legacyEffectiveEditModules(
  role: LegacyRole,
  modules: readonly AppModule[] | null,
  editModules: readonly AppModule[] | null,
): AppModule[] {
  if (role === "owner") return [...appModuleSchema.options];
  const chosen = editModules ?? legacyRoleDefaultEditModules[role];
  return legacyEffectiveModules(role, modules).filter((module) =>
    chosen.includes(module),
  );
}

export interface StoredUserAccess<Role extends string> {
  role: Role;
  modules: readonly AppModule[] | null;
  editModules: readonly AppModule[] | null;
}

/**
 * O que a migração 0042 faz com cada usuário: owner → admin sem lista gravada; os demais →
 * usuário comum com a lista gravada (ou o padrão do perfil, quando não havia ajuste).
 */
export function migrateLegacyUser(
  user: StoredUserAccess<LegacyRole>,
): StoredUserAccess<UserRole> {
  if (user.role === "owner")
    return { role: "admin", modules: null, editModules: null };
  return {
    role: "user",
    modules: user.modules ?? legacyRoleDefaultModules[user.role],
    editModules: user.editModules ?? legacyRoleDefaultEditModules[user.role],
  };
}
