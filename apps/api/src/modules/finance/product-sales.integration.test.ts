import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Tab = {
  id: string;
  status: string;
  paymentStatus: string;
  totalInCents: number;
  receivableId?: string;
  items: { productId: string; quantity: number; unitPriceInCents: number }[];
};

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const patients = await app.inject({
    method: "GET",
    url: "/patients",
    headers,
  });
  const patientId = patients.json()[0].id as string;
  const createProduct = async (sku: string, initialStock: number) => {
    const response = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name: `Produto ${sku}`,
        sku,
        unit: "un",
        costInCents: 2_000,
        salePriceInCents: 4_500,
        initialStock,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };
  const workspace = async () =>
    (
      await app.inject({ method: "GET", url: "/inventory/workspace", headers })
    ).json<{
      products: { id: string; currentStock: number }[];
      movements: { productId: string; kind: string; quantity: number }[];
      tabs: Tab[];
    }>();
  const receivable = async (id: string) =>
    (await app.inject({ method: "GET", url: "/finance/workspace", headers }))
      .json<{
        summary: {
          receivables: {
            id: string;
            status: string;
            amountInCents: number;
            paymentMethod?: string;
          }[];
        };
      }>()
      .summary.receivables.find((item) => item.id === id);
  return { app, headers, patientId, createProduct, workspace, receivable };
}

describe("product sales", () => {
  it("records a paid sale in one step with stock, receivable and adjusted price", async () => {
    const { app, headers, patientId, createProduct, workspace, receivable } =
      await setup();
    const cream = await createProduct("CRM-1", 5);
    const oil = await createProduct("OIL-1", 3);
    const response = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId,
        notes: "Venda no balcão",
        items: [
          { productId: cream, quantity: 2 },
          { productId: oil, quantity: 1, unitPriceInCents: 3_000 },
        ],
        settlement: "paid",
        paymentMethod: "pix",
        dueDate: saoPauloToday(),
      },
    });
    expect(response.statusCode).toBe(201);
    const sale = response.json<Tab>();
    expect(sale).toMatchObject({
      status: "closed",
      paymentStatus: "paid",
      totalInCents: 12_000,
    });
    expect(
      sale.items.find((item) => item.productId === oil)?.unitPriceInCents,
    ).toBe(3_000);
    expect(await receivable(sale.receivableId!)).toMatchObject({
      status: "paid",
      amountInCents: 12_000,
      paymentMethod: "pix",
    });
    const inventory = await workspace();
    expect(
      inventory.products.find((item) => item.id === cream)?.currentStock,
    ).toBe(3);
    expect(
      inventory.products.find((item) => item.id === oil)?.currentStock,
    ).toBe(2);
    expect(
      inventory.movements.filter(
        (item) => item.kind === "sale" && item.productId === cream,
      ),
    ).toEqual([expect.objectContaining({ quantity: -2 })]);
    await app.close();
  });

  it("leaves the receivable open when the sale is billed for later", async () => {
    const { app, headers, patientId, createProduct, receivable } =
      await setup();
    const cream = await createProduct("CRM-2", 5);
    const response = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId,
        items: [{ productId: cream, quantity: 1 }],
        settlement: "receivable",
        dueDate: "2099-01-10",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<Tab>().paymentStatus).toBe("receivable");
    expect(await receivable(response.json<Tab>().receivableId!)).toMatchObject({
      status: "open",
      amountInCents: 4_500,
    });
    await app.close();
  });

  it("rejects insufficient stock without leaving a tab or touching stock", async () => {
    const { app, headers, patientId, createProduct, workspace } = await setup();
    const cream = await createProduct("CRM-3", 5);
    const oil = await createProduct("OIL-3", 1);
    const before = await workspace();
    const response = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId,
        items: [
          { productId: cream, quantity: 2 },
          { productId: oil, quantity: 2 },
        ],
        settlement: "paid",
        paymentMethod: "cash",
        dueDate: saoPauloToday(),
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("INSUFFICIENT_STOCK");
    const after = await workspace();
    expect(after.tabs).toHaveLength(before.tabs.length);
    expect(after.products.find((item) => item.id === cream)?.currentStock).toBe(
      5,
    );
    expect(after.movements).toHaveLength(before.movements.length);
    await app.close();
  });

  it("requires permission to open, fill and close tabs", async () => {
    const { app, headers, patientId, createProduct } = await setup();
    const cream = await createProduct("CRM-4", 5);
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Recepção sem fechamento",
        email: "sem.fechamento@teste.local",
        role: "user",
        password: "SenhaForte123",
        permissions: [
          "patients.view",
          "patients.inventory_view",
          "patients.tabs_create",
          "patients.tabs_items",
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "sem.fechamento@teste.local",
        password: "SenhaForte123",
      },
    });
    const denied = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers: { authorization: `Bearer ${login.json().token as string}` },
      payload: {
        patientId,
        items: [{ productId: cream, quantity: 1 }],
        settlement: "receivable",
        dueDate: saoPauloToday(),
      },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it("shows the sale payment and refunds it when cancelling, without finance access", async () => {
    const { app, headers, patientId, createProduct, workspace, receivable } =
      await setup();
    const cream = await createProduct("CRM-REF", 5);
    const sold = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId,
        items: [{ productId: cream, quantity: 2 }],
        settlement: "paid",
        paymentMethod: "card",
        paymentInstallments: 3,
        dueDate: saoPauloToday(),
      },
    });
    expect(sold.statusCode).toBe(201);
    const sale = sold.json<Tab>();
    const userAs = async (email: string, permissions: string[]) => {
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: email,
          email,
          role: "user",
          password: "SenhaForte123",
          permissions,
        },
      });
      expect(created.statusCode).toBe(201);
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "SenhaForte123" },
      });
      return { authorization: `Bearer ${login.json().token as string}` };
    };
    const cancelOnly = await userAs("cancela@teste.local", [
      "patients.view",
      "patients.inventory_view",
      "patients.tabs_cancel",
    ]);
    const refunder = await userAs("estorna@teste.local", [
      "patients.view",
      "patients.inventory_view",
      "patients.tabs_cancel",
      "patients.tabs_refund",
    ]);

    const payment = await app.inject({
      method: "GET",
      url: `/patient-tabs/${sale.id}/payment`,
      headers: cancelOnly,
    });
    expect(payment.statusCode).toBe(200);
    expect(payment.json().payment).toMatchObject({
      receivableId: sale.receivableId,
      status: "paid",
      amountInCents: 9_000,
      paymentMethod: "card",
      paymentInstallments: 3,
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/patient-tabs/99999999-9999-4999-8999-999999999999/payment",
          headers,
        })
      ).statusCode,
    ).toBe(404);

    const required = await app.inject({
      method: "POST",
      url: `/patient-tabs/${sale.id}/cancel`,
      headers: cancelOnly,
    });
    expect(required.statusCode).toBe(409);
    expect(required.json().code).toBe("PATIENT_TAB_PAYMENT_REVERSAL_REQUIRED");
    const forbidden = await app.inject({
      method: "POST",
      url: `/patient-tabs/${sale.id}/cancel`,
      headers: cancelOnly,
      payload: { refundPayment: true },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(await receivable(sale.receivableId!)).toMatchObject({
      status: "paid",
    });

    const cancelled = await app.inject({
      method: "POST",
      url: `/patient-tabs/${sale.id}/cancel`,
      headers: refunder,
      payload: { refundPayment: true },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      status: "cancelled",
      paymentStatus: "cancelled",
    });
    expect(await receivable(sale.receivableId!)).toMatchObject({
      status: "cancelled",
    });
    const inventory = await workspace();
    expect(
      inventory.products.find((item) => item.id === cream)?.currentStock,
    ).toBe(5);
    const history = await app.inject({
      method: "GET",
      url: `/patient-tabs/${sale.id}/payment`,
      headers: refunder,
    });
    expect(history.json().payment).toMatchObject({ status: "cancelled" });
    await app.close();
  });
});
