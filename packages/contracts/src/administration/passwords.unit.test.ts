import { describe, expect, it } from "vitest";
import {
  adminUserInputSchema,
  loginSchema,
  passwordResetSchema,
} from "./model.js";

describe("password validation", () => {
  const user = {
    fullName: "Ana Lima",
    email: "ana@teste.local",
    role: "user",
  };

  it.each(["Aa1", "aa1", "AA1", "Aa", "1234", "senha"])(
    "accepts the password %s on creation, reset and login, without composition rules",
    (password) => {
      expect(adminUserInputSchema.parse({ ...user, password }).password).toBe(
        password,
      );
      expect(passwordResetSchema.parse({ password }).password).toBe(password);
      expect(loginSchema.parse({ email: user.email, password }).password).toBe(
        password,
      );
    },
  );

  it.each(["", `Aa1${"x".repeat(126)}`])(
    "rejects the empty or too long password %s on creation and reset",
    (password) => {
      expect(
        adminUserInputSchema.safeParse({ ...user, password }).success,
      ).toBe(false);
      expect(passwordResetSchema.safeParse({ password }).success).toBe(false);
    },
  );

  it("requires a nonempty password at login without applying creation rules", () => {
    expect(
      loginSchema.safeParse({ email: user.email, password: "" }).success,
    ).toBe(false);
    expect(
      loginSchema.parse({ email: user.email, password: "a" }).password,
    ).toBe("a");
  });
});
