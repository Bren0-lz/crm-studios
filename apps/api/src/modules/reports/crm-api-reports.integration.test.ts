import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { config } from "../../config.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
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

  it("returns reproducible management metrics and an authenticated CSV", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({ from: date, to: date });
    expect(report.json().appointments.total).toBeGreaterThan(0);
    expect(report.json().byProfessional.length).toBeGreaterThan(0);
    const csv = await app.inject({
      method: "GET",
      url: `/reports/management.csv?from=${date}&to=${date}`,
      headers,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("atendimentos");
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
    const xlsx = await app.inject({
      method: "GET",
      url: `/reports/sales.xlsx?month=${month}`,
      headers,
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(xlsx.headers["content-disposition"]).toContain(
      `vendas-${month}.xlsx`,
    );
    const salesWorkbook = new ExcelJS.Workbook();
    await salesWorkbook.xlsx.load(xlsx.rawPayload as unknown as ExcelJS.Buffer);
    expect(salesWorkbook.creator).toBe("Studios Aryana");
    const deniedSales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(deniedSales.statusCode).toBe(403);
    await app.close();
  });
});
