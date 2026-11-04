import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsBanner } from "./NotificationAlerts";
import type { NotificationCenter, NotificationGroup } from "./notification-center";

const shellCss = readFileSync(`${process.cwd()}/src/styles/03-shell.css`, "utf8");
const baseCss = readFileSync(`${process.cwd()}/src/styles/01-base.css`, "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[}/]\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? "";
}

function centerWith(groups: NotificationGroup[]) {
  return { bannerGroups: groups } as unknown as NotificationCenter;
}

const overdue: NotificationGroup = {
  key: "overdue",
  kind: "overdueInstallments" as NotificationGroup["kind"],
  label: "Parcelas vencidas",
  detail: "Parcelas em atraso",
  count: 3,
  to: "/financeiro",
  icon: null,
};

describe("barra de pendências (NB1)", () => {
  it("não aparece sem pendência destacada", () => {
    const { container } = render(
      <NotificationsBanner center={centerWith([])} onNavigate={vi.fn()} />,
    );
    expect(container.querySelector(".notification-banner")).toBeNull();
    expect(screen.queryByRole("region", { name: "Alertas" })).toBeNull();
  });

  it("aparece com a barra vermelha quando há pendência destacada", () => {
    render(
      <NotificationsBanner center={centerWith([overdue])} onNavigate={vi.fn()} />,
    );
    const banner = screen.getByRole("region", { name: "Alertas" });
    expect(banner).toHaveClass("notification-banner");
    expect(banner).toHaveTextContent("3 pendências pedem atenção");
    expect(
      screen.getByRole("button", { name: /Parcelas vencidas/ }),
    ).toHaveClass("notification-banner-item");
  });

  it("usa fundo vermelho forte com letra branca, sem enfeite animado", () => {
    expect(baseCss).toMatch(/--red: #b85d53;[\s\S]{0,400}--danger-strong: #963f35;/);
    const banner = rule(shellCss, ".notification-banner");
    expect(banner).toMatch(/background: var\(--danger-strong\);/);
    expect(banner).toMatch(/color: #fff;/);
    expect(banner).toMatch(/padding: var\(--space-1\) var\(--space-2\);/);
    expect(banner).toMatch(/font-size: var\(--text-sm\);/);
    expect(shellCss).not.toMatch(/notification-banner-(breathe|ring|shake)/);
    const focus = rule(shellCss, ".notification-banner-item:focus-visible");
    expect(focus).toMatch(/outline: 2px solid #fff;/);
  });
});
