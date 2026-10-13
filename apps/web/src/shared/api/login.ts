import { TOKEN_KEY, USER_KEY, type Session } from "./session";
import { request } from "./transport";

export async function login(email: string, password: string) {
  const session = await request<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  return session;
}
