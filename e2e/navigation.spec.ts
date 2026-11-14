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

test("agenda keeps only Novo atendimento in view on mobile and moves the rest to Mais", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "Cabeçalho da agenda no celular.",
  );
  await login(page);
  await page.goto("/agenda");
  const header = page.locator(".page-header");
  const create = header.getByRole("button", { name: "Novo atendimento" });
  const more = header.getByRole("button", { name: "Mais", exact: true });
  await expect(create).toBeVisible();
  await expect(more).toBeVisible();
  for (const name of ["Nova nota", "Bloquear horário"])
    await expect(
      header.getByRole("button", { name, exact: true }),
    ).toBeHidden();
  // Tudo numa linha só, acima da agenda.
  // Medidos juntos: o aviso de pendências pode surgir no topo e empurrar a página.
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([
        create.boundingBox(),
        more.boundingBox(),
      ]);
      return Math.abs(a!.y - b!.y);
    })
    .toBeLessThanOrEqual(8);
  await more.click();
  await page.getByRole("menuitem", { name: "Bloquear horário" }).click();
  await expect(
    page.getByRole("dialog", { name: "Bloquear horário" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
