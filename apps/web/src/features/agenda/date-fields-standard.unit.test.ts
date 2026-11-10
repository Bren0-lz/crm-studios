import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** Todos os .tsx do app (menos testes). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("date fields (V6)", () => {
  it("uses the custom picker only where scheduling shows occupancy; everything else is native", () => {
    const root = join(process.cwd(), "src");
    const users = sources(root)
      .filter((file) =>
        /import \{ AppointmentDateTimePicker \}/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(root, file).replaceAll("\\", "/"))
      .filter((file) => !file.endsWith("AppointmentDateTimePicker.tsx"))
      .sort();
    expect(users).toEqual([
      "features/agenda/AppointmentForm.tsx",
      "features/agenda/AppointmentRescheduleModal.tsx",
      "features/commercial/LeadAppointmentModal.tsx",
      "features/plan-purchase/PlanScheduleSummary.tsx",
    ]);
  });
});
