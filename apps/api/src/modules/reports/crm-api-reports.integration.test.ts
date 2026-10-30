import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { config } from "../../config.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { dateAt } from "../../storage/memory/helpers.js";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("reports health", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      storage: config.STORAGE_MODE,
    });
    await app.close();
  });

  it("returns reproducible management metrics and an authenticated spreadsheet", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    // Dia da clínica em que o seed criou os atendimentos de "hoje" (`dateAt` usa o fuso do
    // servidor): com `new Date()` o teste falhava entre 21h e 24h em São Paulo.
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateAt(12)));
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({ from: date, to: date });
    expect(report.json().appointments.total).toBeGreaterThan(0);
    expect(report.json().byProfessional.length).toBeGreaterThan(0);
    const xlsx = await app.inject({
      method: "GET",
      url: `/reports/management.xlsx?from=${date}&to=${date}`,
      headers,
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(xlsx.headers["content-disposition"]).toContain(
      `relatorio-${date}-${date}.xlsx`,
    );
    const managementWorkbook = new ExcelJS.Workbook();
    await managementWorkbook.xlsx.load(
      xlsx.rawPayload as unknown as ExcelJS.Buffer,
    );
    expect(
      managementWorkbook.getWorksheet("Resumo")!.getColumn(2).values,
    ).toContain("Atendimentos");
    await seedRoleUsers(app);
    const receptionToken = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const denied = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(denied.statusCode).toBe(403);
    const month = date.slice(0, 7);
    const sales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(sales.statusCode).toBe(200);
    expect(sales.json()).toMatchObject({
      month,
      current: { from: `${month}-01` },
    });
    const salesXlsx = await app.inject({
      method: "GET",
      url: `/reports/sales.xlsx?month=${month}`,
      headers,
    });
    expect(salesXlsx.statusCode).toBe(200);
    expect(salesXlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(salesXlsx.headers["content-disposition"]).toContain(
      `vendas-${month}.xlsx`,
    );
    const salesWorkbook = new ExcelJS.Workbook();
    await salesWorkbook.xlsx.load(
      salesXlsx.rawPayload as unknown as ExcelJS.Buffer,
    );
    expect(salesWorkbook.creator).toBe("Studios Aryana");
    const deniedSales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(deniedSales.statusCode).toBe(403);
    for (const suffix of ["", ".xlsx"]) {
      const route =
        "/reports/sales/period" + suffix + "?from=" + date + "&to=" + date;
      const response = await app.inject({ url: route, headers });
      expect(response.statusCode).toBe(200);
      const deniedPeriod = await app.inject({
        url: route,
        headers: { authorization: "Bearer " + receptionToken },
      });
      expect(deniedPeriod.statusCode).toBe(403);
      const unauthenticated = await app.inject({ url: route });
      expect(unauthenticated.statusCode).toBe(401);
      if (!suffix)
        expect(response.json()).toMatchObject({
          from: date,
          to: date,
          summary: { from: date, to: date },
        });
      else {
        const periodWorkbook = new ExcelJS.Workbook();
        await periodWorkbook.xlsx.load(
          response.rawPayload as unknown as ExcelJS.Buffer,
        );
        expect(periodWorkbook.getWorksheet("Resumo")!.columnCount).toBe(2);
        expect(response.headers["content-disposition"]).toContain(
          "vendas-" + date + "-" + date + ".xlsx",
        );
      }
    }
    for (const query of [
      "from=2026-01-01",
      "from=2026-02-01&to=2026-01-01",
      "from=2026-02-30&to=2026-03-01",
    ]) {
      expect(
        (await app.inject({ url: "/reports/sales/period?" + query, headers }))
          .statusCode,
      ).toBe(400);
    }
    await app.close();
  });
});
