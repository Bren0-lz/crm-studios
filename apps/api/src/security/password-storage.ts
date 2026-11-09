import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { config } from "../config.js";
import { DomainError } from "../repository.js";

/**
 * Senha gravada em par: o hash bcrypt (só para o login e a conferência da senha atual) e uma
 * cópia cifrada com AES-256-GCM, que o admin pode consultar. A cópia usa a chave
 * `PASSWORD_ENCRYPTION_KEY` (32 bytes em base64), que existe só no servidor: perder ou trocar a
 * chave inutiliza todas as cópias. Todo caminho que grava senha passa por `preparePassword`.
 */
export interface StoredPassword {
  passwordHash: string;
  passwordEncrypted: string;
}

const VERSION = "v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_MISSING_MESSAGE =
  "Chave de criptografia de senhas ausente ou inválida.";
export const PASSWORD_REVEAL_FAILED = "Não foi possível recuperar a senha.";

/** Base64 canônico: decodificar e codificar de novo devolve o mesmo texto. */
function canonicalBase64(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const buffer = Buffer.from(value, "base64");
  return buffer.toString("base64") === value ? buffer : null;
}

/** A chave configurada, ou `null` se faltar ou não tiver exatamente 32 bytes em base64 canônico. */
export function passwordEncryptionKey(
  value: string | undefined = config.PASSWORD_ENCRYPTION_KEY,
) {
  if (!value) return null;
  const key = canonicalBase64(value);
  return key?.length === 32 ? key : null;
}

/**
 * Hash bcrypt (custo 12) e cópia cifrada da senha. Sem chave válida lança antes de qualquer
 * gravação: criar ou trocar senha falha por inteiro, e o login de quem já existe continua.
 */
export async function preparePassword(
  plain: string,
  keyValue?: string,
): Promise<StoredPassword> {
  if (typeof plain !== "string" || !plain)
    throw new DomainError("INVALID_PASSWORD", "Informe a senha.", 400);
  const key = passwordEncryptionKey(keyValue ?? config.PASSWORD_ENCRYPTION_KEY);
  if (!key)
    throw new DomainError("PASSWORD_KEY_MISSING", KEY_MISSING_MESSAGE, 500);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    passwordHash: await hash(plain, 12),
    passwordEncrypted: [
      VERSION,
      nonce.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":"),
  };
}

/** Erro único de `revealPassword`: nunca carrega o motivo (chave errada, valor adulterado…). */
export class PasswordRevealError extends Error {
  constructor() {
    super(PASSWORD_REVEAL_FAILED);
  }
}

/** Decifra a cópia gravada por `preparePassword`; qualquer falha vira `PasswordRevealError`. */
export function revealPassword(encrypted: string, keyValue?: string): string {
  try {
    const key = passwordEncryptionKey(
      keyValue ?? config.PASSWORD_ENCRYPTION_KEY,
    );
    const parts = typeof encrypted === "string" ? encrypted.split(":") : [];
    if (!key || parts.length !== 4 || parts[0] !== VERSION)
      throw new PasswordRevealError();
    const [nonce, tag, data] = parts.slice(1).map(canonicalBase64);
    if (
      !nonce ||
      !tag ||
      !data ||
      nonce.length !== NONCE_BYTES ||
      tag.length !== TAG_BYTES
    )
      throw new PasswordRevealError();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new PasswordRevealError();
  }
}
