import {
  test,
  expect,
  login,
  seedPatient,
  selectPatient,
  chooseAppointmentTime,
  clinicToday,
} from "./fixtures.js";

test("schedules and reschedules an appointment without creating another occurrence", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Agenda Navegador");
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms = await (await api.get("/rooms")).json();
  await login(page);
  await page.goto("/agenda");
  await page
    .getByRole("button", { name: "Novo atendimento", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Novo atendimento",
    exact: true,
  });
  await selectPatient(dialog, patient.fullName);
  await dialog
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("regular");
  await dialog
    .getByRole("combobox", { name: "Serviço", exact: true })
    .selectOption(services[0].id);
  await dialog
    .getByRole("combobox", { name: "Profissional", exact: true })
    .selectOption(professionals[0].id);
  await dialog
    .getByRole("combobox", { name: "Sala", exact: true })
    .selectOption(rooms[0].id);
  await chooseAppointmentTime(dialog, clinicToday(), "21:00");
  await dialog
    .getByRole("button", { name: "Confirmar atendimento", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `Detalhes de ${patient.fullName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remarcar atendimento", exact: true })
    .click();
  const reschedule = page.getByRole("dialog", {
    name: "Reagendar atendimento",
    exact: true,
  });
  await chooseAppointmentTime(reschedule, clinicToday(), "22:00");
  await reschedule
    .getByRole("button", {
      name: /Confirmar reagendamento|Salvar reagendamento/,
    })
    .click();
  await expect(reschedule).toHaveCount(0);
  const day = clinicToday();
  const from = new Date(`${day}T00:00:00-03:00`).toISOString();
  const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();
  const appointmentsResponse = await api.get(
    `/appointments?${new URLSearchParams({ from, to })}`,
  );
  expect(appointmentsResponse.ok()).toBe(true);
  const appointments = await appointmentsResponse.json();
  const matches = appointments.filter(
    (item: { patientId: string }) => item.patientId === patient.id,
  );
  expect(matches).toHaveLength(1);
  expect(
    new Date(matches[0].startsAt).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  ).toBe("22:00");
  const history = await (
    await api.get(`/appointments/${matches[0].id}/reschedules`)
  ).json();
  expect(history).toHaveLength(1);
});
