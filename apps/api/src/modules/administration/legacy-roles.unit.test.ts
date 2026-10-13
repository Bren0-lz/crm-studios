import {
  appModuleSchema,
  effectiveEditModules,
  effectiveModules,
  type AppModule,
} from "@crm/contracts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  legacyEffectiveEditModules,
  legacyEffectiveModules,
  legacyRoleDefaultEditModules,
  legacyRoleDefaultModules,
  legacyRoles,
  migrateLegacyUser,
} from "./legacy-roles.js";

const migrationSql = readFileSync(
  fileURLToPath(
    new URL("../../../migrations/0042_user_types.sql", import.meta.url),
  ),
  "utf8",
);

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

  it("grava no SQL os mesmos padrões de cada perfil", () => {
    const pattern =
      /SET modules = COALESCE\(modules, ARRAY\[([^\]]*)\]::text\[\]\),\s+edit_modules = COALESCE\(edit_modules, ARRAY\[([^\]]*)\]::text\[\]\)\s+WHERE role = '(\w+)';/g;
    const parse = (list: string) =>
      list.split(",").map((item) => item.trim().replace(/^'|'$/g, ""));
    const found = new Map<
      string,
      { modules: string[]; editModules: string[] }
    >();
    for (const match of migrationSql.matchAll(pattern))
      found.set(match[3]!, {
        modules: parse(match[1]!),
        editModules: parse(match[2]!),
      });
    expect([...found.keys()].sort()).toEqual([
      "finance",
      "physiotherapist",
      "reception",
    ]);
    for (const role of ["reception", "physiotherapist", "finance"] as const)
      expect(found.get(role)).toEqual({
        modules: [...legacyRoleDefaultModules[role]],
        editModules: [...legacyRoleDefaultEditModules[role]],
      });
  });

  it("converte a coluna sem usar valor novo de ENUM (roda numa transação só)", () => {
    expect(migrationSql).not.toMatch(/ADD VALUE/i);
    expect(migrationSql).toMatch(
      /ALTER COLUMN role TYPE text USING role::text/,
    );
    expect(migrationSql).toMatch(/CHECK \(role IN \('admin', 'user'\)\)/);
    expect(migrationSql).toMatch(/DROP CONSTRAINT IF EXISTS users_role_check/);
    // owner só vira admin depois de os perfis comuns gravarem seus módulos.
    expect(migrationSql.indexOf("THEN 'admin' ELSE 'user'")).toBeGreaterThan(
      migrationSql.lastIndexOf("WHERE role = 'finance'"),
    );
  });
});
