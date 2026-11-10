import { compare } from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_REVEAL_FAILED,
  passwordEncryptionKey,
  preparePassword,
  revealPassword,
} from "./password-storage.js";

const key = Buffer.alloc(32, 1).toString("base64");
const otherKey = Buffer.alloc(32, 2).toString("base64");

describe("cópia cifrada da senha", () => {
  it("cifra com nonce novo a cada vez, decifra de volta e mantém o hash bcrypt", async () => {
    const first = await preparePassword("Senha@123", key);
    const second = await preparePassword("Senha@123", key);
    expect(first.passwordEncrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(first.passwordEncrypted).not.toBe(second.passwordEncrypted);
    expect(first.passwordEncrypted.split(":")[1]).not.toBe(
      second.passwordEncrypted.split(":")[1],
    );
    expect(revealPassword(first.passwordEncrypted, key)).toBe("Senha@123");
    expect(revealPassword(second.passwordEncrypted, key)).toBe("Senha@123");
    expect(await compare("Senha@123", first.passwordHash)).toBe(true);
    expect(first.passwordEncrypted).not.toContain("Senha@123");
  });

  it("aceita só 32 bytes em base64 canônico como chave", () => {
    expect(passwordEncryptionKey(key)).toHaveLength(32);
    expect(passwordEncryptionKey("")).toBeNull();
    expect(
      passwordEncryptionKey(Buffer.alloc(16, 1).toString("base64")),
    ).toBeNull();
    // Mesmos bytes, mas sem o preenchimento: não é base64 canônico.
    expect(passwordEncryptionKey(key.replace(/=+$/, ""))).toBeNull();
    expect(passwordEncryptionKey(`${key}\n`)).toBeNull();
  });

  it("sem chave válida, preparar lança antes de gravar e recuperar dá a mensagem genérica", async () => {
    const { passwordEncrypted } = await preparePassword("Senha@123", key);
    for (const invalid of [
      "",
      Buffer.alloc(31, 1).toString("base64"),
      key.replace(/=+$/, ""),
    ]) {
      await expect(preparePassword("Senha@123", invalid)).rejects.toMatchObject(
        {
          code: "PASSWORD_KEY_MISSING",
          message: "Chave de criptografia de senhas ausente ou inválida.",
        },
      );
    }
    expect(() =>
      revealPassword(passwordEncrypted, Buffer.alloc(31).toString("base64")),
    ).toThrow(PASSWORD_REVEAL_FAILED);
    expect(() => revealPassword(passwordEncrypted, otherKey)).toThrow(
      PASSWORD_REVEAL_FAILED,
    );
  });

  it("recusa senha vazia", async () => {
    await expect(preparePassword("", key)).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });
  });

  it("valor adulterado ou fora do formato dá sempre a mesma mensagem genérica", async () => {
    const { passwordEncrypted } = await preparePassword("Senha@123", key);
    const [version, nonce, tag, data] = passwordEncrypted.split(":") as [
      string,
      string,
      string,
      string,
    ];
    const flip = (value: string) => {
      const bytes = Buffer.from(value, "base64");
      bytes[0] = bytes[0]! ^ 1;
      return bytes.toString("base64");
    };
    const tampered = [
      [version, nonce, flip(tag), data],
      [version, flip(nonce), tag, data],
      [version, nonce, tag, flip(data)],
      ["v2", nonce, tag, data],
      [version, nonce, tag],
      [version, Buffer.alloc(8).toString("base64"), tag, data],
      [version, nonce, Buffer.alloc(8).toString("base64"), data],
      [version, `${nonce}!`, tag, data],
    ].map((parts) => parts.join(":"));
    for (const value of [...tampered, "", "texto", "v1:::"]) {
      let message = "";
      try {
        revealPassword(value, key);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(PASSWORD_REVEAL_FAILED);
    }
  });
});
