import { test, expect, login } from "./fixtures.js";

test("daily agenda metrics remain readable on desktop and mobile", async ({
  page,
}) => {
  await login(page);
  const metrics = page.getByRole("region", {
    name: "Resumo da agenda de hoje",
  });
  await expect(metrics.getByRole("article")).toHaveCount(4);
  for (const label of [
    "Atendimentos hoje",
    "Pendentes hoje",
    "A confirmar",
    "Já finalizados",
  ])
    await expect(metrics.getByText(label, { exact: true })).toBeVisible();
  await expect(
    metrics.getByText("Sem cancelados", { exact: true }),
  ).toBeVisible();
  await expect(
    metrics.getByText("Aguardando finalização", { exact: true }),
  ).toBeVisible();
  await expect(
    metrics.getByText("Ainda sem confirmação", { exact: true }),
  ).toBeVisible();
  await expect(metrics.getByText(/de \d+ atendimentos hoje/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const cards = await metrics.getByRole("article").all();
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  if (page.viewportSize()!.width <= 700) {
    for (let index = 1; index < boxes.length; index++)
      expect(boxes[index]!.y).toBeGreaterThanOrEqual(
        boxes[index - 1]!.y + boxes[index - 1]!.height,
      );
  } else {
    for (const box of boxes) expect(box!.y).toBe(boxes[0]!.y);
  }
});

test("all operational modules open without application errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const route of [
    "/",
    "/clientes",
    "/agenda",
    "/turmas",
    "/planos",
    "/financeiro",
    "/comercial",
    "/relacionamento",
    "/comunicacoes",
    "/contratos",
    "/prontuarios",
    "/historico",
    "/relatorios",
    "/configuracoes",
  ]) {
    await page.goto(route);
    await expect(page.locator(".page-header")).toBeVisible();
    await expect(page.locator(".loading-block")).toHaveCount(0);
    await expect(page.locator(".error-banner")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("clinic name stays visible in the mobile header without horizontal scroll", async ({
  page,
  api,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Cabeçalho de celular.");
  const branch = await api.post("/admin/branches", {
    data: { name: "Unidade com nome extenso para testar o cabeçalho" },
  });
  expect(branch.status()).toBe(201);
  await login(page);
  const banner = page.getByRole("banner");
  for (const viewport of [
    { width: 440, height: 956 },
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      banner.getByText("Studios Aryana", { exact: true }),
    ).toBeVisible();
    const label = (await page.locator(".clinic-label").boundingBox())!;
    expect(label.width).toBeGreaterThan(0);
    const actions = [
      page.getByRole("combobox", { name: "Filial ativa" }),
      banner.getByRole("button", { name: "SOS", exact: true }),
      banner.getByRole("button", { name: /^Notificações/ }),
    ];
    const boxes = [];
    for (const action of actions) {
      await expect(action).toBeInViewport({ ratio: 1 });
      boxes.push((await action.boundingBox())!);
    }
    // Ações numa linha só, à direita do nome.
    for (const box of boxes) {
      expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThanOrEqual(8);
      expect(box.x).toBeGreaterThanOrEqual(label.x + label.width);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test("agenda day grid fits below the sticky header on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Grade da agenda no celular.");
  await login(page);
  await page.goto("/agenda");
  const grid = page.locator(".day-grid-scroll");
  await expect(grid).toBeVisible();
  await grid.evaluate((element) => element.scrollIntoView());
  // A grade inteira fica à vista abaixo do topo fixo: rolando dentro dela, nada some.
  await expect
    .poll(async () => {
      const [topbar, box, viewport] = await Promise.all([
        page.locator(".topbar").boundingBox(),
        grid.boundingBox(),
        page.evaluate(() => window.innerHeight),
      ]);
      return (
        box!.y >= topbar!.y + topbar!.height - 1 &&
        box!.y + box!.height <= viewport + 1 &&
        // e ocupa o resto da tela (antes eram 70vh, com parte escondida sob o topo).
        box!.y + box!.height >= viewport - 24
      );
    })
    .toBe(true);
  expect(
    await grid.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
});
