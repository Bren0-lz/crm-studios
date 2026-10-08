import { describe, expect, it } from "vitest";
import {
  adminUserInputSchema,
  adminUserUpdateSchema,
  appModuleSchema,
} from "./index.js";
import {
  effectivePermissions,
  legacyPermissions,
  normalizePermissions,
  permissionCatalog,
  permissionKeys,
  resolvePermissionInput,
  togglePermissions,
} from "./permissions.js";

describe("operation permissions", () => {
  it("grants history independently and gives no history access to existing settings users", () => {
    expect(effectivePermissions("admin")).toContain("history.view");
    expect(effectivePermissions("user")).not.toContain("history.view");
    expect(legacyPermissions("user", ["settings"], ["settings"])).not.toContain("history.view");
    expect(normalizePermissions(["history.view"])).toEqual(["history.view"]);
  });
  it("has unique stable keys, known dependencies and one view permission per module", () => {
    expect(new Set(permissionKeys).size).toBe(permissionKeys.length);
    for (const module of appModuleSchema.options)
      expect(permissionKeys).toContain(`${module}.view`);
    for (const item of permissionCatalog) {
      for (const dependency of item.dependencies)
        expect(permissionKeys).toContain(dependency);
      if (!item.key.endsWith(".view"))
        expect(item.dependencies).toContain(`${item.module}.view`);
    }
  });
  it("denies missing prerequisites and normalizes duplicates in catalog order", () => {
    expect(normalizePermissions(["finance.receive"])).toEqual([]);
    expect(
      normalizePermissions([
        "finance.receive",
        "finance.view",
        "finance.receive",
      ]),
    ).toEqual(["finance.view", "finance.receive"]);
    expect(effectivePermissions("user")).toEqual([]);
    expect(effectivePermissions("admin", [])).toEqual(permissionKeys);
  });
  it("selects prerequisite permissions and removes dependent operations", () => {
    const selected = togglePermissions([], ["agenda.blocks_create"], true);
    expect(selected).toEqual([
      "agenda.view",
      "agenda.blocks_create",
      "patients.view",
    ]);
    expect(togglePermissions(selected, ["patients.view"], false)).toEqual([
      "agenda.view",
    ]);
  });
  it("migrates existing view/edit access without granting formerly admin-only export", () => {
    const view = legacyPermissions(
      "user",
      ["patients", "clinical", "reports"],
      [],
    );
    expect(view).toContain("clinical.export");
    expect(view).toContain("reports.export");
    expect(view).not.toContain("patients.export");
    expect(view).not.toContain("patients.inventory_view");
    const edit = legacyPermissions("user", ["agenda"], ["agenda"]);
    expect(edit).toContain("agenda.create");
    expect(edit).toContain("agenda.cancel");
    expect(edit).not.toContain("agenda.blocks_create");
  });
  it("rejects unknown, mixed and incomplete inputs", () => {
    const input = { fullName: "Test User", role: "user", active: true };
    expect(
      adminUserUpdateSchema.safeParse({ ...input, permissions: ["unknown"] })
        .success,
    ).toBe(false);
    expect(
      adminUserUpdateSchema.safeParse({
        ...input,
        permissions: [],
        modules: null,
      }).success,
    ).toBe(false);
    expect(
      adminUserUpdateSchema.safeParse({
        ...input,
        permissions: ["finance.receive"],
      }).success,
    ).toBe(false);
    expect(
      adminUserInputSchema.safeParse({
        fullName: "Test User",
        role: "user",
        email: "test@example.com",
        password: "Password123",
        permissions: [],
      }).success,
    ).toBe(true);
  });
  it("preserves omitted permissions, clears explicit empty arrays and translates legacy inputs", () => {
    const previous = ["finance.view", "finance.receive"] as const;
    expect(resolvePermissionInput("user", {}, previous)).toEqual(previous);
    expect(
      resolvePermissionInput("user", { permissions: [] }, previous),
    ).toEqual([]);
    expect(
      resolvePermissionInput("user", {
        modules: ["patients"],
        editModules: [],
      }),
    ).toEqual(["patients.view"]);
  });
});
