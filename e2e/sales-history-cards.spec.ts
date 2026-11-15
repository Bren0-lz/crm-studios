import { test, expect, login, seedPatient, clinicToday } from "./fixtures.js";

test("sales history becomes stacked cards on mobile and stays a table on desktop", async ({
  page,
  api,
}, testInfo) => {
  const name = "Cliente Vendas Realizadas";
  const patient = await seedPatient(api, name);
  const product = await api.post("/inventory/products", {
    data: {
      name: "Creme hidratante de massagem corporal",
      sku: `RE5-${Date.now()}`,
      unit: "un",
      costInCents: 1_000,
      salePriceInCents: 4_000,
      initialStock: 5,
    },
  });
  expect(product.status(), await product.text()).toBe(201);
  const sale = await api.post("/product-sales", {
    data: {
      patientId: patient.id,
      items: [{ productId: (await product.json()).id, quantity: 1 }],
      settlement: "paid",
      paymentMethod: "pix",
      dueDate: clinicToday(),
    },
  });
  expect(sale.status(), await sale.text()).toBe(201);

  const mobile = testInfo.project.name === "mobile";
  // RE5: a triagem mediu a rolagem lateral num celular de 360px.
  if (mobile) await page.setViewportSize({ width: 360, height: 780 });
  await login(page);
  await page.goto("/vendas?aba=vendas");
  await expect(
    page.getByRole("button", { name: "Vendas realizadas", pressed: true }),
  ).toBeVisible();
  const table = page.getByRole("table", {
    name: "Vendas de produtos no período",
  });
  const row = table
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name }) });
  await expect(row).toBeVisible();
  const totalCell = row.locator('td[data-label="Total"]');
  const header = table.locator("thead");

  if (mobile) {
    // RE5: cada venda vira um cartão com o rótulo ao lado do valor; a página não rola de lado.
    for (const label of ["Data", "Vendedor", "Produtos", "Situação", "Total"])
      expect(
        await row
          .locator(`td[data-label="${label}"]`)
          .evaluate((cell) => getComputedStyle(cell, "::before").content),
      ).toBe(`"${label}"`);
    expect(
      await row.evaluate((element) => getComputedStyle(element).display),
    ).toBe("grid");
    expect(
      await header.evaluate((element) => element.clientHeight),
    ).toBeLessThanOrEqual(1);
    await row.scrollIntoViewIfNeeded();
    await expect(totalCell).toBeInViewport({ ratio: 1 });
    await expect(
      row.getByRole("button", { name: `Ver venda de ${name}` }),
    ).toBeInViewport({ ratio: 1 });
  } else {
    // No computador continua tabela: cabeçalho visível e sem rótulo repetido nas células.
    await expect(header).toBeVisible();
    expect(
      await row.evaluate((element) => getComputedStyle(element).display),
    ).toBe("table-row");
    expect(
      await totalCell.evaluate(
        (cell) => getComputedStyle(cell, "::before").content,
      ),
    ).toBe("none");
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
