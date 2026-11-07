import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsBanner } from "./NotificationAlerts";
import type {
  NotificationCenter,
  NotificationGroup,
} from "./notification-center";

const shellCss = readFileSync(
  `${process.cwd()}/src/styles/03-shell.css`,
  "utf8",
);
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
      <NotificationsBanner
        center={centerWith([overdue])}
        onNavigate={vi.fn()}
      />,
    );
    const banner = screen.getByRole("region", { name: "Alertas" });
    expect(banner).toHaveClass("notification-banner");
    expect(banner).toHaveTextContent("3 pendências pedem atenção");
    expect(
      screen.getByRole("button", { name: /Parcelas vencidas/ }),
    ).toHaveClass("notification-banner-item");
  });

  it("usa fundo branco com botões vermelhos e barra de rolagem estilizada", () => {
    expect(baseCss).toMatch(
      /--red: #b85d53;[\s\S]{0,400}--danger-strong: #963f35;/,
    );
    const banner = rule(shellCss, ".notification-banner");
    expect(banner).toMatch(/background: #fff;/);
    expect(banner).toMatch(/border: 1px solid var\(--danger-strong\);/);
    expect(banner).toMatch(/color: var\(--danger-strong\);/);
    expect(banner).toMatch(/padding: var\(--space-1\) var\(--space-2\);/);
    expect(banner).toMatch(/font-size: var\(--text-sm\);/);
    const item = rule(shellCss, ".notification-banner-item");
    expect(item).toMatch(/background: var\(--danger-strong\);/);
    expect(item).toMatch(/color: #fff;/);
    const focus = rule(shellCss, ".notification-banner-item:focus-visible");
    expect(focus).toMatch(/outline: 2px solid var\(--danger-strong\);/);
    // scrollbar-width anula os ::-webkit-scrollbar no Chrome (volta a barra cinza com setas).
    expect(rule(shellCss, ".notification-banner ul")).not.toMatch(
      /scrollbar-width/,
    );
    expect(shellCss).toMatch(
      /\.notification-banner ul::-webkit-scrollbar-thumb \{/,
    );
    expect(shellCss).not.toMatch(/notification-banner-(breathe|ring|shake)/);
  });
});

describe("rolagem automática da barra de pendências", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderOverflowing() {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
        "setTimeout",
        "clearTimeout",
      ],
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
    }));
    const sizes = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(1000);
    const client = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(400);
    render(
      <NotificationsBanner
        center={centerWith([overdue])}
        onNavigate={vi.fn()}
      />,
    );
    const banner = screen.getByRole("region", { name: "Alertas" });
    const list = banner.querySelector("ul")!;
    return {
      banner,
      list,
      restore: () => {
        sizes.mockRestore();
        client.mockRestore();
      },
    };
  }

  it("rola sozinha quando os atalhos não cabem e pausa com o mouse em cima", () => {
    const { banner, list, restore } = renderOverflowing();
    act(() => vi.advanceTimersByTime(3000));
    const moved = list.scrollLeft;
    expect(moved).toBeGreaterThan(0);

    fireEvent.mouseEnter(banner);
    act(() => vi.advanceTimersByTime(2000));
    expect(list.scrollLeft).toBe(moved);

    // Scroll manual com a rolagem pausada; ao sair, continua dali.
    list.scrollLeft = 300;
    fireEvent.mouseLeave(banner);
    act(() => vi.advanceTimersByTime(1000));
    expect(list.scrollLeft).toBeGreaterThan(300);
    restore();
  });

  it("não rola com movimento reduzido", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
    }));
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    const sizes = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(1000);
    render(
      <NotificationsBanner
        center={centerWith([overdue])}
        onNavigate={vi.fn()}
      />,
    );
    const list = screen
      .getByRole("region", { name: "Alertas" })
      .querySelector("ul")!;
    act(() => vi.advanceTimersByTime(4000));
    expect(list.scrollLeft).toBe(0);
    sizes.mockRestore();
  });
});
