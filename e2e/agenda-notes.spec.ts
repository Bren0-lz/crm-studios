import { test, expect, login, clinicToday } from "./fixtures.js";

test("agenda notes repeat, edit by scope and persist the visibility toggle", async ({
  page,
  api,
}, testInfo) => {
  await login(page);
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Nova nota", exact: true });
  await dialog
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Reunião da equipe para organizar os horários da próxima semana");
  await dialog.getByLabel("Data", { exact: true }).fill(clinicToday());
  await dialog.getByLabel("Cor do fundo").selectOption("#facc15");
  await dialog.getByLabel("Para quem mostrar").selectOption("all");
  await dialog.getByLabel("Repetir nota", { exact: true }).check();
  const until = new Date(`${clinicToday()}T12:00:00-03:00`);
  until.setUTCDate(until.getUTCDate() + 7);
  await dialog.getByLabel("Repetir até").fill(until.toISOString().slice(0, 10));
  await page.screenshot({
    path: testInfo.outputPath("agenda-note-form.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Salvar nota" }).click();
  await expect(dialog).toHaveCount(0);
  const note = page.getByRole("button", {
    name: "Detalhes da nota: Reunião da equipe para organizar os horários da próxima semana",
    exact: true,
  });
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS("background-color", "rgb(250, 204, 21)");
  await expect(note).toHaveCSS("color", "rgb(0, 0, 0)");
  const response = await api.get(
    `/agenda-notes?from=${clinicToday()}T00:00:00-03:00&to=${until.toISOString().slice(0, 10)}T23:59:59-03:00`,
  );
  const notes = await response.json();
  expect(notes).toHaveLength(2);
  expect(notes[0].seriesId).toBe(notes[1].seriesId);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(note).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("agenda-notes-list.png"),
    fullPage: true,
  });
  await note.click();
  dialog = page.getByRole("dialog", { name: "Detalhes da nota", exact: true });
  await dialog.getByRole("button", { name: "Editar", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await dialog
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Reunião atualizada");
  await dialog.getByLabel("Aplicar a").selectOption("following");
  await dialog.getByRole("button", { name: "Salvar nota" }).click();
  const updated = page.getByRole("button", {
    name: "Detalhes da nota: Reunião atualizada",
    exact: true,
  });
  await expect(updated).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Mostrar notas", exact: true })
    .uncheck();
  await expect(updated).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Mostrar notas", exact: true }),
  ).not.toBeChecked();
  await expect(updated).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Mostrar notas", exact: true })
    .check();
  await updated.click();
  dialog = page.getByRole("dialog", { name: "Detalhes da nota", exact: true });
  await dialog.getByRole("button", { name: "Excluir", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Excluir nota", exact: true });
  await dialog.getByLabel("Aplicar a").selectOption("following");
  await dialog
    .getByRole("button", { name: "Confirmar exclusão", exact: true })
    .click();
  await expect(updated).toHaveCount(0);
  expect(
    await (
      await api.get(
        `/agenda-notes?from=${clinicToday()}T00:00:00-03:00&to=${until.toISOString().slice(0, 10)}T23:59:59-03:00`,
      )
    ).json(),
  ).toEqual([]);
});
