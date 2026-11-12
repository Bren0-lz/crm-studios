import { hashSync } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { addLegacyTabService } from "../../test-support/legacy-tab-service.js";
import { OWNER_ID } from "../../test-support/legacy-fixtures.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

type Payment = {
  id: string;
  origin: string;
  sourceId?: string;
  description: string;
  dueDate: string;
  amountInCents: number;
  discountInCents: number;
  status: string;
  reversed: boolean;
  paidInCents: number;
  paidAt?: string;
  paymentMethod?: string;
  balanceReceivableId?: string;
  balanceOfReceivableId?: string;
  payments: { amountInCents: number; paymentMethod?: string; discountInCents?: number }[];
  reversals: { amountInCents: number; paymentMethod?: string }[];
  services: { id: string; name: string; businessLine: string | null }[];
  productLines: (string | null)[];
};

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  const admin = {
    authorization: `Bearer ${app.jwt.sign({ sub: OWNER_ID, clinicId, role: "admin" })}`,
  };
  const created = await app.inject({
    method: "POST",
    url: "/integration-keys",
    headers: admin,
    payload: { name: "Painel", scopes: ["sales:read", "sales:write"] },
  });
  expect(created.statusCode, created.body).toBe(201);
  const headers = { authorization: `Bearer ${created.json().token as string}` };
  /** Pessoa logada no painel com as permissões dadas (token de usuário). */
  const loginWith = async (email: string, permissions: string[]) => {
    await repository.createAdminUser(
      clinicId,
      OWNER_ID,
      {
        fullName: email,
        email,
        password: "Password123",
        role: "user",
        permissions: permissions as never,
        dashboardAccess: true,
      },
      hashSync("Password123", 4),
    );
    const logged = await app.inject({
      method: "POST",
      url: "/external/v1/auth/login",
      headers,
      payload: { email, password: "Password123" },
    });
    expect(logged.statusCode, logged.body).toBe(200);
    return { ...headers, "x-crm-user-token": logged.json().token as string };
  };
  return { app, repository, headers, loginWith };
}

/** Cliente com cobrança de cada origem e em cada situação. */
async function seedHistory(
  repository: MemoryClinicRepository,
) {
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = (await repository.listRooms(clinicId)).sort(
    (left, right) => right.capacity - left.capacity,
  );
  const service = (name: string, businessLine?: "studio" | "aesthetics") =>
    repository.createService(clinicId, {
      name,
      durationMinutes: 50,
      ...(businessLine ? { businessLine } : {}),
    });
  const studio = await service("Pilates da ficha", "studio");
  const massage = await service("Massagem da ficha");
  const product = (name: string, businessLine?: "aesthetics") =>
    repository.createProduct(clinicId, OWNER_ID, {
      name,
      unit: "un",
      costInCents: 1_000,
      salePriceInCents: 2_500,
      initialStock: 10,
      ...(businessLine ? { businessLine } : {}),
    });
  const cream = await product("Creme da ficha", "aesthetics");
  const band = await product("Faixa da ficha");
  const patient = await repository.createPatient(clinicId, {
    fullName: "Cliente da ficha",
    cpf: nextTestCpf(),
    phone: "11912345678",
    whatsapp: "11987654321",
    email: "ficha@example.com",
    emergencyContactName: "Mãe da cliente",
    emergencyContactPhone: "11911112222",
    emergencyContactWhatsapp: "11911112222",
    birthDate: "1990-05-20",
    address: "Rua das Flores",
    city: "São Paulo",
    tags: ["VIP"],
  });

  // Plano de Studio em três parcelas de 2020: paga, parcial (com saldo) e vencida.
  const template = await repository.createPlanTemplate(clinicId, OWNER_ID, {
    name: "Pilates trimestral",
    totalValueInCents: 30_000,
    services: [
      { serviceId: studio.id, totalSessions: 12, totalValueInCents: 30_000 },
    ],
  } as Parameters<typeof repository.createPlanTemplate>[2]);
  const plan = await repository.createPatientPlan(clinicId, OWNER_ID, {
    planTemplateId: template.id,
    patientId: patient.id,
    name: template.name,
    kind: "fixed_package",
    services: template.services,
    totalValueInCents: 30_000,
    installments: 3,
    firstDueDate: "2020-01-10",
    validFrom: "2020-01-01",
    validUntil: "2099-12-31",
  } as Parameters<typeof repository.createPatientPlan>[2]);
  const group = await repository.createGroupClass(clinicId, {
    serviceId: studio.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 2,
    weeklySlots: [{ weekday: 2, startTime: "07:00", endTime: "08:00" }],
  });
  await repository.createGroupEnrollment(clinicId, {
    groupId: group.id,
    patientId: patient.id,
  } as Parameters<typeof repository.createGroupEnrollment>[1]);
  const installments = (await repository.getFinancialSummary(clinicId)).receivables
    .filter((item) => item.planId === plan.id)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  expect(installments).toHaveLength(3);
  await repository.settleReceivable(clinicId, OWNER_ID, installments[0]!.id, "pix", {
    paidAt: "2020-01-10T15:00:00.000Z",
  });
  await repository.settleReceivable(
    clinicId,
    OWNER_ID,
    installments[1]!.id,
    "cash",
    { paidAt: "2020-02-10T15:00:00.000Z" },
    { receivedInCents: 4_000 },
  );

  // Comanda: massagem (sem classificação) + creme (Estética), a receber em 2099.
  const tab = await repository.openPatientTab(clinicId, OWNER_ID, {
    patientId: patient.id,
  });
  await addLegacyTabService(
    repository,
    undefined,
    clinicId,
    tab.id,
    {
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: massage.id,
      startsAt: "2040-06-20T13:00:00.000Z",
      visitType: "regular",
      notes: "",
    },
    12_000,
  );
  await repository.addPatientTabItem(clinicId, OWNER_ID, tab.id, {
    productId: cream.id,
    quantity: 1,
  });
  await repository.closePatientTab(clinicId, OWNER_ID, tab.id, {
    settlement: "receivable",
    dueDate: "2099-03-10",
  });

  // Venda de produto paga e estornada (volta a ficar em aberto) e venda cancelada.
  const reversedSale = await repository.createProductSale(clinicId, OWNER_ID, {
    patientId: patient.id,
    items: [{ productId: band.id, quantity: 1 }],
    settlement: "receivable",
    dueDate: "2099-04-10",
  });
  await repository.settleReceivable(clinicId, OWNER_ID, reversedSale.receivableId!, "card");
  await repository.reverseReceivablePayment(
    clinicId,
    OWNER_ID,
    reversedSale.receivableId!,
  );
  const cancelledSale = await repository.createProductSale(clinicId, OWNER_ID, {
    patientId: patient.id,
    items: [{ productId: cream.id, quantity: 1 }],
    settlement: "paid",
    paymentMethod: "pix",
    dueDate: "2099-05-10",
    discountInCents: 500,
  } as Parameters<typeof repository.createProductSale>[2]);
  await repository.cancelPatientTab(clinicId, OWNER_ID, cancelledSale.id, {
    refundPayment: true,
    reason: "Desistiu",
  });

  // Lançamento manual vencido.
  const manual = await repository.createManualReceivable(clinicId, OWNER_ID, {
    patientId: patient.id,
    description: "Ajuste avulso",
    amountInCents: 5_000,
    dueDate: "2020-06-01",
  });
  return {
    patient,
    plan,
    group,
    studio,
    massage,
    installments,
    tab,
    reversedSale,
    cancelledSale,
    manual,
  };
}

describe("API externa: ficha do cliente e histórico de pagamentos", () => {
  it("ficha: nome sempre; dados cadastrais, etiquetas, filial, planos e turmas só com patients.view", async () => {
    const { app, repository, headers, loginWith } = await setup();
    const { patient, plan, group } = await seedHistory(repository);
    const [branch] = await repository.listBranches(clinicId);

    const full = await app.inject({
      url: `/external/v1/patients/${patient.id}`,
      headers,
    });
    expect(full.statusCode, full.body).toBe(200);
    const body = full.json();
    expect(body).toMatchObject({
      id: patient.id,
      fullName: "Cliente da ficha",
      record: {
        recordNumber: patient.recordNumber,
        status: "active",
        cpf: patient.cpf,
        birthDate: "1990-05-20",
        phone: "11912345678",
        whatsapp: "11987654321",
        email: "ficha@example.com",
        emergencyContactName: "Mãe da cliente",
        emergencyContactPhone: "11911112222",
        emergencyContactWhatsapp: "11911112222",
        address: "Rua das Flores",
        city: "São Paulo",
        activePlans: [
          { id: plan.id, name: "Pilates trimestral", validFrom: "2020-01-01", validUntil: "2099-12-31" },
        ],
        groups: [{ groupId: group.id, groupName: group.name, status: "active" }],
        createdAt: patient.createdAt,
      },
    });
    // Etiqueta manual e a automática de atraso (o dono da chave vê o Financeiro).
    expect(body.record.tags).toEqual(
      expect.arrayContaining(["VIP", "Pagamento atrasado"]),
    );
    expect(body.record.branches).toEqual(
      group.branchId ? [{ id: branch!.id, name: branch!.name }] : [],
    );
    // Campos vazios do perfil não vêm.
    expect(body.record).not.toHaveProperty("nickname");
    expect(body.record).not.toHaveProperty("notes");

    // Sem patients.view: só id e nome.
    const bare = await app.inject({
      url: `/external/v1/patients/${patient.id}`,
      headers: await loginWith("turmas@example.com", ["groups.view"]),
    });
    expect(bare.statusCode, bare.body).toBe(200);
    expect(bare.json()).toEqual({ id: patient.id, fullName: "Cliente da ficha" });

    // Com patients.view e sem Financeiro: ficha sem a etiqueta automática de atraso.
    const contact = await app.inject({
      url: `/external/v1/patients/${patient.id}`,
      headers: await loginWith("clientes@example.com", ["patients.view"]),
    });
    expect(contact.statusCode, contact.body).toBe(200);
    expect(contact.json().record.tags).toEqual(["VIP"]);

    // Inexistente, id inválido e cliente de outra clínica: 404.
    for (const id of ["8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c", "nao-e-uuid"]) {
      const missing = await app.inject({ url: `/external/v1/patients/${id}`, headers });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("PATIENT_NOT_FOUND");
    }
    const otherClinic = "22222222-2222-4222-8222-222222222222";
    const stranger = await repository.createPatient(otherClinic, {
      fullName: "Cliente de outra clínica",
      cpf: nextTestCpf(),
      phone: "11900001111",
      tags: [],
    });
    for (const url of [
      `/external/v1/patients/${stranger.id}`,
      `/external/v1/patients/${stranger.id}/payments`,
    ]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode, url).toBe(404);
      expect(response.json().code).toBe("PATIENT_NOT_FOUND");
    }
    await app.close();
  });

  it("histórico: cada origem e situação, com baixas, estornos, serviços e linhas; só com finance.view", async () => {
    const { app, repository, headers, loginWith } = await setup();
    const seeded = await seedHistory(repository);
    const { patient, installments, studio, massage } = seeded;
    const response = await app.inject({
      url: `/external/v1/patients/${patient.id}/payments`,
      headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      patientId: string;
      patientName: string;
      referenceDate: string;
      totals: Record<string, number>;
      payments: Payment[];
    };
    expect(body).toMatchObject({
      patientId: patient.id,
      patientName: "Cliente da ficha",
    });
    const rows = body.payments;
    // 3 parcelas + saldo, comanda, duas vendas e o lançamento manual.
    expect(rows).toHaveLength(8);
    const dueDates = rows.map((row) => row.dueDate);
    expect(dueDates).toEqual([...dueDates].sort().reverse());
    const byId = (id: string) => rows.find((row) => row.id === id)!;
    const studioRef = { id: studio.id, name: studio.name, businessLine: "studio" };

    expect(byId(installments[0]!.id)).toMatchObject({
      origin: "plan",
      sourceId: seeded.plan.id,
      status: "paid",
      reversed: false,
      amountInCents: 10_000,
      paidInCents: 10_000,
      paymentMethod: "pix",
      paidAt: "2020-01-10T15:00:00.000Z",
      payments: [{ amountInCents: 10_000, paymentMethod: "pix" }],
      reversals: [],
      services: [studioRef],
      productLines: [],
    });
    const partial = byId(installments[1]!.id);
    expect(partial).toMatchObject({
      origin: "plan",
      status: "partially_paid",
      amountInCents: 4_000,
      paidInCents: 4_000,
      paymentMethod: "cash",
      balanceReceivableId: expect.any(String),
    });
    expect(byId(partial.balanceReceivableId!)).toMatchObject({
      origin: "plan",
      status: "overdue",
      amountInCents: 6_000,
      paidInCents: 0,
      balanceOfReceivableId: partial.id,
      services: [studioRef],
    });
    expect(byId(installments[2]!.id)).toMatchObject({
      status: "overdue",
      payments: [],
    });
    const tabRow = rows.find((row) => row.sourceId === seeded.tab.id)!;
    expect(tabRow).toMatchObject({
      origin: "tab",
      status: "open",
      dueDate: "2099-03-10",
      services: [{ id: massage.id, name: massage.name, businessLine: null }],
      productLines: ["aesthetics"],
    });
    expect(byId(seeded.reversedSale.receivableId!)).toMatchObject({
      origin: "sale",
      sourceId: seeded.reversedSale.id,
      status: "open",
      reversed: true,
      paidInCents: 0,
      payments: [{ amountInCents: 2_500, paymentMethod: "card" }],
      reversals: [{ amountInCents: 2_500, paymentMethod: "card" }],
      services: [],
      productLines: [null],
    });
    expect(byId(seeded.reversedSale.receivableId!)).not.toHaveProperty("paidAt");
    expect(byId(seeded.cancelledSale.receivableId!)).toMatchObject({
      origin: "sale",
      status: "cancelled",
      reversed: true,
      discountInCents: 500,
      productLines: ["aesthetics"],
    });
    expect(byId(seeded.manual.id)).toMatchObject({
      origin: "manual",
      description: "Ajuste avulso",
      status: "overdue",
      services: [],
      productLines: [],
    });
    expect(byId(seeded.manual.id)).not.toHaveProperty("sourceId");
    expect(body.totals).toEqual({
      count: 8,
      amountInCents: rows.reduce((total, row) => total + row.amountInCents, 0),
      paidInCents: 14_000,
      openInCents: rows
        .filter((row) => row.status === "open" || row.status === "overdue")
        .reduce((total, row) => total + row.amountInCents, 0),
      overdueInCents: 6_000 + installments[2]!.amountInCents + 5_000,
    });

    // Sem finance.view: 403 do Financeiro, mesmo com Clientes.
    const denied = await app.inject({
      url: `/external/v1/patients/${patient.id}/payments`,
      headers: await loginWith("clientes@example.com", ["patients.view", "groups.view"]),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("FINANCE_ACCESS_DENIED");
    // Com finance.view (sem Clientes): o histórico inteiro.
    const finance = await app.inject({
      url: `/external/v1/patients/${patient.id}/payments`,
      headers: await loginWith("financeiro@example.com", ["finance.view"]),
    });
    expect(finance.statusCode, finance.body).toBe(200);
    expect(finance.json().payments).toHaveLength(8);
    const missing = await app.inject({
      url: "/external/v1/patients/8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c/payments",
      headers,
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("histórico: filtros por situação, origem, serviço, linha e período", async () => {
    const { app, repository, headers } = await setup();
    const seeded = await seedHistory(repository);
    const { patient, installments, studio, massage } = seeded;
    const list = async (query: string) => {
      const response = await app.inject({
        url: `/external/v1/patients/${patient.id}/payments?${query}`,
        headers,
      });
      expect(response.statusCode, `${query}: ${response.body}`).toBe(200);
      return response.json() as { totals: { count: number }; payments: Payment[] };
    };
    const ids = async (query: string) =>
      (await list(query)).payments.map((row) => row.id).sort();
    const sorted = (...values: string[]) => [...values].sort();
    const tabId = (await list("origin=tab")).payments[0]!.id;
    const balanceId = (await list("status=partially_paid")).payments[0]!
      .balanceReceivableId!;

    expect(await ids("status=overdue")).toEqual(
      sorted(balanceId, installments[2]!.id, seeded.manual.id),
    );
    expect(await ids("status=paid")).toEqual([installments[0]!.id]);
    expect(await ids("status=partially_paid,reversed")).toEqual(
      sorted(
        installments[1]!.id,
        seeded.reversedSale.receivableId!,
        seeded.cancelledSale.receivableId!,
      ),
    );
    // Parâmetro repetido vale como lista.
    expect(await ids("status=cancelled&status=paid")).toEqual(
      sorted(installments[0]!.id, seeded.cancelledSale.receivableId!),
    );
    expect(await ids("origin=sale")).toEqual(
      sorted(seeded.reversedSale.receivableId!, seeded.cancelledSale.receivableId!),
    );
    expect(await ids("origin=manual")).toEqual([seeded.manual.id]);
    expect((await ids("origin=plan"))).toHaveLength(4);
    expect(await ids(`serviceId=${massage.id}`)).toEqual([tabId]);
    expect(await ids(`serviceId=${studio.id},${massage.id}`)).toHaveLength(5);
    expect(await ids("businessLine=aesthetics")).toEqual(
      sorted(tabId, seeded.cancelledSale.receivableId!),
    );
    // "Outros": serviço ou produto sem classificação; o lançamento manual não tem linha.
    expect(await ids("businessLine=other")).toEqual(
      sorted(tabId, seeded.reversedSale.receivableId!),
    );
    expect(await ids("businessLine=studio&status=overdue")).toEqual(
      sorted(balanceId, installments[2]!.id),
    );
    // Período pelo vencimento (padrão) e pela data das baixas.
    expect(await ids("from=2020-01-01&to=2020-01-31")).toEqual([installments[0]!.id]);
    expect(await ids("dateField=paid&from=2020-02-01&to=2020-02-28")).toEqual([
      installments[1]!.id,
    ]);
    expect(await ids("from=2099-01-01")).toHaveLength(3);
    expect((await list("origin=manual")).totals.count).toBe(1);

    for (const query of [
      "status=late",
      "origin=pacote",
      "businessLine=null",
      "serviceId=abc",
      "from=2020-02-01&to=2020-01-01",
    ]) {
      const response = await app.inject({
        url: `/external/v1/patients/${patient.id}/payments?${query}`,
        headers,
      });
      expect(response.statusCode, query).toBe(400);
    }
    await app.close();
  });
});
