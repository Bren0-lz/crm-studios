import type { FinancialReport } from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

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
        payload: {
          patientId: patients[0].id,
          professionalId: professionals[0].id,
          roomId: rooms[0].id,
          serviceId: services[0].id,
          startsAt: "2031-03-10T13:00:00.000Z",
        },
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
      at("2031-03-12T15:00:00.000Z");
      await app.inject({
        method: "POST",
        url: `/finance/commissions/${commission.id}/pay`,
        headers: as("owner"),
      });

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
        ["commission", "out", commission.amountInCents, "2031-03-12"],
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
      expect(report.professionals).toEqual([
        expect.objectContaining({
          id: professionals[0].id,
          paidInCents: commission.amountInCents,
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

      const reception = as("reception");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/reports/financial?from=2031-03-01&to=2031-03-31",
            headers: reception,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/admin/pro-labore",
            headers: reception,
            payload: { percentage: 10, base: "profit" },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      vi.useRealTimers();
      await app.close();
    }
  });
});
