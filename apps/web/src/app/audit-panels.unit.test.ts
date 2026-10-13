/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function audit(files: Record<string, string>, selected?: string) {
  const root = mkdtempSync(join(tmpdir(), "crm-layout-audit-"));
  roots.push(root);
  writeFileSync(join(root, "styles.css"), '@import "./components.css";');
  writeFileSync(
    join(root, "components.css"),
    ".panel-head { padding: 24px; } :root { --text-md: 14px; }",
  );
  for (const [name, source] of Object.entries(files))
    writeFileSync(join(root, name), source);
  return spawnSync(process.execPath, [resolve("scripts/audit-panels.cjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      AUDIT_WEB_SRC: root,
      ...(selected ? { AUDIT_APP_TSX: join(root, selected) } : {}),
    },
  });
}

describe("layout audit after splitting screens", () => {
  it("inspects every production component, including files outside App.tsx", () => {
    const result = audit({
      "App.tsx": "export const App = () => <div />;",
      "PatientsPage.tsx":
        "export const Patients = () => <button>Salvar</button>;",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sem className");
  });
  it("follows ordered CSS imports and excludes test fixtures", () => {
    const result = audit({
      "App.tsx":
        'export const App = () => <div className="panel"><div className="panel-head">Título</div></div>;',
      "fixture.unit.test.tsx":
        "export const Bad = () => <button>Sem classe</button>;",
    });
    expect(result.status, result.stderr).toBe(0);
  });
  it("preserves AUDIT_APP_TSX and detects backdrop click handlers", () => {
    const result = audit(
      {
        "App.tsx": "export const App = () => <div />;",
        "Modal.tsx":
          'export const Modal = () => <div className="modal-backdrop" onClick={() => {}} />;',
      },
      "Modal.tsx",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fundo de modal");
  });
});
