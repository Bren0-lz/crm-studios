import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defaultJwtSecret } from "./infrastructure/published-config.js";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // A Hostinger (app Node.js) informa a porta em PORT; API_PORT tem prioridade.
  API_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(Number(process.env.PORT) || 3333),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default(defaultJwtSecret),
  STORAGE_MODE: z.enum(["memory", "mysql"]).default("memory"),
  DATABASE_URL: z.string().url().default("mysql://crm:crm@localhost:3306/crm"),
  DATABASE_SSL: z.enum(["disable", "require", "verify"]).default("disable"),
  DATABASE_SSL_CA: z.string().optional(),
  // Quantos proxies à frente da API são confiáveis para ler o IP do cliente em
  // X-Forwarded-For (1 atrás do proxy da Hostinger). 0 ignora o cabeçalho, que o próprio cliente pode forjar.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // Chave da cópia cifrada das senhas (32 bytes em base64), que o admin pode consultar.
  // Opcional: sem ela o login continua, mas criar ou trocar senha falha.
  PASSWORD_ENCRYPTION_KEY: z.string().optional(),
  SEED_DEMO_DATA: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const config = configSchema.parse(process.env);
