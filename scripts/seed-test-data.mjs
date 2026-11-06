#!/usr/bin/env node
/**
 * Dados falsos para testar o CRM de ponta a ponta (roteiro dos PRs #132–#192).
 *
 * Grava tudo pela API, logado como administrador: os dados passam pelas mesmas regras das
 * telas e funcionam com qualquer banco (memória ou MySQL). Uso:
 *
 *   CRM_URL=https://seu-dominio/api CRM_EMAIL=admin@... CRM_PASSWORD=... node scripts/seed-test-data.mjs
 *
 * Sem variáveis, usa a API local (http://localhost:3333) e o admin do seed demo.
 * Roda uma vez por banco: se encontrar o fornecedor "Malharia Bom Fio", para sem gravar nada.
 * Nunca rode em produção com clientes reais: os dados são fictícios e não há botão de desfazer.
 */
const baseUrl = (process.env.CRM_URL ?? "http://localhost:3333").replace(
  /\/$/,
  "",
);
const adminEmail = process.env.CRM_EMAIL ?? "admin@movimenta.local";
const adminPassword = process.env.CRM_PASSWORD ?? "Admin@123";
const testPassword = "Teste@123";
const MARKER_SUPPLIER = "Malharia Bom Fio";
const NOTE = "[dados de teste]";

// ---------------------------------------------------------------- HTTP

let token = "";
let currentStep = "";

async function api(method, path, body, options = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const auth = options.token ?? token;
  if (auth && !options.anonymous) headers.authorization = `Bearer ${auth}`;
  if (options.branchId) headers["x-branch-id"] = options.branchId;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // resposta sem JSON (planilha, PDF…)
  }
  if (!response.ok) {
    if (options.allowError) return { error: data, status: response.status };
    const message =
      typeof data === "object" && data
        ? `${data.code ?? ""} ${data.message ?? JSON.stringify(data)}`
        : String(data).slice(0, 300);
    throw new Error(
      `[${currentStep}] ${method} ${path} → ${response.status}: ${message}`,
    );
  }
  return data;
}
const get = (path, options) => api("GET", path, undefined, options);
const post = (path, body = {}, options) => api("POST", path, body, options);
const put = (path, body = {}, options) => api("PUT", path, body, options);
const patch = (path, body = {}, options) => api("PATCH", path, body, options);

function step(name) {
  currentStep = name;
  process.stdout.write(`• ${name}\n`);
}

// ---------------------------------------------------------------- datas (fuso da clínica, -03:00)

const OFFSET = "-03:00";
const DAY = 86_400_000;
function clinicToday() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}
const today = clinicToday();
function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}
function addMonths(date, months) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
const month = (date) => date.slice(0, 7);
const at = (date, time) => `${date}T${time}:00${OFFSET}`;
/** Horário de agora + `minutes`, arredondado para 5 min, no fuso da clínica. */
function nowPlus(minutes) {
  const date = new Date(Date.now() + minutes * 60_000 - 3 * 3_600_000);
  date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 5) * 5, 0, 0);
  return `${date.toISOString().slice(0, 16)}:00${OFFSET}`;
}
/** Data de nascimento com aniversário daqui a `days` dias. */
function birthdayIn(days, age) {
  const date = addDays(today, days);
  return `${Number(date.slice(0, 4)) - age}${date.slice(4)}`;
}

// ---------------------------------------------------------------- dados fictícios

/** CPF válido a partir de 9 dígitos. */
function cpf(seed) {
  const digits = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  for (const size of [9, 10]) {
    const sum = digits.reduce(
      (total, value, index) => total + value * (size + 1 - index),
      0,
    );
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}
const phone = (index) => `119${String(87_650_000 + index).padStart(8, "0")}`;

/** PNG 1×1 (comprovantes e assinatura desenhada). */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const pngProof = (fileName) => ({
  fileName,
  mimeType: "image/png",
  sizeInBytes: Buffer.from(PNG_BASE64, "base64").length,
  contentBase64: PNG_BASE64,
});
/** PDF mínimo (comprovante em PDF). */
const PDF_BASE64 = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
).toString("base64");
const pdfProof = (fileName) => ({
  fileName,
  mimeType: "application/pdf",
  sizeInBytes: Buffer.from(PDF_BASE64, "base64").length,
  contentBase64: PDF_BASE64,
});

const summary = [];
const note = (line) => summary.push(line);

// ---------------------------------------------------------------- execução

async function main() {
  process.stdout.write(`API: ${baseUrl}\nHoje (clínica): ${today}\n\n`);

  step("Login do administrador");
  const login = await post("/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  token = login.token;

  step("Conferindo se o roteiro já foi aplicado");
  const existingSuppliers = await get("/finance/suppliers");
  if (existingSuppliers.some((item) => item.name === MARKER_SUPPLIER)) {
    process.stdout.write(
      `\nO fornecedor "${MARKER_SUPPLIER}" já existe: os dados de teste já foram gravados neste banco. Nada foi alterado.\n`,
    );
    return;
  }

  const ctx = {};
  await seedStructure(ctx);
  await seedCatalogAndStock(ctx);
  await seedSuppliers(ctx);
  await seedPlansAndPatients(ctx);
  await seedAgenda(ctx);
  await seedReceivablePayments(ctx);
  await seedSales(ctx);
  await seedPayables(ctx);
  await seedPayroll(ctx);
  await seedDocuments(ctx);
  await seedCampaigns(ctx);
  await seedExtras(ctx);

  process.stdout.write("\nPronto. Resumo:\n");
  for (const line of summary) process.stdout.write(`  - ${line}\n`);
}

// ---------------------------------------------------------------- 1. estrutura

async function seedStructure(ctx) {
  step("Filiais");
  const branches = await get("/branches");
  ctx.mainBranch = branches.find((item) => item.isDefault) ?? branches[0];
  ctx.centerBranch =
    branches.find((item) => item.name === "Filial Centro") ??
    (await post("/admin/branches", {
      name: "Filial Centro",
      phones: [],
      postalCode: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    }));
  note(`Filiais: ${ctx.mainBranch.name} e Filial Centro.`);

  step("Formas de pagamento (Pix só à vista, cartão até 12x)");
  await put("/admin/payment-methods", {
    methods: [
      { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
      { method: "card", acceptsInstallments: true, maxInstallments: 12 },
      { method: "cash", acceptsInstallments: false, maxInstallments: 1 },
      {
        method: "bank_transfer",
        acceptsInstallments: false,
        maxInstallments: 1,
      },
      { method: "boleto", acceptsInstallments: true, maxInstallments: 6 },
      { method: "other", acceptsInstallments: false, maxInstallments: 1 },
    ],
  });

  step("Categorias e centros de custo do financeiro");
  const workspace = await get("/finance/workspace");
  const category = async (name, kind = "expense") =>
    workspace.categories.find(
      (item) => item.name === name && item.kind === kind,
    ) ?? (await post("/finance/categories", { name, kind }));
  const costCenter = async (name) =>
    workspace.costCenters.find((item) => item.name === name) ??
    (await post("/finance/cost-centers", { name }));
  ctx.categories = {
    rent: await category("Aluguel"),
    utilities: await category("Água, luz e internet"),
    payroll: await category("Folha de pagamento"),
    suppliers: await category("Compras de fornecedores"),
    marketing: await category("Marketing"),
  };
  ctx.costCenters = {
    admin: await costCenter("Administrativo"),
    studio: await costCenter("Estúdio"),
  };

  step("Salas e serviços de teste");
  ctx.rooms = {
    group: await post("/rooms", { name: "Sala Pilates Grupo", capacity: 3 }),
    physio: await post("/rooms", { name: "Consultório 2", capacity: 1 }),
    center: await post(
      "/rooms",
      { name: "Sala Centro", capacity: 4 },
      { branchId: ctx.centerBranch.id },
    ),
  };

  step("Usuários (profissionais com salário/comissão, recepção, painel)");
  const allModules = [
    "agenda",
    "groups",
    "patients",
    "plans",
    "communications",
    "contracts",
    "clinical",
    "finance",
    "reports",
  ];
  const effectiveFrom = addDays(today, -90);
  ctx.users = {};
  ctx.users.juliana = await post("/admin/users", {
    fullName: "Juliana Prado",
    email: "juliana.prado@teste.local",
    role: "user",
    password: testPassword,
    jobTitle: "Instrutora de Pilates",
    whatsapp: phone(901),
    modules: ["agenda", "groups", "patients", "clinical"],
    editModules: ["agenda", "groups", "clinical"],
    commission: { kind: "percentage", percentage: 30, effectiveFrom },
    professional: {
      mode: "create",
      data: {
        fullName: "Juliana Prado",
        crefito: "CREFITO-3 445566-F",
        specialty: "Pilates",
      },
    },
    branchAccess: { allBranches: true, branchIds: [] },
    salaryInCents: 280_000,
  });
  ctx.users.rafael = await post("/admin/users", {
    fullName: "Rafael Costa",
    email: "rafael.costa@teste.local",
    role: "user",
    password: testPassword,
    jobTitle: "Fisioterapeuta",
    whatsapp: phone(902),
    modules: ["agenda", "patients", "clinical"],
    editModules: ["agenda", "clinical"],
    commission: { kind: "percentage", percentage: 40, effectiveFrom },
    professional: {
      mode: "create",
      data: {
        fullName: "Rafael Costa",
        crefito: "CREFITO-3 556677-F",
        specialty: "Fisioterapia ortopédica",
      },
    },
    branchAccess: { allBranches: true, branchIds: [] },
    salaryInCents: 150_000,
  });
  ctx.users.renata = await post(
    "/admin/users",
    {
      fullName: "Renata Souza",
      email: "renata.souza@teste.local",
      role: "user",
      password: testPassword,
      jobTitle: "Esteticista",
      modules: ["agenda", "patients"],
      editModules: ["agenda"],
      commission: {
        kind: "fixed",
        fixedAmountInCents: 2_500,
        percentage: 0,
        effectiveFrom,
      },
      professional: {
        mode: "create",
        data: {
          fullName: "Renata Souza",
          crefito: "Esteticista 0001",
          specialty: "Estética",
        },
      },
      branchAccess: { allBranches: false, branchIds: [ctx.centerBranch.id] },
      salaryInCents: 190_000,
    },
    { branchId: ctx.centerBranch.id },
  );
  ctx.users.marcos = await post("/admin/users", {
    fullName: "Marcos Teixeira",
    email: "marcos.recepcao@teste.local",
    role: "user",
    password: testPassword,
    jobTitle: "Recepcionista",
    whatsapp: phone(904),
    modules: allModules,
    editModules: ["agenda", "patients", "plans", "finance"],
    branchAccess: { allBranches: false, branchIds: [ctx.mainBranch.id] },
    salaryInCents: 220_000,
    dashboardAccess: true,
  });
  ctx.users.paula = await post("/admin/users", {
    fullName: "Paula Gerente",
    email: "paula.gerente@teste.local",
    role: "admin",
    password: testPassword,
    jobTitle: "Gerente",
  });
  const professionals = await get("/professionals");
  const professionalOf = (name) =>
    professionals.find((item) => item.fullName === name);
  ctx.pros = {
    juliana: professionalOf("Juliana Prado"),
    rafael: professionalOf("Rafael Costa"),
    renata: professionalOf("Renata Souza"),
  };
  note(
    `Usuários (senha ${testPassword}): juliana.prado@, rafael.costa@, renata.souza@ (só Filial Centro), marcos.recepcao@ (com acesso ao painel de vendas), paula.gerente@ (admin) — todos @teste.local.`,
  );

  ctx.services = {
    groupPilates: await post("/services", {
      name: "Pilates em grupo",
      durationMinutes: 60,
      professionalIds: [ctx.pros.juliana.id],
      roomIds: [ctx.rooms.group.id],
    }),
    physio: await post("/services", {
      name: "Fisioterapia ortopédica",
      durationMinutes: 50,
      professionalIds: [ctx.pros.rafael.id],
      roomIds: [ctx.rooms.physio.id],
    }),
    massage: await post("/services", {
      name: "Drenagem linfática",
      durationMinutes: 60,
      professionalIds: [ctx.pros.renata.id],
      roomIds: [ctx.rooms.center.id],
    }),
  };

  step("Regras de comissão por serviço (início no passado)");
  await post("/finance/commission-rules", {
    professionalId: ctx.pros.juliana.id,
    serviceId: ctx.services.groupPilates.id,
    kind: "fixed",
    fixedAmountInCents: 1_500,
    percentage: 0,
    effectiveFrom,
  });

  step("Turmas (uma com 3 vagas para testar lista de espera)");
  ctx.groups = {
    morning: await post("/groups", {
      name: "Pilates Grupo Manhã",
      serviceId: ctx.services.groupPilates.id,
      professionalId: ctx.pros.juliana.id,
      roomId: ctx.rooms.group.id,
      capacity: 3,
      weeklySlots: [
        { weekday: 1, startTime: "08:00", endTime: "09:00" },
        { weekday: 3, startTime: "08:00", endTime: "09:00" },
      ],
    }),
    evening: await post("/groups", {
      name: "Pilates Grupo Noite",
      serviceId: ctx.services.groupPilates.id,
      professionalId: ctx.pros.juliana.id,
      roomId: ctx.rooms.group.id,
      capacity: 3,
      weeklySlots: [
        { weekday: 2, startTime: "19:00", endTime: "20:00" },
        { weekday: 4, startTime: "19:00", endTime: "20:00" },
      ],
    }),
  };
  note(
    "Turmas Pilates Grupo Manhã (seg/qua 8h) e Noite (ter/qui 19h), 3 vagas cada.",
  );
}

// ---------------------------------------------------------------- 2. produtos e estoque

async function seedCatalogAndStock(ctx) {
  step("Categorias de produto com tamanhos e marcas");
  const catalog = (kind, body) => post(`/clinic-catalogs/${kind}`, body);
  ctx.productCategories = {
    clothes: await catalog("product_category", {
      name: "Roupas fitness",
      sizes: ["PP", "P", "M", "G", "GG"],
    }),
    shoes: await catalog("product_category", {
      name: "Sapatilhas",
      sizes: ["34", "35", "36", "37", "38", "39"],
    }),
    bottles: await catalog("product_category", {
      name: "Garrafas",
      sizes: ["500 ml", "750 ml"],
    }),
    accessories: await catalog("product_category", {
      name: "Acessórios",
    }),
  };
  ctx.brands = {
    own: await catalog("product_brand", { name: "Aryana Wear" }),
    fit: await catalog("product_brand", { name: "FitPro" }),
  };

  step("Produtos (tamanhos, aviso de reposição, sem preço)");
  const product = (body) =>
    post("/inventory/products", { unit: "un", initialStock: 0, ...body });
  ctx.products = {
    legging: await product({
      name: "Legging Compressão",
      categoryId: ctx.productCategories.clothes.id,
      brandId: ctx.brands.own.id,
      costInCents: 4_500,
      salePriceInCents: 11_990,
      sizes: ["P", "M", "G"],
      initialSizeStock: [
        { size: "P", quantity: 0 },
        { size: "M", quantity: 10 },
        { size: "G", quantity: 3 },
      ],
      restockAlertAt: 3,
    }),
    shirt: await product({
      name: "Camiseta Dry Fit",
      categoryId: ctx.productCategories.clothes.id,
      brandId: ctx.brands.own.id,
      costInCents: 2_500,
      salePriceInCents: 6_990,
      sizes: ["PP", "P", "M", "G", "GG"],
      initialSizeStock: [
        { size: "PP", quantity: 4 },
        { size: "P", quantity: 8 },
        { size: "M", quantity: 12 },
        { size: "G", quantity: 8 },
        { size: "GG", quantity: 4 },
      ],
    }),
    shoes: await product({
      name: "Sapatilha Antiderrapante",
      categoryId: ctx.productCategories.shoes.id,
      brandId: ctx.brands.fit.id,
      costInCents: 3_000,
      salePriceInCents: 8_990,
      sizes: ["35", "36", "37", "38"],
      initialSizeStock: [
        { size: "35", quantity: 2 },
        { size: "36", quantity: 5 },
        { size: "37", quantity: 5 },
        { size: "38", quantity: 1 },
      ],
      restockAlertAt: 2,
    }),
    bottle: await product({
      name: "Garrafa Térmica",
      categoryId: ctx.productCategories.bottles.id,
      brandId: ctx.brands.fit.id,
      costInCents: 2_000,
      salePriceInCents: 5_990,
      sizes: ["500 ml", "750 ml"],
      initialSizeStock: [
        { size: "500 ml", quantity: 6 },
        { size: "750 ml", quantity: 6 },
      ],
    }),
    socks: await product({
      name: "Meia Antiderrapante",
      categoryId: ctx.productCategories.accessories.id,
      brandId: ctx.brands.fit.id,
      costInCents: 900,
      salePriceInCents: 2_990,
      initialStock: 4,
      restockAlertAt: 5,
    }),
    mat: await product({
      name: "Tapete de Yoga",
      categoryId: ctx.productCategories.accessories.id,
      costInCents: 6_000,
      salePriceInCents: null,
      initialStock: 5,
    }),
    band: await product({
      name: "Faixa Elástica",
      categoryId: ctx.productCategories.accessories.id,
      costInCents: 1_200,
      salePriceInCents: 3_490,
      initialStock: 0,
    }),
  };
  ctx.products.centerOil = await post(
    "/inventory/products",
    {
      name: "Óleo de Massagem",
      categoryId: ctx.productCategories.accessories.id,
      unit: "un",
      costInCents: 1_800,
      salePriceInCents: 4_990,
      initialStock: 6,
    },
    { branchId: ctx.centerBranch.id },
  );
  note(
    "Produtos: Legging (P esgotado, G no limite de reposição), Camiseta (PP–GG), Sapatilha (35–38), Garrafa (500/750 ml), Meia (repor), Tapete de Yoga (sem preço), Faixa Elástica (sem estoque); na Filial Centro, Óleo de Massagem.",
  );
}

// ---------------------------------------------------------------- 3. fornecedores e pedidos

async function seedSuppliers(ctx) {
  step("Fornecedores");
  ctx.suppliers = {
    textile: await post("/finance/suppliers", {
      name: MARKER_SUPPLIER,
      kind: "company",
      document: "11222333000181",
      phone: "1133334444",
      whatsapp: phone(950),
      email: "contato@bomfio.teste",
      hiredOn: addDays(today, -120),
      contractAmountInCents: 150_000,
      billingCycle: "monthly",
      paymentMethod: "boleto",
      installments: 1,
      paymentTerms: "Boleto 28 dias após a entrega.",
      notes: NOTE,
    }),
    distributor: await post("/finance/suppliers", {
      name: "Distribuidora FitPro",
      kind: "company",
      document: "44555666000172",
      phone: "1144445555",
      whatsapp: "",
      email: "vendas@fitpro.teste",
      hiredOn: addDays(today, -60),
      contractAmountInCents: 80_000,
      billingCycle: "one_time",
      paymentMethod: "pix",
      notes: NOTE,
    }),
    cleaner: await post("/finance/suppliers", {
      name: "Ana Limpeza (MEI)",
      kind: "person",
      document: cpf(987654321),
      phone: phone(951),
      whatsapp: phone(951),
      contractAmountInCents: 60_000,
      billingCycle: "monthly",
      paymentMethod: "pix",
      notes: NOTE,
    }),
  };

  step("Pedidos ao fornecedor (com tamanhos e produto novo sem preço)");
  await post(`/finance/suppliers/${ctx.suppliers.textile.id}/orders`, {
    orderedOn: addDays(today, -20),
    number: "BF-1021",
    totalInCents: 99_000,
    notes: NOTE,
    items: [
      {
        productId: ctx.products.legging.id,
        size: "M",
        quantity: 6,
        unitCostInCents: 4_500,
      },
      {
        productId: ctx.products.shirt.id,
        size: "G",
        quantity: 10,
        unitCostInCents: 2_500,
      },
      {
        productName: "Top Fitness Nadador",
        quantity: 8,
        unitCostInCents: 3_500,
      },
    ],
  });
  await post(`/finance/suppliers/${ctx.suppliers.distributor.id}/orders`, {
    orderedOn: addDays(today, -5),
    number: "",
    totalInCents: 36_000,
    items: [
      {
        productId: ctx.products.bottle.id,
        size: "750 ml",
        quantity: 6,
        unitCostInCents: 2_000,
      },
      {
        productId: ctx.products.socks.id,
        quantity: 20,
        unitCostInCents: 900,
      },
    ],
  });
  note(
    `Fornecedores: ${MARKER_SUPPLIER} (pedido BF-1021 com o produto novo Top Fitness Nadador, sem preço), Distribuidora FitPro (sem WhatsApp, usa o telefone) e Ana Limpeza (MEI).`,
  );
}

// ---------------------------------------------------------------- 4. planos e clientes

let patientSequence = 0;
function patientData(fullName, extra = {}) {
  patientSequence += 1;
  const slug = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, ".");
  return {
    fullName,
    cpf: cpf(310_000_000 + patientSequence * 7_919),
    phone: phone(patientSequence),
    whatsapp: phone(patientSequence),
    email: `${slug}@teste.local`,
    birthDate: "1990-05-10",
    notes: NOTE,
    tags: [],
    ...extra,
  };
}

/** Termos do plano a partir do modelo (`months` = validade). */
function planTerms(template, options) {
  const validFrom = options.validFrom ?? today;
  const months = options.months ?? 1;
  return {
    planTemplateId: template.id,
    kind: options.kind ?? template.kind,
    name: template.name,
    services: template.services.map((item) => ({
      serviceId: item.serviceId,
      totalSessions: item.totalSessions,
      totalValueInCents: item.totalValueInCents,
    })),
    validFrom,
    validUntil: addDays(addMonths(validFrom, months), -1),
    totalValueInCents: template.totalValueInCents,
    installments: options.installments ?? 1,
    firstDueDate: options.firstDueDate ?? addDays(validFrom, 5),
    paymentMethod: options.paymentMethod ?? "pix",
    ...(options.discount ? { discount: options.discount } : {}),
  };
}

async function seedPlansAndPatients(ctx) {
  step("Modelos de plano");
  const template = (body) => post("/plan-templates", body);
  ctx.templates = {
    group: await template({
      name: "Pilates em grupo 2x por semana",
      totalValueInCents: 32_000,
      services: [
        {
          serviceId: ctx.services.groupPilates.id,
          totalSessions: 8,
          totalValueInCents: 32_000,
          sessionsPerWeek: 2,
        },
      ],
      planType: "monthly",
      kind: "recurring",
    }),
    physio: await template({
      name: "Fisioterapia · pacote 10 sessões",
      totalValueInCents: 140_000,
      services: [
        {
          serviceId: ctx.services.physio.id,
          totalSessions: 10,
          totalValueInCents: 140_000,
        },
      ],
      kind: "fixed_package",
      maxInstallments: 6,
    }),
    massage: await template({
      name: "Drenagem linfática avulsa",
      totalValueInCents: 14_000,
      services: [
        {
          serviceId: ctx.services.massage.id,
          totalSessions: 1,
          totalValueInCents: 14_000,
        },
      ],
      planType: "single",
      kind: "single",
    }),
  };
  await post("/plan-catalog", {
    name: "Pilates em grupo · mensal",
    totalValueInCents: 32_000,
  });

  step("Clientes com plano de turma (Manhã lotada + lista de espera)");
  const guided = (patient, plan, extra = {}) =>
    post(
      "/patients/guided",
      { next: "plan", patient, plan, ...extra },
      extra.branchId ? { branchId: extra.branchId } : undefined,
    );
  ctx.patients = {};
  ctx.plans = {};
  const fernanda = await guided(
    patientData("Fernanda Alves", { birthDate: birthdayIn(7, 34) }),
    planTerms(ctx.templates.group, {
      paymentMethod: "card",
      discount: { type: "percentage", percent: 10, scope: "permanent" },
    }),
    {
      groupId: ctx.groups.morning.id,
      additionalPlans: [
        {
          plan: planTerms(ctx.templates.physio, {
            kind: "fixed_package",
            months: 3,
            installments: 3,
            paymentMethod: "card",
          }),
        },
      ],
    },
  );
  ctx.patients.fernanda = fernanda.patient;
  ctx.plans.fernandaGroup = fernanda.plan;
  for (const [key, name, method, birthDate] of [
    ["gabriel", "Gabriel Moreira", "pix", "1987-02-14"],
    ["helena", "Helena Duarte", "card", birthdayIn(3, 41)],
    ["igor", "Igor Ribeiro", "pix", "1995-08-22"],
  ]) {
    const result = await guided(
      patientData(name, { birthDate }),
      planTerms(ctx.templates.group, { paymentMethod: method }),
      { groupId: ctx.groups.morning.id },
    );
    ctx.patients[key] = result.patient;
    ctx.plans[key] = result.plan;
  }
  note(
    "Turma Manhã: Fernanda, Gabriel e Helena matriculados; Igor ficou na lista de espera (turma cheia).",
  );

  step("Cliente com matrícula antiga e plano cancelado (#162)");
  const larissa = await guided(
    patientData("Larissa Campos", { birthDate: "1992-11-30" }),
    planTerms(ctx.templates.group, {
      validFrom: addDays(today, -40),
      firstDueDate: addDays(today, -35),
    }),
    { groupId: ctx.groups.evening.id },
  );
  ctx.patients.larissa = larissa.patient;
  await patch(`/plans/${larissa.plan.id}/status`, { status: "cancelled" });
  note(
    "Larissa Campos: plano cancelado, mas a matrícula na turma Noite continua — contrate um plano novo na mesma turma.",
  );

  step("Clientes de fisioterapia (parcelas vencidas e saldo baixo)");
  const bruno = await guided(
    patientData("Bruno Carvalho", { birthDate: "1979-03-08" }),
    planTerms(ctx.templates.physio, {
      kind: "fixed_package",
      validFrom: addDays(today, -60),
      months: 3,
      installments: 3,
      firstDueDate: addDays(today, -55),
      paymentMethod: "card",
    }),
  );
  ctx.patients.bruno = bruno.patient;
  ctx.plans.bruno = bruno.plan;
  const patricia = await guided(
    patientData("Patrícia Gomes", { birthDate: "1984-07-19" }),
    planTerms(ctx.templates.physio, {
      kind: "fixed_package",
      validFrom: addDays(today, -50),
      months: 3,
      installments: 2,
      firstDueDate: addDays(today, -45),
      paymentMethod: "boleto",
    }),
  );
  ctx.patients.patricia = patricia.patient;
  ctx.plans.patricia = patricia.plan;

  step("Cliente da Filial Centro com serviço avulso");
  const camila = await post(
    "/patients/guided",
    {
      next: "single",
      patient: patientData("Camila Rocha", { birthDate: "1998-01-25" }),
      plan: planTerms(ctx.templates.massage, { kind: "single" }),
    },
    { branchId: ctx.centerBranch.id },
  );
  ctx.patients.camila = camila.patient;
  ctx.plans.camila = camila.plan;

  step("Clientes sem plano (aniversário hoje, compradores)");
  for (const [key, name, extra] of [
    ["daniela", "Daniela Freitas", { birthDate: birthdayIn(0, 29) }],
    ["vinicius", "Vinícius Nunes", { birthDate: "1991-09-12" }],
    ["sofia", "Sofia Martins", { birthDate: "2001-04-03" }],
    [
      "otavio",
      "Otávio Mendes",
      { birthDate: "1975-12-01", phone: "21987654321", whatsapp: "" },
    ],
  ]) {
    ctx.patients[key] = (
      await post("/patients/guided", {
        next: "none",
        patient: patientData(name, extra),
      })
    ).patient;
  }
  note(
    "Aniversários: Daniela hoje, Helena em 3 dias, Fernanda em 7 dias (campanha de aniversário).",
  );
}

// ---------------------------------------------------------------- 5. agenda

async function seedAgenda(ctx) {
  const appointment = (patient, startsAt, extra = {}) =>
    post(
      "/appointments",
      {
        patientId: patient.id,
        professionalId: extra.professional?.id ?? ctx.pros.rafael.id,
        roomId: extra.room?.id ?? ctx.rooms.physio.id,
        serviceId: extra.service?.id ?? ctx.services.physio.id,
        startsAt,
        notes: NOTE,
      },
      extra.branchId ? { branchId: extra.branchId } : undefined,
    );
  const setStatus = (item, status) =>
    patch(`/appointments/${item.id}/status`, { status });

  step("Atendimentos realizados no passado (comissões e saldo baixo)");
  ctx.appointments = { completed: [] };
  for (let index = 0; index < 8; index += 1) {
    const date = addDays(today, -48 + index * 5);
    const done = await appointment(ctx.patients.patricia, at(date, "09:00"));
    await setStatus(done, "completed");
    ctx.appointments.completed.push(done);
  }
  for (let index = 0; index < 4; index += 1) {
    const date = addDays(today, -50 + index * 7);
    const done = await appointment(ctx.patients.bruno, at(date, "14:00"));
    await setStatus(done, "completed");
    ctx.appointments.completed.push(done);
  }
  const missed = await appointment(
    ctx.patients.bruno,
    at(addDays(today, -15), "14:00"),
  );
  await setStatus(missed, "no_show");

  step("Atendimento de drenagem na Filial Centro (para a comanda)");
  ctx.appointments.camila = await appointment(
    ctx.patients.camila,
    at(addDays(today, -1), "10:00"),
    {
      professional: ctx.pros.renata,
      room: ctx.rooms.center,
      service: ctx.services.massage,
      branchId: ctx.centerBranch.id,
    },
  );

  step("Agenda de hoje (agendado, confirmado) e atendimentos a finalizar");
  const soon = await appointment(ctx.patients.bruno, nowPlus(10));
  await setStatus(soon, "confirmed");
  await appointment(ctx.patients.patricia, nowPlus(120));
  await appointment(ctx.patients.fernanda, nowPlus(180));
  await appointment(ctx.patients.bruno, at(addDays(today, -1), "16:00"));
  await appointment(ctx.patients.patricia, at(addDays(today, -2), "16:00"));
  await appointment(ctx.patients.bruno, at(addDays(today, 7), "14:00"));
  note(
    "Agenda de hoje: Bruno confirmado daqui a ~10 min (certinho finaliza), Patrícia e Fernanda agendadas (certinho confirma). Ontem e anteontem ficaram 2 atendimentos a finalizar.",
  );
}

// ---------------------------------------------------------------- 6. cobranças recebidas

async function receivablesOf(plan) {
  const summary = await get("/finance/summary");
  return summary.receivables
    .filter((item) => item.planId === plan.id)
    .sort((left, right) => left.installmentNumber - right.installmentNumber);
}

async function seedReceivablePayments(ctx) {
  step("Baixas com cartão parcelado e comprovantes");
  const [fernandaFirst] = await receivablesOf(ctx.plans.fernandaGroup);
  await post(`/finance/receivables/${fernandaFirst.id}/pay`, {
    paymentMethod: "card",
    paymentInstallments: 3,
  });
  await post(
    `/finance/receivables/${fernandaFirst.id}/proofs`,
    pngProof("comprovante-cartao-fernanda.png"),
  );
  await post(
    `/finance/receivables/${fernandaFirst.id}/proofs`,
    pdfProof("recibo-maquininha.pdf"),
  );

  const [brunoFirst] = await receivablesOf(ctx.plans.bruno);
  await post(`/finance/receivables/${brunoFirst.id}/pay`, {
    paymentMethod: "card",
    paymentInstallments: 2,
    discountInCents: 2_000,
    paidAt: `${addDays(today, -54)}T15:00:00${OFFSET}`,
  });
  await post(
    `/finance/receivables/${brunoFirst.id}/proofs`,
    pngProof("comprovante-bruno.png"),
  );

  step("Baixa estornada (comprovante fica em 'Da baixa estornada')");
  const [gabrielFirst] = await receivablesOf(ctx.plans.gabriel);
  await post(`/finance/receivables/${gabrielFirst.id}/pay`, {
    paymentMethod: "pix",
  });
  await post(
    `/finance/receivables/${gabrielFirst.id}/proofs`,
    pngProof("pix-gabriel.png"),
  );
  await post(`/finance/receivables/${gabrielFirst.id}/reverse`, {});

  step("Pagamento parcial (saldo com novo vencimento)");
  const [patriciaFirst] = await receivablesOf(ctx.plans.patricia);
  await post(`/finance/receivables/${patriciaFirst.id}/pay`, {
    paymentMethod: "boleto",
    receivedInCents: 40_000,
    balanceDueDate: addDays(today, 3),
    paidAt: `${addDays(today, -44)}T10:00:00${OFFSET}`,
  });
  note(
    "Contas a receber: Fernanda paga no cartão 3x (2 comprovantes), Bruno pago com desconto e 2ª parcela vencida, Gabriel com baixa estornada, Patrícia com pagamento parcial.",
  );
}

// ---------------------------------------------------------------- 7. vendas

async function seedSales(ctx) {
  step("Vendas de produtos (tamanhos, desconto, parcial, cartão)");
  const sale = (patient, items, extra) =>
    post("/product-sales", {
      patientId: patient.id,
      notes: NOTE,
      items,
      dueDate: today,
      ...extra,
    });
  await sale(
    ctx.patients.vinicius,
    [
      { productId: ctx.products.legging.id, size: "M", quantity: 1 },
      {
        productId: ctx.products.shirt.id,
        size: "G",
        quantity: 2,
        unitPriceInCents: 5_990,
      },
      { productId: ctx.products.bottle.id, size: "750 ml", quantity: 1 },
    ],
    { settlement: "paid", paymentMethod: "pix" },
  );
  await sale(
    ctx.patients.vinicius,
    [{ productId: ctx.products.shirt.id, size: "M", quantity: 1 }],
    { settlement: "paid", paymentMethod: "card", paymentInstallments: 2 },
  );
  const sofia = await sale(
    ctx.patients.sofia,
    [
      { productId: ctx.products.shoes.id, size: "36", quantity: 1 },
      { productId: ctx.products.socks.id, quantity: 2 },
    ],
    { settlement: "receivable", dueDate: addDays(today, 10) },
  );
  const sofiaReceivable = (await get("/finance/summary")).receivables.find(
    (item) =>
      item.patientId === ctx.patients.sofia.id && item.status === "open",
  );
  if (sofiaReceivable)
    await post(`/finance/receivables/${sofiaReceivable.id}/pay`, {
      paymentMethod: "pix",
      receivedInCents: 5_000,
    });
  else note(`Aviso: não achei a cobrança da venda da Sofia (${sofia?.id}).`);
  await sale(
    ctx.patients.fernanda,
    [{ productId: ctx.products.legging.id, size: "G", quantity: 1 }],
    { settlement: "paid", paymentMethod: "cash" },
  );

  step("Comanda com serviço avulso + produto (Filial Centro)");
  const branch = { branchId: ctx.centerBranch.id };
  const tab = await post(
    "/patient-tabs",
    { patientId: ctx.patients.camila.id, notes: NOTE },
    branch,
  );
  await post(
    `/patient-tabs/${tab.id}/services`,
    { appointmentId: ctx.appointments.camila.id },
    branch,
  );
  await post(
    `/patient-tabs/${tab.id}/items`,
    { productId: ctx.products.centerOil.id, quantity: 1 },
    branch,
  );
  await post(
    `/patient-tabs/${tab.id}/close`,
    { settlement: "paid", paymentMethod: "pix", dueDate: today },
    branch,
  );
  note(
    "Vendas: Vinícius (2 vendas, uma com desconto no preço), Sofia (a prazo com pagamento parcial), Fernanda (legging G) e comanda da Camila com drenagem + óleo na Filial Centro.",
  );
}

// ---------------------------------------------------------------- 8. contas a pagar

async function payablesWorkspace() {
  return (await get("/finance/workspace")).payables;
}

async function seedPayables(ctx) {
  step("Despesas fixas (fixa, variável sem valor, variável com estimativa)");
  const recurring = (body) =>
    post("/finance/recurring-payables", {
      costCenterId: ctx.costCenters.admin.id,
      active: true,
      ...body,
    });
  // A luz vence daqui a 2 dias (ou no dia 28): o aviso de 5 dias já aparece no sino.
  const lightDue = addDays(today, 2);
  const lightDay = Math.min(Number(lightDue.slice(8)), 28);
  ctx.recurring = {
    rent: await recurring({
      description: "Aluguel do estúdio",
      supplier: "Imobiliária Central",
      categoryId: ctx.categories.rent.id,
      amountType: "fixed",
      amountInCents: 350_000,
      dayOfMonth: 10,
      reminderDaysBefore: 5,
      startMonth: month(addMonths(today, -2)),
    }),
    light: await recurring({
      description: "Conta de luz",
      supplier: "Enel",
      categoryId: ctx.categories.utilities.id,
      amountType: "variable",
      amountInCents: 0,
      dayOfMonth: lightDay,
      reminderDaysBefore: 5,
      startMonth: month(lightDue),
    }),
    water: await recurring({
      description: "Conta de água",
      supplier: "Sabesp",
      categoryId: ctx.categories.utilities.id,
      amountType: "variable",
      amountInCents: 18_000,
      dayOfMonth: 15,
      reminderDaysBefore: 3,
      startMonth: month(addMonths(today, -2)),
    }),
    internet: await recurring({
      description: "Internet fibra",
      supplier: "Vivo",
      categoryId: ctx.categories.utilities.id,
      costCenterId: ctx.costCenters.studio.id,
      amountType: "fixed",
      amountInCents: 12_990,
      dayOfMonth: 20,
      startMonth: month(addMonths(today, -1)),
      endMonth: month(addMonths(today, 6)),
    }),
  };

  step("Pagando/informando contas das despesas fixas");
  let payables = await payablesWorkspace();
  const thisMonth = month(today);
  const before = (description) =>
    payables.filter(
      (item) =>
        item.description === description &&
        item.status === "open" &&
        item.dueDate.slice(0, 7) < thisMonth,
    );
  // Aluguel: meses anteriores pagos (com comprovante); o do mês fica em aberto.
  for (const rent of before("Aluguel do estúdio")) {
    await post(`/finance/payables/${rent.id}/pay`, {
      paymentMethod: "bank_transfer",
      paidAt: `${rent.dueDate}T10:00:00${OFFSET}`,
    });
    await post(
      `/finance/payables/${rent.id}/proofs`,
      pdfProof(`comprovante-aluguel-${rent.dueDate.slice(0, 7)}.pdf`),
    );
  }
  // Água: o mais antigo informado e pago; o seguinte informado e vencido; o do mês "a informar".
  const [waterOld, waterLast] = before("Conta de água");
  if (waterOld) {
    await put(`/finance/payables/${waterOld.id}/amount`, {
      amountInCents: 17_240,
    });
    await post(`/finance/payables/${waterOld.id}/pay`, {
      paymentMethod: "pix",
      paidAt: `${waterOld.dueDate}T10:00:00${OFFSET}`,
    });
  }
  if (waterLast)
    await put(`/finance/payables/${waterLast.id}/amount`, {
      amountInCents: 19_530,
    });
  // Internet: meses anteriores pagos.
  for (const bill of before("Internet fibra"))
    await post(`/finance/payables/${bill.id}/pay`, {
      paymentMethod: "boleto",
      paidAt: `${bill.dueDate}T10:00:00${OFFSET}`,
    });

  step("Contas avulsas (uma paga com comprovante, uma vencida)");
  const cleaning = await post("/finance/payables", {
    description: "Material de limpeza",
    supplierId: ctx.suppliers.cleaner.id,
    categoryId: ctx.categories.suppliers.id,
    costCenterId: ctx.costCenters.studio.id,
    dueDate: addDays(today, -6),
    amountInCents: 18_750,
    notes: NOTE,
  });
  await post(`/finance/payables/${cleaning.id}/pay`, { paymentMethod: "pix" });
  await post(
    `/finance/payables/${cleaning.id}/proofs`,
    pngProof("pix-limpeza.png"),
  );
  await post("/finance/payables", {
    description: "Anúncio no Instagram",
    categoryId: ctx.categories.marketing.id,
    costCenterId: ctx.costCenters.admin.id,
    dueDate: addDays(today, -3),
    amountInCents: 30_000,
    notes: NOTE,
  });
  payables = await payablesWorkspace();
  note(
    `Despesas fixas: aluguel (fixa, aviso 5 dias), luz (variável sem valor, vence em ${lightDue.split("-").reverse().join("/")}), água (variável com estimativa) e internet (até ${month(addMonths(today, 6))}). ${payables.length} contas a pagar no total.`,
  );
}

// ---------------------------------------------------------------- 9. comissões e folha

async function seedPayroll(ctx) {
  const lastMonth = month(addMonths(today, -1));
  step("Gerando comissões (mês passado e atual)");
  for (const competence of [
    month(addMonths(today, -2)),
    lastMonth,
    month(today),
  ])
    await post("/finance/commissions/generate", { competence });

  step("Lançando a folha do mês passado e pagando um colaborador");
  const launch = await post("/finance/payroll/launch", {
    competence: lastMonth,
    dueDate: `${month(today)}-05`,
    categoryId: ctx.categories.payroll.id,
    costCenterId: ctx.costCenters.admin.id,
  });
  const payables = await payablesWorkspace();
  const julianaPayroll = payables.find(
    (item) =>
      item.description.includes("Juliana") &&
      item.description.startsWith("Folha"),
  );
  if (julianaPayroll)
    await post(`/finance/payables/${julianaPayroll.id}/pay`, {
      paymentMethod: "pix",
    });
  note(
    `Folha: ${lastMonth} lançada (${Array.isArray(launch?.payables) ? launch.payables.length : "várias"} despesas), Juliana já paga; ${month(today)} ainda a lançar.`,
  );
}

// ---------------------------------------------------------------- 10. contratos

async function seedDocuments(ctx) {
  step("Modelos de contrato (cliente, fornecedor e um para excluir)");
  const clientTemplate = await post("/document-templates", {
    name: "Contrato de prestação de serviços",
    kind: "contract",
    body: "Contrato entre a clínica e {{paciente_nome}}, CPF {{paciente_cpf}}, referente ao plano {{plano_nome}}. As aulas seguem as regras do estúdio e as faltas sem aviso não são repostas.",
  });
  const supplierTemplate = await post("/document-templates", {
    name: "Contrato de fornecimento",
    kind: "contract",
    body: "Contrato de fornecimento com {{fornecedor_nome}} ({{fornecedor_documento}}). Valor: {{fornecedor_valor}}. Pagamento: {{fornecedor_pagamento}}. Contratação: {{fornecedor_contratacao}}.",
  });
  await post("/document-templates", {
    name: "Termo de uso de imagem (pode excluir)",
    kind: "consent",
    body: "Autorizo o uso da minha imagem em fotos e vídeos do estúdio para divulgação nas redes sociais.",
  });

  step("Documentos emitidos (um assinado, um aguardando, um de fornecedor)");
  const issue = async (body) => {
    const document = await post("/documents", body);
    await patch(`/documents/${document.id}/status`, { status: "issued" });
    return document;
  };
  const signed = await issue({
    templateId: clientTemplate.id,
    patientId: ctx.patients.fernanda.id,
    planId: ctx.plans.fernandaGroup.id,
    title: "Contrato de prestação de serviços",
  });
  const link = await post(`/documents/${signed.id}/signature-link`);
  const signToken = link.token;
  const signResult = await api(
    "POST",
    `/public/document-signatures/${signToken}`,
    {
      signerName: ctx.patients.fernanda.fullName,
      signerCpf: ctx.patients.fernanda.cpf,
      accepted: true,
      signatureImage: `data:image/png;base64,${PNG_BASE64}`,
    },
    { anonymous: true, allowError: true },
  );
  if (signResult?.error)
    note(
      `Aviso: assinatura automática do contrato da Fernanda falhou (${signResult.status}). Assine pelo link na tela Contratos.`,
    );
  const pending = await issue({
    templateId: clientTemplate.id,
    patientId: ctx.patients.gabriel.id,
    planId: ctx.plans.gabriel.id,
    title: "Contrato de prestação de serviços",
  });
  await post(`/documents/${pending.id}/signature-link`);
  const supplierDocument = await issue({
    templateId: supplierTemplate.id,
    supplierId: ctx.suppliers.textile.id,
    title: "Contrato de fornecimento",
  });
  await post(`/documents/${supplierDocument.id}/signature-link`);
  note(
    "Contratos: Fernanda assinado, Gabriel aguardando assinatura, Malharia Bom Fio (fornecedor) aguardando; modelo 'Termo de uso de imagem' para testar a exclusão.",
  );
}

// ---------------------------------------------------------------- 11. campanhas

async function seedCampaigns(ctx) {
  step("Campanhas automáticas (aniversário promocional, saldo baixo, atraso)");
  const birthday = await post("/communications/auto-campaigns", {
    name: "Aniversário com 15% de desconto",
    trigger: "birthday",
    active: true,
    steps: [
      {
        offset: 7,
        message:
          "Oi {{nome}}! Seu aniversário está chegando e preparamos um presente: 15% de desconto na próxima sessão.",
      },
      {
        offset: 0,
        message:
          "Feliz aniversário, {{nome}}! Hoje você completa {{idade}} anos. Seu desconto de 15% está garantido.",
      },
    ],
    promotion: { validDays: 10, cooldown: { amount: 6, unit: "months" } },
  });
  await post("/communications/auto-campaigns", {
    name: "Saldo de sessões acabando",
    trigger: "low_balance",
    active: true,
    steps: [
      {
        offset: 2,
        message:
          "Oi {{nome}}, restam {{sessoes}} sessões no plano {{plano}}. Quer renovar?",
      },
      {
        offset: 0,
        message: "Oi {{nome}}, as sessões do plano {{plano}} acabaram.",
      },
    ],
  });
  await post("/communications/auto-campaigns", {
    name: "Pagamento em atraso",
    trigger: "overdue_payment",
    active: true,
    steps: [
      {
        offset: 1,
        message:
          "Oi {{nome}}, a parcela de {{data}} está em aberto ({{parcelas}}). Precisa de ajuda?",
      },
      {
        offset: 7,
        message: "Oi {{nome}}, ainda consta a parcela de {{data}} em aberto.",
      },
    ],
  });

  step("Marcando mensagens da fila de hoje");
  const queue = await get("/communications/auto-campaigns/queue");
  const items = Array.isArray(queue) ? queue : (queue?.items ?? []);
  let sent = 0;
  let skipped = 0;
  const ours = new Set(Object.values(ctx.patients).map((item) => item.id));
  for (const item of items) {
    if (item.blockedReason || item.status !== "pending") continue;
    if (!ours.has(item.patientId)) continue;
    const body = {
      campaignId: item.campaignId,
      stepId: item.stepId,
      patientId: item.patientId,
      occurrenceKey: item.occurrenceKey,
    };
    // Aniversário da Fernanda (7 dias antes) enviado: ela ganha a promoção ao agendar.
    if (
      item.campaignId === birthday.id &&
      item.patientId === ctx.patients.fernanda.id
    ) {
      await post("/communications/auto-campaigns/deliveries", {
        ...body,
        status: "sent",
      });
      sent += 1;
    } else if (skipped === 0) {
      await post("/communications/auto-campaigns/deliveries", {
        ...body,
        status: "skipped",
        skipReason: "contacted_other_way",
      });
      skipped += 1;
    }
  }
  note(
    `Fila de campanhas automáticas: ${items.length} mensagens hoje; ${sent} enviada (aniversário da Fernanda, com promoção), ${skipped} não enviada e o resto pendente.`,
  );

  step("Campanha manual com destinatários");
  const template = await post("/communications/templates", {
    title: "Aula experimental de Pilates em grupo",
    body: "Oi {{nome}}! Abrimos vagas na turma de Pilates em grupo. Quer agendar uma aula experimental?",
    images: [],
  });
  const campaign = await post("/communications/campaigns", {
    name: "Convite Pilates em grupo",
    templateId: template.id,
    audience: {
      mode: "patients",
      patientIds: [
        ctx.patients.daniela.id,
        ctx.patients.vinicius.id,
        ctx.patients.sofia.id,
        ctx.patients.otavio.id,
      ],
    },
  });
  const detail = await get(`/communications/campaigns/${campaign.id}`);
  const recipients = detail?.recipients ?? [];
  const statuses = ["sent", "skipped"];
  for (const [index, recipient] of recipients.slice(0, 2).entries())
    await post(
      `/communications/campaigns/${campaign.id}/recipients/${recipient.id}`,
      { status: statuses[index] },
    );
  note(
    "Campanha manual 'Convite Pilates em grupo' com 4 clientes: 1 enviada, 1 pulada, o resto pendente.",
  );
}

// ---------------------------------------------------------------- 12. avaliação e integração

async function seedExtras(ctx) {
  step("Avaliação online (prontuário)");
  const templates = await get("/assessment-templates");
  const list = Array.isArray(templates) ? templates : (templates?.items ?? []);
  const template = list.find((item) => item.status === "published") ?? list[0];
  if (template) {
    const values = {};
    for (const field of template.fields ?? []) {
      if (field.type === "text" || field.type === "long_text")
        values[field.key] = "Dor lombar ao sentar por muito tempo.";
      else if (field.type === "select" && field.options?.length)
        values[field.key] = field.options[0];
    }
    const result = await api(
      "POST",
      "/clinical-assessments",
      {
        patientId: ctx.patients.bruno.id,
        templateId: template.id,
        values,
        notes: NOTE,
      },
      { allowError: true },
    );
    note(
      result?.error
        ? `Aviso: não consegui registrar a avaliação de exemplo (${result.error.message ?? result.status}).`
        : `Avaliação "${template.name}" registrada para Bruno Carvalho.`,
    );
  }

  step("Chave de integração (API externa)");
  const key = await post("/integration-keys", {
    name: "Painel de vendas (teste)",
    scopes: ["sales:read", "sales:write"],
  });
  note(
    `Chave de integração criada. Token (aparece só agora): ${key?.token ?? JSON.stringify(key)}`,
  );
}

main().catch((error) => {
  process.stderr.write(`\nFalhou: ${error.message}\n`);
  process.exitCode = 1;
});
