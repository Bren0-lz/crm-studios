import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("payables without cost center", () => {
  it("creates and lists an expense with only the category", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const created = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Material de limpeza",
        categoryId: category.id,
        dueDate: saoPauloToday(),
        amountInCents: 4_590,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      categoryName: category.name,
      amountInCents: 4_590,
    });
    expect(created.json()).not.toHaveProperty("costCenterId");
    expect(created.json()).not.toHaveProperty("costCenterName");
    const listed = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(
      listed
        .json()
        .payables.find((item: { id: string }) => item.id === created.json().id),
    ).toMatchObject({ description: "Material de limpeza" });
  });

  it("still rejects an unknown cost center", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const created = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Material de limpeza",
        categoryId: category.id,
        costCenterId: "99999999-9999-4999-8999-999999999999",
        dueDate: saoPauloToday(),
        amountInCents: 4_590,
      },
    });
    expect(created.statusCode).toBe(404);
    expect(created.json().code).toBe("FINANCIAL_CLASSIFICATION_NOT_FOUND");
  });
});
