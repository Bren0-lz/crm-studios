import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3333),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("development-secret-change-before-production"),
  STORAGE_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://crm:crm@localhost:5432/crm"),
  DATABASE_SSL: z.enum(["auto", "disable", "require", "verify"]).default("auto"),
  DATABASE_SSL_CA: z.string().optional(),
  SEED_DEMO_DATA: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const config = configSchema.parse(process.env);
