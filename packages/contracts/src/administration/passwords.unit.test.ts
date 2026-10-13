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

  it.each(["Aa1", "Abc1234", "Abc12345", "Abc123456"])(
    "accepts the short password %s on creation, reset and login",
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

  it.each(["", "aa1", "AA1", "Aa", `Aa1${"x".repeat(126)}`])(
    "preserves the other creation and reset restrictions for %s",
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
