import {
  appModuleSchema,
  effectiveEditModules,
  effectiveModules,
  type AppModule,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  legacyEffectiveEditModules,
  legacyEffectiveModules,
  legacyRoleDefaultEditModules,
  legacyRoleDefaultModules,
  legacyRoles,
  migrateLegacyUser,
} from "./legacy-roles.js";

/** Listas gravadas possíveis antes da migração (sem ajuste, ajustes variados). */
const storedSamples: Array<readonly AppModule[] | null> = [
  null,
  [],
  ["agenda"],
  ["finance", "agenda", "crm"],
  ["clinical", "patients"],
  [...appModuleSchema.options],
];

describe("migração 0042 (perfis antigos → admin/usuário comum)", () => {
  it("mantém exatamente o acesso de cada perfil antigo, com e sem ajuste gravado", () => {
    for (const role of legacyRoles)
      for (const modules of storedSamples)
        for (const editModules of storedSamples) {
          const before = {
            modules: legacyEffectiveModules(role, modules),
            editModules: legacyEffectiveEditModules(role, modules, editModules),
          };
          const migrated = migrateLegacyUser({ role, modules, editModules });
          const after = {
            modules: effectiveModules(migrated.role, migrated.modules),
            editModules: effectiveEditModules(
              migrated.role,
              migrated.modules,
              migrated.editModules,
            ),
          };
          expect(
            after,
            `${role} ${String(modules)} ${String(editModules)}`,
          ).toEqual(before);
        }
  });

  it("converte owner em admin sem lista e os demais em usuário comum com lista", () => {
    expect(
      migrateLegacyUser({ role: "owner", modules: null, editModules: null }),
    ).toEqual({
      role: "admin",
      modules: null,
      editModules: null,
    });
    for (const role of ["reception", "physiotherapist", "finance"] as const) {
      const migrated = migrateLegacyUser({
        role,
        modules: null,
        editModules: null,
      });
      expect(migrated.role).toBe("user");
      expect(migrated.modules).toEqual(legacyRoleDefaultModules[role]);
      expect(migrated.editModules).toEqual(legacyRoleDefaultEditModules[role]);
    }
  });
});
