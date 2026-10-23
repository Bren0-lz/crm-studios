import { test, expect, login, seedPatient, clinicToday } from "./fixtures.js";

test("preserves a clinical attachment through keyboard navigation, an upload failure and a retry", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Anexo Protegido");
  await login(page);
  await page.goto(`/clientes/${patient.id}`);
  await page.getByRole("tab", { name: "Prontuário", exact: true }).click();
  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Anexar arquivo", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Novo anexo clínico",
    exact: true,
  });
  await dialog.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "avaliacao.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nArquivo de avaliação clínica de teste"),
  });
  await dialog
    .getByLabel("Observações", { exact: true })
    .fill("Preservar este anexo após a falha");
  const attach = dialog.getByRole("button", {
    name: "Anexar arquivo",
    exact: true,
  });
  await attach.focus();
  await attach.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Fechar", exact: true }),
  ).toBeFocused();
  await dialog.press("Escape");
  const prompt = page.getByRole("dialog", {
    name: "Salvar as alterações?",
    exact: true,
  });
  await expect(prompt).toBeVisible();
  await prompt
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Observações", exact: true }),
  ).toHaveValue("Preservar este anexo após a falha");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = false;
  await page.route("**/api/clinical-attachments", async (route) => {
    if (failed) {
      await route.fallback();
      return;
    }
    failed = true;
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Envio temporariamente indisponível" }),
    });
  });
  await attach.click();
  await expect(
    dialog.getByRole("button", { name: "Fechar", exact: true }),
  ).toBeDisabled();
  await dialog.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(
    dialog.getByText("Envio temporariamente indisponível", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Anexar arquivo", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: "Arquivos", exact: true }).click();
  await expect(page.getByText("avaliacao.pdf", { exact: true })).toBeVisible();
});

test("manages clinical catalogs in settings and creates, orders, copies and records customer workouts", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Treino da Equipe"),
    professionals = await (await api.get("/professionals")).json();
  await login(page);
  await page.goto("/configuracoes");
  await page.getByRole("tab", { name: "Cadastros", exact: true }).click();
  const catalogs = page.getByText(
    "Aparelhos, exercícios e modelos de evolução",
    { exact: true },
  );
  await catalogs.focus();
  await catalogs.press("Enter");
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Novo registro", exact: true });
  await dialog.getByLabel("Nome", { exact: true }).fill("Reformer de teste");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Reformer de teste", exact: true }),
  ).toBeVisible();
  const equipment = (
    await (await api.get("/clinical-resources/catalog")).json()
  ).find((entry: { name: string }) => entry.name === "Reformer de teste");
  await page
    .getByRole("combobox", { name: "Seção", exact: true })
    .selectOption("exercise");
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Novo registro", exact: true });
  await dialog
    .getByLabel("Nome", { exact: true })
    .fill("Mobilidade no reformer");
  await dialog
    .getByRole("combobox", { name: "Aparelho", exact: true })
    .selectOption(equipment.id);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const exercise = (
      await (await api.get("/clinical-resources/catalog")).json()
    ).find(
      (entry: { name: string }) => entry.name === "Mobilidade no reformer",
    ),
    otherResponse = await api.post("/clinical-resources", {
      data: {
        kind: "exercise",
        name: "Respiração orientada",
        description: "Segundo exercício de teste",
        active: true,
      },
    });
  expect(otherResponse.status()).toBe(201);
  const other = await otherResponse.json();
  await page.goto(`/clientes/${patient.id}`);
  await page.getByRole("tab", { name: "Prontuário", exact: true }).click();
  await page
    .getByRole("tab", { name: "Treinos e documentos", exact: true })
    .click();
  const resources = page.getByText("Modelos, evoluções e treinos", {
    exact: true,
  });
  await resources.focus();
  await resources.press("Enter");
  await page
    .getByRole("combobox", { name: "Seção", exact: true })
    .selectOption("training");
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Novo registro", exact: true });
  await dialog
    .getByLabel("Nome", { exact: true })
    .fill("Treino personalizado da equipe");
  await dialog
    .getByRole("combobox", { name: "Profissional", exact: true })
    .selectOption(professionals[0].id);
  await dialog.getByLabel("Limite de execuções", { exact: true }).fill("1");
  await dialog
    .getByRole("combobox", { name: "Adicionar exercício", exact: true })
    .selectOption(exercise.id);
  await dialog
    .getByRole("combobox", { name: "Adicionar exercício", exact: true })
    .selectOption(other.id);
  const firstGroup = dialog.getByRole("group", {
    name: exercise.name,
    exact: true,
  });
  await firstGroup.getByLabel("Séries", { exact: true }).fill("3");
  await firstGroup.getByLabel("Repetições", { exact: true }).fill("12");
  await firstGroup
    .getByLabel("Pausa entre séries, segundos", { exact: true })
    .fill("45");
  await firstGroup
    .getByLabel("Observações do exercício", { exact: true })
    .fill("Movimento assistido pela equipe");
  await dialog
    .getByRole("group", { name: other.name, exact: true })
    .getByRole("button", { name: "Mover exercício para cima", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const created = (
    await (await api.get(`/clinical-resources?patientId=${patient.id}`)).json()
  ).find(
    (entry: { name: string }) =>
      entry.name === "Treino personalizado da equipe",
  );
  expect(
    created.data.exercises.map(
      (entry: { exerciseId: string }) => entry.exerciseId,
    ),
  ).toEqual([other.id, exercise.id]);
  expect(created.data.exercises[1]).toMatchObject({
    sets: 3,
    repetitions: "12",
    restSeconds: 45,
    notes: "Movimento assistido pela equipe",
  });
  await page
    .getByRole("combobox", { name: "Seção", exact: true })
    .selectOption("training_execution");
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Novo registro", exact: true });
  await dialog
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption(created.id);
  await dialog.getByLabel("Execução concluída", { exact: true }).check();
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Novo registro", exact: true });
  await dialog
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption(created.id);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    dialog.getByText("O limite de execuções deste treino foi atingido.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.press("Escape");
  await page
    .getByRole("dialog", { name: "Salvar as alterações?", exact: true })
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Seção", exact: true })
    .selectOption("training");
  await page
    .getByRole("button", { name: "Copiar treino", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Copiar treino", exact: true });
  await dialog
    .getByLabel("Nome", { exact: true })
    .fill("Treino copiado independente");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const records = await (
      await api.get(`/clinical-resources?patientId=${patient.id}`)
    ).json(),
    copy = records.find(
      (entry: { name: string }) => entry.name === "Treino copiado independente",
    );
  expect(copy.id).not.toBe(created.id);
  expect(copy.familyId).not.toBe(created.familyId);
  expect(copy.data.exercises).toEqual(created.data.exercises);
  expect(
    records.filter(
      (entry: { kind: string }) => entry.kind === "training_execution",
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("reconciles a paid commission without rewriting the original payout", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Comissão Conciliada"),
    services = await (await api.get("/services")).json(),
    professionals = await (await api.get("/professionals")).json(),
    rooms = await (await api.get("/rooms")).json();
  expect(
    (
      await api.post("/finance/commission-rules", {
        data: {
          professionalId: professionals[0].id,
          serviceId: services[0].id,
          kind: "fixed",
          percentage: 0,
          fixedAmountInCents: 1500,
          effectiveFrom: "2025-01-01",
        },
      })
    ).status(),
  ).toBe(201);
  const created = await api.post("/appointments", {
    data: {
      patientId: patient.id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      serviceId: services[0].id,
      startsAt: "2025-02-10T12:00:00Z",
      visitType: "trial",
      notes: "",
    },
  });
  expect(created.status()).toBe(201);
  const appointment = await created.json();
  expect(
    (
      await api.patch(`/appointments/${appointment.id}/status`, {
        data: { status: "completed" },
      })
    ).status(),
  ).toBe(200);
  const generated = await (
      await api.post("/finance/commissions/generate", {
        data: { competence: "2025-02" },
      })
    ).json(),
    commission = generated.find(
      (entry: { appointmentId: string }) =>
        entry.appointmentId === appointment.id,
    );
  expect(commission.amountInCents).toBe(1500);
  expect(
    (await api.post(`/finance/commissions/${commission.id}/pay`)).status(),
  ).toBe(200);
  const frozen = (
    await (await api.get("/finance/workspace")).json()
  ).commissions.find((entry: { id: string }) => entry.id === commission.id);
  expect(
    (
      await api.patch(`/appointments/${appointment.id}/status`, {
        data: { status: "confirmed" },
      })
    ).status(),
  ).toBe(200);
  await login(page);
  await page.goto("/financeiro");
  await page
    .locator(".finance-tabs")
    .getByRole("button", { name: /^Comissões \(/ })
    .click();
  await page
    .getByRole("button", {
      name: `Conciliar comissão de ${professionals[0].fullName}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Conciliar comissão",
    exact: true,
  });
  await expect(
    dialog.getByText("Pagamento original registrado", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Motivo da conciliação", { exact: true })
    .fill("Correção da presença registrada pela equipe");
  await dialog
    .getByRole("button", { name: "Confirmar conciliação", exact: true })
    .click();
  await expect(
    dialog.getByText(
      "Conciliação registrada com ajustes separados da comissão original.",
      { exact: true },
    ),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Registrar devolução ao caixa", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirmar baixa conciliada",
    exact: true,
  });
  await expect(confirmation).toContainText("já recebida");
  await confirmation
    .getByRole("button", { name: "Confirmar registro conciliado", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    dialog.getByText("Baixa conciliada registrada.", { exact: true }),
  ).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  const workspace = await (await api.get("/finance/workspace")).json();
  expect(
    workspace.commissions.find(
      (entry: { id: string }) => entry.id === commission.id,
    ),
  ).toEqual(frozen);
  expect(workspace.commissionAdjustments).toEqual([
    expect.objectContaining({
      commissionId: commission.id,
      amountInCents: -1500,
      status: "paid",
    }),
  ]);
  expect(
    (await (await api.get(`/finance/daily-cash?date=${clinicToday()}`)).json())
      .totalOutflowInCents,
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("records external proof manually with guarded edits and preserves the original invoice", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Comprovante Manual");
  const invoiceResponse = await api.post("/finance/receivables", {
    data: {
      patientId: patient.id,
      description: "Receita do comprovante",
      amountInCents: 5500,
      dueDate: clinicToday(),
    },
  });
  expect(invoiceResponse.status()).toBe(201);
  const invoice = await invoiceResponse.json();
  await login(page);
  await page.goto(`/financeiro?patientId=${patient.id}`);
  const summary = page.getByRole("button", {
    name: "Documentos fiscais",
    exact: true,
  });
  await summary.focus();
  await summary.press("Enter");
  await page
    .getByRole("button", { name: "Registrar operação externa", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar operação externa",
    exact: true,
  });
  await dialog
    .getByLabel("Emissor ou parceiro", { exact: true })
    .fill("Emissor comprovante navegador");
  await dialog.press("Escape");
  const guard = page.getByRole("dialog", {
    name: "Salvar as alterações?",
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Emissor ou parceiro", { exact: true }),
  ).toHaveValue("Emissor comprovante navegador");
  await dialog
    .getByLabel("Referência do documento ou operação", { exact: true })
    .fill("NF-Manual-Navegador");
  await dialog
    .getByRole("combobox", { name: "Conta a receber vinculada", exact: true })
    .selectOption(invoice.id);
  await dialog.getByLabel("Comprovante", { exact: true }).setInputFiles({
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nComprovante manual\n%%EOF"),
  });
  await dialog
    .getByRole("button", { name: "Salvar registro manual", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Operação externa registrada com comprovante.", {
      exact: true,
    }),
  ).toBeVisible();
  const operations = await (
    await api.get(`/finance/external-operations?patientId=${patient.id}`)
  ).json();
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({
    reference: "NF-Manual-Navegador",
    receivableId: invoice.id,
  });
  expect(operations[0]).not.toHaveProperty("contentBase64");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar comprovante", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("proof.pdf");
  const workspace = await (await api.get("/finance/workspace")).json();
  expect(
    workspace.summary.receivables.find(
      (entry: { id: string }) => entry.id === invoice.id,
    ),
  ).toMatchObject({ status: "open", amountInCents: 5500 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("records an NPS response from manual work without treating opening a link as delivery", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente NPS da Equipe"),
    services = await (await api.get("/services")).json(),
    professionals = await (await api.get("/professionals")).json(),
    rooms = await (await api.get("/rooms")).json();
  const response = await api.post("/appointments", {
    data: {
      patientId: patient.id,
      serviceId: services[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      startsAt: "2025-02-10T12:00:00Z",
      visitType: "trial",
      notes: "",
    },
  });
  expect(response.status()).toBe(201);
  const appointment = await response.json();
  expect(
    (
      await api.patch(`/appointments/${appointment.id}/status`, {
        data: { status: "completed" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/communications/reminders/generate", {
        data: {
          referenceDate: "2025-02-10",
          appointments: false,
          payments: false,
          satisfaction: true,
        },
      })
    ).status(),
  ).toBe(200);
  await login(page);
  await page.goto(`/comunicacoes?patientId=${patient.id}`);
  await page
    .getByRole("button", { name: "Registrar resposta de NPS", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar satisfação",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Nota 9", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Salvar avaliação", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Resposta de NPS registrada pela equipe.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Resposta de NPS registrada pela equipe.", { exact: true }),
  ).toBeVisible();
  const center = await (await api.get("/communications")).json(),
    message = center.messages.find(
      (entry: { patientId: string; kind: string }) =>
        entry.patientId === patient.id &&
        entry.kind === "satisfaction_followup",
    );
  expect(message).toMatchObject({
    status: "queued",
    satisfactionSurveyId: expect.any(String),
  });
  expect(message).not.toHaveProperty("manualCompletion");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("purchases a contextual plan with group enrollment and an issued document", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Contratação Integrada"),
    services = await (await api.get("/services")).json(),
    professionals = await (await api.get("/professionals")).json(),
    rooms = await (await api.get("/rooms")).json();
  const groupResponse = await api.post("/groups", {
    data: {
      serviceId: services[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      capacity: 1,
      weeklySlots: [{ weekday: 0, startTime: "06:00", endTime: "07:00" }],
    },
  });
  expect(groupResponse.status()).toBe(201);
  const group = await groupResponse.json();
  const configured = await api.post("/plan-templates", {
    data: {
      name: "Plano Contratação Integrada",
      kind: "fixed_package",
      totalValueInCents: 20000,
      services: [
        {
          serviceId: services[0].id,
          totalSessions: 4,
          totalValueInCents: 20000,
        },
      ],
    },
  });
  expect(configured.status()).toBe(201);
  const template = await configured.json();
  const docResponse = await api.post("/document-templates", {
    data: {
      name: "Contrato da contratação",
      kind: "contract",
      body: "Contrato de {{paciente_nome}}: {{plano_nome}} com {{plano_servicos}}.",
    },
  });
  expect(docResponse.status()).toBe(201);
  const document = await docResponse.json();
  await login(page);
  await page.goto(`/clientes/${patient.id}`);
  await expect(
    page.getByRole("heading", { name: patient.fullName, exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Planos", exact: true }).click();
  await page.locator(`a[href="/planos?patientId=${patient.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`patientId=${patient.id}`));
  await page.getByRole("button", { name: "Novo plano", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Novo plano", exact: true });
  await dialog
    .getByRole("combobox", { name: "Plano cadastrado", exact: true })
    .selectOption(template.id);
  await dialog.getByLabel("Parcelas", { exact: true }).fill("1");
  await dialog
    .getByLabel("Primeiro vencimento", { exact: true })
    .fill(clinicToday());
  const options = dialog.getByText("Agenda, turma e contrato da contratação", {
    exact: true,
  });
  await options.focus();
  await options.press("Enter");
  await dialog
    .getByRole("combobox", { name: "Turma", exact: true })
    .selectOption(group.id);
  await dialog
    .getByRole("combobox", { name: "Modelo de contrato ou termo", exact: true })
    .selectOption(document.id);
  await dialog
    .getByRole("button", { name: "Criar plano e parcelas", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const plans = await (await api.get(`/plans?patientId=${patient.id}`)).json();
  expect(plans).toHaveLength(1);
  const workspace = await (await api.get("/finance/workspace")).json();
  expect(
    workspace.summary.receivables.filter(
      (item: { patientId: string }) => item.patientId === patient.id,
    ),
  ).toHaveLength(1);
  const documents = await (await api.get("/documents")).json();
  expect(
    documents.filter(
      (item: { patientId: string }) => item.patientId === patient.id,
    ),
  ).toEqual([
    expect.objectContaining({
      status: "issued",
      planId: plans[0].id,
      snapshotBody: expect.stringContaining(patient.fullName),
    }),
  ]);
  const groups = await (
    await api.get(
      `/groups/workspace?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`,
    )
  ).json();
  expect(groups.enrollments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        patientId: patient.id,
        groupId: group.id,
        status: "active",
      }),
    ]),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("closes a mixed tab from the customer context and shows its independent session credit", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Comanda Integrada"),
    services = await (await api.get("/services")).json(),
    professionals = await (await api.get("/professionals")).json(),
    rooms = await (await api.get("/rooms")).json();
  const productResponse = await api.post("/inventory/products", {
    data: {
      name: "Produto Comanda Navegador",
      sku: "TAB-E2E",
      unit: "un",
      costInCents: 1000,
      salePriceInCents: 2000,
      initialStock: 5,
      minimumStock: 1,
    },
  });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const tabResponse = await api.post("/patient-tabs", {
    data: { patientId: patient.id },
  });
  expect(tabResponse.status()).toBe(201);
  const tab = await tabResponse.json();
  const appointment = await api.post(`/patient-tabs/${tab.id}/appointments`, {
    data: {
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      serviceId: services[0].id,
      startsAt: "2039-02-10T12:00:00Z",
      visitType: "regular",
      notes: "",
    },
  });
  expect(appointment.status()).toBe(200);
  await login(page);
  await page.goto(`/clientes/${patient.id}`);
  await page.getByRole("tab", { name: "Comandas", exact: true }).click();
  // QM9: na ficha, as comandas ficam abertas em "Comandas do cliente" (o estoque foi para o Financeiro).
  await page
    .getByRole("region", { name: "Comandas do cliente", exact: true })
    .locator(".table-row")
    .filter({ hasText: patient.fullName })
    .getByRole("button", { name: "Abrir comanda", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `Comanda · ${patient.fullName}`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Produto", exact: true })
    .selectOption(product.id);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await dialog
    .locator("form")
    .getByRole("button", { name: "Adicionar produto", exact: true })
    .click();
  await expect(dialog).toContainText("Produto reservado na comanda.");
  await dialog
    .getByRole("button", { name: "Fechar comanda", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar fechamento", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Comanda fechada com cobrança consolidada.",
  );
  await expect(
    dialog.getByRole("button", { name: "Fechar comanda", exact: true }),
  ).toHaveCount(0);
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  const workspace = await (await api.get("/finance/workspace")).json();
  expect(
    workspace.summary.receivables.filter(
      (item: { patientId: string }) => item.patientId === patient.id,
    ),
  ).toEqual([
    expect.objectContaining({ amountInCents: services[0].priceInCents + 4000 }),
  ]);
  const plans = await (await api.get(`/plans?patientId=${patient.id}`)).json();
  expect(plans).toEqual([
    expect.objectContaining({ sourceTabId: tab.id, remainingSessions: 1 }),
  ]);
  const stock = await (await api.get("/inventory/workspace")).json();
  expect(
    stock.products.find((item: { id: string }) => item.id === product.id)
      .currentStock,
  ).toBe(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
