import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import {
  saoPauloToday,
  type FinancialReport,
  type PayrollEmployee,
} from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  authenticatedApp,
  configuredPlan,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { salariedEmployeeViaApi } from "../../test-support/payroll-users.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

describe("relatório financeiro", () => {
  it("detalha entradas, saídas, profissionais e pró-labore do período", async () => {
    const { app } = await authenticatedApp();
    await seedRoleUsers(app);
    // O token é assinado a cada requisição porque o relógio avança no teste.
    const as = (role: "owner" | "reception") => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const at = (iso: string) => vi.setSystemTime(new Date(iso));
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2031-03-10T15:00:00.000Z");
    try {
      const [patients, services, professionals, rooms, workspace] = (
        await Promise.all(
          [
            "/patients",
            "/services",
            "/professionals",
            "/rooms",
            "/finance/workspace",
          ].map((url) =>
            app.inject({ method: "GET", url, headers: as("owner") }),
          ),
        )
      ).map((response) => response.json());
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers: as("owner"),
        payload: await configuredPlan(app, {
          services: [
            {
              serviceId: services[0].id,
              totalSessions: 1,
              totalValueInCents: 12_000,
            },
          ],
          patientId: patients[0].id,
          serviceId: services[0].id,
          name: "Plano do relatório",
          kind: "fixed_package",
          totalSessions: 1,
          validFrom: "2031-03-10",
          totalValueInCents: 12_000,
          installments: 1,
          firstDueDate: "2031-03-10",
        }),
      });
      expect(plan.statusCode).toBe(201);
      const receivable = (
        await app.inject({
          method: "GET",
          url: "/finance/workspace",
          headers: as("owner"),
        })
      )
        .json()
        .summary.receivables.find(
          (item: { planId?: string }) => item.planId === plan.json().id,
        );
      await app.inject({
        method: "POST",
        url: `/finance/receivables/${receivable.id}/pay`,
        headers: as("owner"),
        payload: { paymentMethod: "card" },
      });
      const category = workspace.categories.find(
        (item: { kind: string }) => item.kind === "expense",
      );
      at("2031-03-10T16:00:00.000Z");
      const payable = await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers: as("owner"),
        payload: {
          description: "Aluguel da sala",
          supplier: "Imobiliária Centro",
          categoryId: category.id,
          costCenterId: workspace.costCenters[0].id,
          dueDate: "2031-03-10",
          amountInCents: 4_000,
        },
      });
      await app.inject({
        method: "POST",
        url: `/finance/payables/${payable.json().id}/pay`,
        headers: as("owner"),
        payload: { paymentMethod: "pix" },
      });
      const appointment = await app.inject({
        method: "POST",
        url: "/appointments",
        headers: as("owner"),
        payload: await withAppointmentPlan(
          app,
          {
            patientId: patients[0].id,
            professionalId: professionals[0].id,
            roomId: rooms[0].id,
            serviceId: services[0].id,
            startsAt: "2031-03-10T13:00:00.000Z",
          },
          as("owner"),
        ),
      });
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointment.json().id}/status`,
        headers: as("owner"),
        payload: { status: "completed" },
      });
      await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers: as("owner"),
        payload: {
          professionalId: professionals[0].id,
          percentage: 30,
          effectiveFrom: "2031-03-01",
        },
      });
      const [commission] = (
        await app.inject({
          method: "POST",
          url: "/finance/commissions/generate",
          headers: as("owner"),
          payload: { competence: "2031-03" },
        })
      ).json();
      // Comissão é paga pela folha: colaborador ligado ao profissional, sem salário fixo.
      const employeeId = await salariedEmployeeViaApi(app, as("owner"), {
        name: professionals[0].fullName,
        professionalId: professionals[0].id,
        salaryInCents: null,
      });
      const launch = await app.inject({
        method: "POST",
        url: "/finance/payroll/launch",
        headers: as("owner"),
        payload: {
          competence: "2031-03",
          employeeIds: [employeeId],
          dueDate: "2031-03-12",
          categoryId: category.id,
        },
      });
      expect(launch.statusCode).toBe(201);
      at("2031-03-12T15:00:00.000Z");
      const paid = await app.inject({
        method: "POST",
        url: `/finance/payables/${launch.json().payables[0].id}/pay`,
        headers: as("owner"),
        payload: { paymentMethod: "pix" },
      });
      expect(paid.statusCode).toBe(200);
      // Colaborador sem profissional ligado: recebe só o salário fixo pela folha.
      // A folha não cadastra colaborador: ele nasce do usuário com salário.
      const receptionAccount = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: as("owner"),
        payload: {
          fullName: "Carla Recepção",
          email: "carla.recepcao@studios.test",
          role: "user",
          password: "senha-de-teste",
          jobTitle: "Recepcionista",
          salaryInCents: 250_000,
        },
      });
      expect(receptionAccount.statusCode).toBe(201);
      const receptionEmployee = (
        await app.inject({
          method: "GET",
          url: "/finance/payroll/employees",
          headers: as("owner"),
        })
      )
        .json<PayrollEmployee[]>()
        .find((item) => item.userId === receptionAccount.json().id)!;
      const salary = await app.inject({
        method: "POST",
        url: "/finance/payroll/launch",
        headers: as("owner"),
        payload: {
          competence: "2031-03",
          employeeIds: [receptionEmployee.id],
          dueDate: "2031-03-12",
          categoryId: category.id,
        },
      });
      expect(salary.statusCode).toBe(201);
      at("2031-03-13T15:00:00.000Z");
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/payables/${salary.json().payables[0].id}/pay`,
            headers: as("owner"),
            payload: { paymentMethod: "bank_transfer" },
          })
        ).statusCode,
      ).toBe(200);

      const saved = await app.inject({
        method: "PUT",
        url: "/admin/pro-labore",
        headers: as("owner"),
        payload: { percentage: 25, base: "profit" },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ percentage: 25, base: "profit" });

      const response = await app.inject({
        method: "GET",
        url: "/reports/financial?from=2031-03-01&to=2031-03-31",
        headers: as("owner"),
      });
      expect(response.statusCode).toBe(200);
      const report = response.json<FinancialReport>();
      expect(report.proLabore).toMatchObject({
        percentage: 25,
        base: "profit",
      });
      expect(report.commissionMonths).toEqual(["2031-03"]);
      expect(report.branches.length).toBeGreaterThan(0);
      expect(
        report.entries.map((item) => [
          item.origin,
          item.direction,
          item.amountInCents,
          item.date,
        ]),
      ).toEqual([
        ["plan", "in", 12_000, "2031-03-10"],
        ["expense", "out", 4_000, "2031-03-10"],
        ["payroll", "out", commission.amountInCents, "2031-03-12"],
        ["payroll", "out", 250_000, "2031-03-13"],
      ]);
      expect(report.entries[0]).toMatchObject({
        paymentMethod: "card",
        categoryName: "Venda de planos",
        counterpart: patients[0].fullName,
      });
      expect(report.entries[1]).toMatchObject({
        categoryId: category.id,
        categoryName: category.name,
        costCenterName: workspace.costCenters[0].name,
        counterpart: "Imobiliária Centro",
      });
      expect(report.entries[2]).toMatchObject({
        professionalId: professionals[0].id,
      });
      expect(report.entries.every((item) => item.branchId)).toBe(true);
      expect(report.entries[3]).toMatchObject({
        professionalId: `employee:${receptionEmployee.id}`,
        professionalName: "Carla Recepção",
      });
      expect(report.professionals).toEqual([
        expect.objectContaining({
          id: `employee:${receptionEmployee.id}`,
          name: "Carla Recepção",
          role: "Recepcionista",
          paidInCents: 0,
          salaryPaidInCents: 250_000,
          generatedInCents: 0,
        }),
        expect.objectContaining({
          id: professionals[0].id,
          paidInCents: commission.amountInCents,
          salaryPaidInCents: 0,
          generatedInCents: commission.amountInCents,
          openInCents: 0,
        }),
      ]);

      const april = (
        await app.inject({
          method: "GET",
          url: "/reports/financial?from=2031-04-01&to=2031-04-30",
          headers: as("owner"),
        })
      ).json<FinancialReport>();
      expect(april.entries).toEqual([]);
      expect(april.professionals).toEqual([]);

      // Planilha do extrato gerada pela API com os mesmos filtros da tela.
      const sheet = async (response: { rawPayload: Buffer }) => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(
          response.rawPayload as unknown as ExcelJS.Buffer,
        );
        return workbook.getWorksheet("Extrato")!;
      };
      const xlsx = await app.inject({
        method: "GET",
        url: "/reports/financial/export?periodFrom=2031-03-01&periodTo=2031-03-31&direction=out&search=imobiliaria",
        headers: as("owner"),
      });
      expect(xlsx.statusCode).toBe(200);
      expect(xlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
      expect(xlsx.headers["content-disposition"]).toContain(
        "extrato-financeiro-2031-03-01-2031-03-31.xlsx",
      );
      const filtered = await sheet(xlsx);
      expect(filtered.rowCount).toBe(2);
      expect((filtered.getRow(1).values as unknown[]).slice(1, 4)).toEqual([
        "Data",
        "Tipo",
        "Descrição",
      ]);
      expect((filtered.getRow(2).values as unknown[]).slice(1, 5)).toEqual([
        new Date("2031-03-10T00:00:00Z"),
        "Saída",
        "Aluguel da sala",
        "Imobiliária Centro",
      ]);
      expect(filtered.getCell("J2").value).toBe(-40);
      const branchId = report.entries[0]!.branchId!;
      const all = await app.inject({
        method: "GET",
        url: `/reports/financial/export?periodFrom=2031-03-01&periodTo=2031-03-31&branchId=${branchId}`,
        headers: as("owner"),
      });
      expect((await sheet(all)).rowCount).toBe(
        1 + report.entries.filter((item) => item.branchId === branchId).length,
      );
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/reports/financial/export?periodFrom=2031-03-01&periodTo=2031-03-31&origin=salario",
            headers: as("owner"),
          })
        ).statusCode,
      ).toBe(400);
      // Período acima de 12 meses é recusado (no relatório e na planilha).
      for (const url of [
        "/reports/financial?from=2030-01-01&to=2031-03-31",
        "/reports/financial/export?periodFrom=2030-01-01&periodTo=2031-03-31",
      ])
        expect(
          (await app.inject({ method: "GET", url, headers: as("owner") }))
            .statusCode,
        ).toBe(400);

      expect(
        (
          await app.inject({
            method: "GET",
            url: "/reports/financial?from=2031-03-31&to=2031-03-01",
            headers: as("owner"),
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/admin/pro-labore",
            headers: as("owner"),
            payload: { percentage: 120, base: "profit" },
          })
        ).statusCode,
      ).toBe(400);

      const receptionUser = as("reception");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/reports/financial?from=2031-03-01&to=2031-03-31",
            headers: receptionUser,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/admin/pro-labore",
            headers: receptionUser,
            payload: { percentage: 10, base: "profit" },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      vi.useRealTimers();
      await app.close();
    }
  });

  it("quebra a venda em uma linha por produto, sem a origem de comanda", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const patientId = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json()[0].id as string;
      const product = async (sku: string) =>
        (
          await app.inject({
            method: "POST",
            url: "/inventory/products",
            headers,
            payload: {
              name: `Produto ${sku}`,
              sku,
              unit: "un",
              costInCents: 2_000,
              salePriceInCents: 4_500,
              initialStock: 5,
            },
          })
        ).json().id as string;
      const cream = await product("CRM-1");
      const oil = await product("OIL-1");
      const sale = await app.inject({
        method: "POST",
        url: "/product-sales",
        headers,
        payload: {
          patientId,
          items: [
            { productId: cream, quantity: 2 },
            { productId: oil, quantity: 1, unitPriceInCents: 3_000 },
          ],
          settlement: "paid",
          paymentMethod: "pix",
          dueDate: saoPauloToday(),
        },
      });
      expect(sale.statusCode).toBe(201);
      const today = saoPauloToday();
      const report = (
        await app.inject({
          method: "GET",
          url: `/reports/financial?from=${today}&to=${today}`,
          headers,
        })
      ).json<FinancialReport>();
      const lines = report.entries.filter(
        (entry) =>
          entry.origin === "product_sale" || entry.origin === "service_sale",
      );
      expect(
        lines.map(({ origin, description, amountInCents, paymentMethod }) => ({
          origin,
          description,
          amountInCents,
          paymentMethod,
        })),
      ).toEqual([
        {
          origin: "product_sale",
          description: "Produto CRM-1 × 2",
          amountInCents: 9_000,
          paymentMethod: "pix",
        },
        {
          origin: "product_sale",
          description: "Produto OIL-1 × 1",
          amountInCents: 3_000,
          paymentMethod: "pix",
        },
      ]);
      expect(new Set(lines.map((entry) => entry.id)).size).toBe(2);
      expect(
        report.entries.map((entry) => entry.origin as string),
      ).not.toContain("tab");
    } finally {
      await app.close();
    }
  });
});
