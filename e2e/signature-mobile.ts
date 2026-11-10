import { devices, expect, type Page } from "@playwright/test";

// Os links de assinatura (contrato e recibo) são abertos pelo cliente no celular (reunião de
// 02/11/2026: iPhone/iOS 18). Só há Chromium no projeto: emulamos o iPhone (tela, densidade,
// toque e navegador).
export const iPhone = { ...devices["iPhone 13"] };
delete (iPhone as { defaultBrowserType?: string }).defaultBrowserType;

export async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

/** A resolução do canvas acompanha a caixa (também depois de girar o celular). */
export async function canvasMatchesItsBox(page: Page) {
  const size = await page
    .getByRole("img", { name: "Área de assinatura", exact: true })
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      return {
        width: canvas.width,
        expected: Math.round(canvas.clientWidth * ratio),
      };
    });
  expect.soft(size.width).toBe(size.expected);
}

/** Desenha um traço com o toque na área de assinatura. */
export async function drawSignature(page: Page) {
  const pad = page.getByRole("img", {
    name: "Área de assinatura",
    exact: true,
  });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(box.x + 20 + step * 20, box.y + 30 + (step % 3) * 20);
  await page.mouse.up();
}
