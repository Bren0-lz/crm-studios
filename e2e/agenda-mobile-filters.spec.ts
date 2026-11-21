import type { Page } from "@playwright/test";
import { test, expect, login } from "./fixtures.js";

// RF10 (D2): no celular, filtros e legendas da Agenda ficam recolhidos no botão "Filtros" e a
// grade do Dia começa logo abaixo das datas, dentro da primeira tela.
const phones = [
  { width: 440, height: 956 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

/** Separa os cenários do cabeçalho das pendências da base de demonstração. */
async function bannerAlerts(page: Page, apiUrl: string, alerts: boolean) {
  await page.route("**/api/notifications", async (route) => {
    const response = await route.fetch({ url: `${apiUrl}/notifications` });
    await route.fulfill({
      response,
      json: {
        date: (await response.json()).date,
        ...(alerts ? { overdueReceivables: 4, pendingFinalization: 7 } : {}),
      },
    });
  });
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

for (const viewport of phones) {
  for (const alerts of [false, true]) {
    test(`phone ${viewport.width}x${viewport.height}${alerts ? " with alerts" : ""}: day grid starts below the dates in the first screen`, async ({
      page,
      apiServer,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "Celular.");
      await page.setViewportSize(viewport);
      await bannerAlerts(page, apiServer.url, alerts);
      await login(page);
      await page.goto("/agenda");
      const banner = page.getByRole("region", { name: "Alertas", exact: true });
      if (alerts) await expect(banner).toBeVisible();
      else await expect(banner).toHaveCount(0);
      const grid = page.locator(".day-grid-scroll");
      await expect(grid).toBeVisible();

      // Filtros e legendas recolhidos; Dia/Semana/Mês e Grade/Lista à vista.
      const toggle = page.getByRole("button", { name: "Filtros" });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      for (const name of ["Mostrar notas", "Mostrar cancelados"])
        await expect(page.getByRole("checkbox", { name })).toBeHidden();
      await expect(page.getByLabel("Legenda dos status")).toBeHidden();
      await expect(page.getByLabel("Legenda dos profissionais")).toBeHidden();
      await expect(
        page.getByRole("combobox", { name: "Profissional" }),
      ).toBeHidden();
      for (const name of ["Dia", "Semana", "Mês", "Grade", "Lista"])
        await expect(
          page.getByRole("button", { name, exact: true }),
        ).toBeVisible();

      // A grade começa logo abaixo das datas, dentro da primeira tela: o cabeçalho dos
      // profissionais à vista e, sem a faixa de alertas, pelo menos 200px de horários.
      const header = grid.locator("thead tr").first();
      await expect
        .poll(async () => {
          const [dates, gridBox, headerBox] = await Promise.all([
            page.locator(".agenda-panel .date-navigator").boundingBox(),
            grid.boundingBox(),
            header.boundingBox(),
          ]);
          return {
            distanceFromDates: gridBox!.y - (dates!.y + dates!.height) <= 240,
            headerInViewport:
              headerBox!.y + headerBox!.height <= viewport.height,
            roomForTimes: alerts || gridBox!.y <= viewport.height - 200,
          };
        })
        .toEqual({
          distanceFromDates: true,
          headerInViewport: true,
          roomForTimes: true,
        });
      await noSideScroll(page);

      // Rolando até a grade e até o fim da página, a primeira linha dela não fica sob o topo
      // fixo (antes, no fim da página, o cabeçalho dos profissionais ficava sob o menu).
      for (const scroll of [
        () => grid.evaluate((element) => element.scrollIntoView()),
        () =>
          page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight),
          ),
      ]) {
        await scroll();
        await expect
          .poll(async () => {
            const [topbar, gridBox, headerBox] = await Promise.all([
              page.locator(".topbar").boundingBox(),
              grid.boundingBox(),
              header.boundingBox(),
            ]);
            const bottom = topbar!.y + topbar!.height;
            return (
              gridBox!.y >= bottom - 1 &&
              headerBox!.y >= bottom - 1 &&
              gridBox!.y + gridBox!.height <= viewport.height + 1
            );
          })
          .toBe(true);
      }
      await noSideScroll(page);
    });
  }

  test(`phone ${viewport.width}px: Filtros expands, collapses and keeps the filters`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Celular.");
    await page.setViewportSize(viewport);
    await login(page);
    await page.goto("/agenda");
    await expect(page.locator(".day-grid-scroll")).toBeVisible();
    const toggle = page.getByRole("button", { name: "Filtros" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const cancelled = page.getByRole("checkbox", {
      name: "Mostrar cancelados",
    });
    await expect(cancelled).toBeVisible();
    await expect(page.getByLabel("Legenda dos status")).toBeVisible();
    await expect(page.getByLabel("Legenda dos profissionais")).toBeVisible();
    const professional = page.getByRole("combobox", { name: "Profissional" });
    await expect(professional).toBeVisible();
    await noSideScroll(page);

    const columns = page.locator(".day-grid thead th");
    const before = await columns.count();
    await professional.selectOption({ index: 1 });
    await cancelled.check();
    await expect(columns).toHaveCount(before - 1);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(cancelled).toBeHidden();
    // Recolhidos, os filtros continuam aplicados e o botão mostra quantos estão ativos.
    await expect(columns).toHaveCount(before - 1);
    await expect(
      page.getByRole("button", { name: "Filtros, 2 ativos" }),
    ).toBeVisible();

    // Semana e Lista seguem sem rolagem lateral, com os filtros recolhidos.
    await page.getByRole("button", { name: "Lista", exact: true }).click();
    await expect(page.locator(".day-grid-scroll")).toHaveCount(0);
    await noSideScroll(page);
    await page.getByRole("button", { name: "Semana", exact: true }).click();
    await expect(page.locator(".week-agenda")).toBeVisible();
    await expect(cancelled).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Filtros, 2 ativos" }),
    ).toBeVisible();
    await noSideScroll(page);
  });
}

test("desktop: agenda filters stay in view without the Filtros button", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Computador.");
  await page.setViewportSize({ width: 1192, height: 860 });
  await login(page);
  await page.goto("/agenda");
  await expect(page.locator(".day-grid-scroll")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filtros" })).toBeHidden();
  const notes = page.getByRole("checkbox", { name: "Mostrar notas" });
  const cancelled = page.getByRole("checkbox", { name: "Mostrar cancelados" });
  for (const element of [
    notes,
    cancelled,
    page.getByLabel("Legenda dos status"),
    page.getByLabel("Legenda dos profissionais"),
    page.getByRole("combobox", { name: "Profissional" }),
  ])
    await expect(element).toBeVisible();
  // Mesma linha de antes: notas, Dia/Semana/Mês e cancelados, nessa ordem.
  const [notesBox, viewBox, cancelledBox] = await Promise.all([
    notes.boundingBox(),
    page.getByRole("group", { name: "Visualização da agenda" }).boundingBox(),
    cancelled.boundingBox(),
  ]);
  expect(Math.abs(notesBox!.y - cancelledBox!.y)).toBeLessThanOrEqual(24);
  expect(notesBox!.x).toBeLessThan(viewBox!.x);
  expect(viewBox!.x).toBeLessThan(cancelledBox!.x);
});
