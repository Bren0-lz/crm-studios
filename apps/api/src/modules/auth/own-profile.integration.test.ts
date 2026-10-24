import { expect, it } from "vitest";
import {
  authenticatedApp,
  OWNER_ID,
} from "../../test-support/legacy-fixtures.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PROFESSIONAL_ID = "33333333-3333-4333-8333-333333333333";

it("lets the user edit the own name, photo and agenda name", async () => {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  try {
    const initial = await app.inject({ url: "/me/profile", headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      id: OWNER_ID,
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      avatarDataUrl: "",
      professional: null,
    });

    const linked = await app.inject({
      method: "PUT",
      url: `/admin/users/${OWNER_ID}/professional`,
      headers,
      payload: { professionalId: PROFESSIONAL_ID },
    });
    expect(linked.statusCode).toBe(200);

    const saved = await app.inject({
      method: "PUT",
      url: "/me/profile",
      headers,
      payload: {
        fullName: "Aryana Dutra Lima",
        avatarDataUrl: PNG,
        agendaName: "Aryana",
        agendaColor: "#123456",
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      fullName: "Aryana Dutra Lima",
      avatarDataUrl: PNG,
      professional: {
        id: PROFESSIONAL_ID,
        fullName: "Aryana",
        color: "#123456",
      },
    });

    const me = await app.inject({ url: "/me", headers });
    expect(me.json()).toMatchObject({
      fullName: "Aryana Dutra Lima",
      avatarDataUrl: PNG,
    });
    const professionals = await app.inject({ url: "/professionals", headers });
    expect(
      (professionals.json() as Array<{ id: string; fullName: string }>).find(
        (item) => item.id === PROFESSIONAL_ID,
      )?.fullName,
    ).toBe("Aryana");

    const removed = await app.inject({
      method: "PUT",
      url: "/me/profile",
      headers,
      payload: { fullName: "Aryana Dutra Lima", avatarDataUrl: "" },
    });
    expect(removed.json()).toMatchObject({
      avatarDataUrl: "",
      professional: { fullName: "Aryana" },
    });
    expect(
      (await app.inject({ url: "/me", headers })).json(),
    ).not.toHaveProperty("avatarDataUrl");
  } finally {
    await app.close();
  }
});

it("rejects a photo whose content does not match the image type", async () => {
  const { app, token } = await authenticatedApp();
  try {
    const response = await app.inject({
      method: "PUT",
      url: "/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: "Aryana Dutra",
        avatarDataUrl: "data:image/png;base64,aGVsbG8=",
      },
    });
    expect(response.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

it("changes the own password only with the current one and renews the session", async () => {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const change = (currentPassword: string, newPassword: string) =>
    app.inject({
      method: "POST",
      url: "/me/password",
      headers,
      payload: { currentPassword, newPassword },
    });
  try {
    const wrong = await change("Errada1", "Nova@123");
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe("INVALID_CURRENT_PASSWORD");

    const same = await change("Admin@123", "Admin@123");
    expect(same.json().code).toBe("SAME_PASSWORD");

    const empty = await change("Admin@123", "");
    expect(empty.statusCode).toBe(400);
    expect(empty.json().message).toBe("Nova senha: Informe a senha.");

    const changed = await change("Admin@123", "Nova@123");
    expect(changed.statusCode).toBe(200);
    const renewed = changed.json().token as string;
    expect(changed.json().user).toMatchObject({ id: OWNER_ID });

    // A sessão antiga cai; a nova continua valendo.
    expect((await app.inject({ url: "/me", headers })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/me",
          headers: { authorization: `Bearer ${renewed}` },
        })
      ).statusCode,
    ).toBe(200);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@movimenta.local", password: "Nova@123" },
    });
    expect(login.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
