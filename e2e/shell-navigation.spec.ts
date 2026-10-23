import { test, expect, login, selectPatient } from "./fixtures.js";

test("SOS search and contact remain usable with long names on desktop and a small viewport", async ({
  page,
  api,
}, testInfo) => {
  const longName =
    "Cliente SOS 23 de Albuquerque e Vasconcelos com nome completo extenso";
  const contactName =
    "Maria Almeida de Albuquerque e Vasconcelos responsável pelo contato de emergência";
  for (let index = 0; index < 24; index++) {
    const response = await api.post("/patients", {
      data: {
        fullName:
          index === 23
            ? longName
            : `Cliente SOS ${String(index).padStart(2, "0")}`,
        phone: "11999991234",
        tags: [],
        emergencyContactName: contactName,
        emergencyContactPhone: "11988887777",
      },
    });
    expect(response.status()).toBe(201);
  }
  await login(page);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    const sos = page
      .getByRole("banner")
      .getByRole("button", { name: "SOS", exact: true });
    await sos.click();
    const dialog = page.getByRole("dialog", { name: "SOS" });
    const search = dialog.getByRole("combobox", {
      name: "Cliente",
      exact: true,
    });
    await expect(dialog.getByRole("button", { name: "Fechar" })).toBeFocused();
    await expect(search).not.toBeFocused();
    await expect(search).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await expect(search).toHaveValue("");
    const initialBox = (await dialog.boundingBox())!;
    expect(initialBox.height).toBe(viewport.width > 700 ? 480 : 448);
    const expectStable = async () => {
      const box = (await dialog.boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const)
        expect(Math.abs(box[key] - initialBox[key])).toBeLessThanOrEqual(1);
    };
    await page.screenshot({
      path: testInfo.outputPath(`sos-${viewport.width}-initial.png`),
    });
    const contactBefore = await dialog
      .locator(".emergency-contact-card")
      .boundingBox();
    const servicesBefore = await dialog
      .locator(".emergency-services")
      .boundingBox();
    await expectStable();
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await search.fill("Cliente SOS");
    await expect(dialog.getByRole("option")).toHaveCount(24);
    const results = dialog.locator(".patient-picker-results");
    expect(
      await results
        .locator("ul")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    const body = dialog.locator(".modal-body");
    const listBox = await results.boundingBox();
    const inputBox = (await search.boundingBox())!;
    await expectStable();
    expect(
      await dialog.locator(".emergency-contact-card").boundingBox(),
    ).toEqual(contactBefore);
    expect(await dialog.locator(".emergency-services").boundingBox()).toEqual(
      servicesBefore,
    );
    expect(
      await results.evaluate((element) => element.matches(":popover-open")),
    ).toBe(true);
    expect(listBox!.height).toBeLessThanOrEqual(240);
    expect(Math.abs(listBox!.width - inputBox.width)).toBeLessThanOrEqual(1);
    expect(listBox!.x).toBeGreaterThanOrEqual(12);
    expect(listBox!.y).toBeGreaterThanOrEqual(12);
    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(
      viewport.height - 12 + 1,
    );
    await page.screenshot({
      path: testInfo.outputPath(`sos-${viewport.width}-search.png`),
    });
    await search.press("ArrowUp");
    const target = dialog.getByRole("option", { name: longName, exact: true });
    await expect(target).toBeInViewport();
    await search.press("Enter");
    await expect(dialog.getByText(contactName, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("(11) 98888-7777", { exact: true }),
    ).toBeVisible();
    await expectStable();
    const call = dialog.getByRole("link", { name: "Ligar para 11988887777" });
    await call.scrollIntoViewIfNeeded();
    await expect(call).toBeInViewport();
    await expect(call).toHaveAttribute("href", "tel:11988887777");
    await page.screenshot({
      path: testInfo.outputPath(`sos-${viewport.width}-contact.png`),
    });
    const links = dialog.locator(".emergency-service-links a");
    const boxes = await links.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width } = element.getBoundingClientRect();
        return { x, y, width };
      }),
    );
    if (viewport.width > 700) {
      expect(boxes.map((box) => box.y)).toEqual([
        boxes[0]!.y,
        boxes[0]!.y,
        boxes[0]!.y,
      ]);
      expect(
        Math.max(...boxes.map((box) => box.width)) -
          Math.min(...boxes.map((box) => box.width)),
      ).toBeLessThan(1);
    } else {
      expect(boxes.map((box) => box.x)).toEqual([
        boxes[0]!.x,
        boxes[0]!.x,
        boxes[0]!.x,
      ]);
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
      expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y);
    }
    for (const [name, number] of [
      ["Polícia", "190"],
      ["SAMU", "192"],
      ["Bombeiros", "193"],
    ]) {
      const link = dialog.getByRole("link", { name: `${name} · ${number}` });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
      await expect(link).toHaveAttribute("href", `tel:${number}`);
    }
    await page.screenshot({
      path: testInfo.outputPath(`sos-${viewport.width}-services.png`),
    });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await body.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const close = dialog.getByRole("button", { name: "Fechar" });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("link", { name: "Bombeiros · 193" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await search.focus();
    await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await search.fill("Cliente SOS");
    await expect(dialog.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expectStable();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(sos).toBeFocused();
  }
});

test("SOS keeps its bounds during contact loading, missing contact, errors and retry", async ({
  page,
  api,
}) => {
  for (const [name, phone] of [
    ["Cliente SOS com contato", "11988887777"],
    ["Cliente SOS sem contato", ""],
  ]) {
    const response = await api.post("/patients", {
      data: {
        fullName: name,
        phone: "11999991234",
        tags: [],
        emergencyContactName: phone ? "Maria Almeida" : "",
        emergencyContactPhone: phone,
      },
    });
    expect(response.status()).toBe(201);
  }
  await login(page);
  let releaseContact: (() => void) | undefined;
  let failContact = false;
  await page.route("**/api/patients/*/emergency-contact", async (route) => {
    await new Promise<void>((resolve) => {
      releaseContact = resolve;
    });
    if (failContact) await route.abort("failed");
    else await route.fallback();
  });
  const finishContact = async () => {
    await expect.poll(() => Boolean(releaseContact)).toBe(true);
    releaseContact!();
    releaseContact = undefined;
  };
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "SOS", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "SOS" });
    const initialBox = (await dialog.boundingBox())!;
    const expectStable = async () => {
      const box = (await dialog.boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const)
        expect(Math.abs(box[key] - initialBox[key])).toBeLessThanOrEqual(1);
    };
    await selectPatient(dialog, "Cliente SOS com contato");
    await expect(dialog.getByRole("status")).toHaveText(
      "Consultando contato de emergência…",
    );
    await expectStable();
    await finishContact();
    await expect(
      dialog.getByText("Maria Almeida", { exact: true }),
    ).toBeVisible();
    await expectStable();
    await selectPatient(dialog, "Cliente SOS sem contato");
    await expect(dialog.getByRole("status")).toHaveText(
      "Consultando contato de emergência…",
    );
    await expectStable();
    await finishContact();
    await expect(
      dialog.getByText("Contato de emergência não cadastrado."),
    ).toBeVisible();
    await expectStable();
    failContact = true;
    await selectPatient(dialog, "Cliente SOS com contato");
    await finishContact();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expectStable();
    failContact = false;
    await dialog.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Consultando contato de emergência…",
    );
    await expectStable();
    await finishContact();
    await expect(
      dialog.getByText("Maria Almeida", { exact: true }),
    ).toBeVisible();
    await expectStable();
    await dialog.getByRole("button", { name: "Fechar" }).click();
  }
});

test("SOS stays in the header after scrolling and opens over the entire viewport", async ({
  page,
  api,
}) => {
  const created = await api.post("/patients", {
    data: {
      fullName: "Cliente de teste do SOS",
      phone: "11999991234",
      tags: [],
      emergencyContactName: "Maria Almeida",
      emergencyContactPhone: "11988887777",
    },
  });
  expect(created.status()).toBe(201);
  await login(page);
  await page.goto("/configuracoes");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page
    .getByRole("button", { name: "Salvar configurações", exact: true })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const sos = page
    .getByRole("banner")
    .getByRole("button", { name: "SOS", exact: true });
  await expect(sos).toBeInViewport();
  if (page.viewportSize()!.width <= 820)
    await expect(page.getByRole("navigation")).toBeHidden();
  await sos.click();
  const dialog = page.getByRole("dialog", { name: "SOS" });
  await expect(dialog).toBeVisible();
  expect(
    await page.locator("body > .modal-backdrop").boundingBox(),
  ).toMatchObject({
    x: 0,
    y: 0,
    width: page.viewportSize()!.width,
    height: page.viewportSize()!.height,
  });
  await selectPatient(dialog, "Cliente de teste do SOS");
  await expect(
    dialog.getByText("Maria Almeida", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Ligar para 11988887777" }),
  ).toHaveAttribute("href", "tel:11988887777");
  await expect(
    dialog.getByRole("link", { name: "SAMU · 192" }),
  ).toHaveAttribute("href", "tel:192");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(sos).toBeFocused();
});

test("sidebar keeps branding and long-name profile visible while only navigation scrolls", async ({
  page,
  api,
}, testInfo) => {
  const fullName = "Aryana Dutra de Albuquerque e Vasconcelos";
  const created = await api.post("/admin/users", {
    data: {
      fullName,
      email: "sidebar@example.com",
      password: "SenhaForte123",
      role: "admin",
    },
  });
  expect(created.status()).toBe(201);
  await login(page, "sidebar@example.com", "SenhaForte123");
  for (const viewport of [
    { width: 1280, height: 600 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    const mobile = viewport.width <= 820;
    const sos = page
      .getByRole("banner")
      .getByRole("button", { name: "SOS", exact: true });
    await expect(sos).toBeInViewport();
    if (mobile) await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect
      .poll(async () => (await page.locator(".sidebar").boundingBox())?.x)
      .toBe(0);
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    for (const name of ["Rotina", "Relacionamento", "Gestão"])
      await expect(nav.getByRole("group", { name })).toHaveCount(1);
    await expect(page.locator(".sidebar-head")).toBeInViewport();
    await expect(page.locator(".user-card")).toBeInViewport();
    await expect(page.locator(".user-card strong")).toHaveText(fullName);
    await expect(
      page.getByRole("button", { name: "Sair de todos os dispositivos" }),
    ).toBeInViewport();
    const sidebarBefore = await page.locator(".sidebar").boundingBox();
    const footerBefore = await page.locator(".sidebar-bottom").boundingBox();
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-${viewport.width}-top.png`),
    });
    await nav
      .getByRole("link", { name: "Configurações", exact: true })
      .scrollIntoViewIfNeeded();
    expect(await page.locator(".sidebar").boundingBox()).toEqual(sidebarBefore);
    expect(await page.locator(".sidebar-bottom").boundingBox()).toEqual(
      footerBefore,
    );
    expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-${viewport.width}.png`),
    });
    const settings = nav.getByRole("link", {
      name: "Configurações",
      exact: true,
    });
    await settings.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/configuracoes$/);
    if (mobile) {
      await expect(nav).toBeHidden();
      await expect(sos).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "SOS" });
  await expect(dialog).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("sos-320.png") });
});
