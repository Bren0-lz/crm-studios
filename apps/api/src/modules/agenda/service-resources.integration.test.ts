import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("service professionals and rooms", () => {
  it("stores who attends a service and keeps it when editing other fields", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const professionalId = professionals.json()[0].id as string;
    const roomId = rooms.json()[0].id as string;
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Pilates aparelho",
        durationMinutes: 50,
        priceInCents: 9_000,
        color: "#547A6B",
        professionalIds: [professionalId],
        roomIds: [roomId],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      professionalIds: [professionalId],
      roomIds: [roomId],
    });
    const listed = await app.inject({
      method: "GET",
      url: "/services",
      headers,
    });
    expect(
      listed
        .json()
        .find((item: { id: string }) => item.id === created.json().id),
    ).toMatchObject({ professionalIds: [professionalId] });
    const plain = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Avaliação",
        durationMinutes: 30,
        priceInCents: 0,
        color: "#547A6B",
      },
    });
    expect(plain.json()).toMatchObject({ professionalIds: [], roomIds: [] });
    await app.close();
  });
});
