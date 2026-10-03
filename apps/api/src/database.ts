import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { Pool } from "pg";
import { config } from "./config.js";
import { databaseConnectionConfig, usesTransactionPooler } from "./database-connection.js";
import { demoPatients } from "./demo-patients.js";
import { seedDemoScenarios } from "./seed-demo-scenarios.js";

const migrationsPath = fileURLToPath(new URL("../migrations", import.meta.url));
const migrationLockId = 927_410_615;

export function createDatabasePool({
  max = 10,
  url = config.DATABASE_URL,
  idleTimeoutMillis = 30_000,
}: { max?: number; url?: string; idleTimeoutMillis?: number } = {}) {
  const pool = new Pool({
    ...databaseConnectionConfig({
      url,
      ssl: config.DATABASE_SSL,
      ...(config.DATABASE_SSL_CA ? { caCertPath: config.DATABASE_SSL_CA } : {}),
    }),
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis: 5_000,
  });
  // Sem este handler, uma conexão ociosa encerrada pelo servidor (ex.: Postgres
  // reiniciado) emite um "error" não tratado e derruba o processo da API.
  pool.on("error", (error) => {
    console.error("Conexão ociosa com o PostgreSQL foi encerrada:", error.message);
  });
  return pool;
}

/** Aplica as migrações pendentes, em ordem, e devolve os nomes das que foram aplicadas agora. */
export async function runMigrations(pool: Pool): Promise<string[]> {
  // Confere a URL do próprio pool (os testes de integração usam TEST_DATABASE_URL).
  const url = pool.options.connectionString ?? config.DATABASE_URL;
  if (usesTransactionPooler(url)) {
    throw new Error(
      "As migrações usam trava de sessão e não funcionam no pooler em modo transação (porta 6543). " +
        "Use a conexão direta ou o pooler em modo sessão (porta 5432) na DATABASE_URL.",
    );
  }
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsPath))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    const applied = new Set(
      (
        await client.query<{ name: string }>(
          "SELECT name FROM schema_migrations",
        )
      ).rows.map((row) => row.name),
    );

    const appliedNow: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(`${migrationsPath}/${file}`, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        appliedNow.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return appliedNow;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    client.release();
  }
}

export async function seedDemoData(pool: Pool) {
  const passwordHash = await hash("Admin@123", 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO clinics (id, name, legal_name, timezone)
      VALUES ('11111111-1111-4111-8111-111111111111', 'Studios Aryana', 'Studios Aryana Ltda.', 'America/Sao_Paulo')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(
      `
      INSERT INTO users (id, clinic_id, full_name, email, password_hash, role)
      VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Aryana Dutra', 'admin@movimenta.local', $1, 'owner')
      ON CONFLICT (clinic_id, email) DO NOTHING
      `,
      [passwordHash],
    );
    await client.query(`
      INSERT INTO professionals (id, clinic_id, full_name, crefito, specialty, color)
      VALUES
        ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Dra. Ana Martins', 'CREFITO-3 123456-F', 'Fisioterapia ortopédica', '#5c6f68'),
        ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Dr. Paulo Nunes', 'CREFITO-3 654321-F', 'Fisioterapia esportiva', '#9a6f4f')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO rooms (id, clinic_id, name, capacity)
      VALUES
        ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Sala Movimento', 1),
        ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Estúdio 1', 4)
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO services (id, clinic_id, name, duration_minutes, price_in_cents, color)
      VALUES
        ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Fisioterapia individual', 50, 18000, '#d96f4b'),
        ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 'Avaliação funcional', 60, 22000, '#3d7c78')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO patients (id, clinic_id, record_number, full_name, phone, tags)
      VALUES
        ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', 'PAC-00001', 'Helena Almeida', '11987654321', ARRAY['Pós-operatório']),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'PAC-00002', 'Lucas Ribeiro', '11976543210', ARRAY['Esportivo']),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'PAC-00003', 'Sônia Barros', '11965432109', ARRAY['Recorrente'])
      ON CONFLICT (id) DO NOTHING
    `);

    await client.query(
      `INSERT INTO patients (
        id, clinic_id, record_number, full_name, email, phone, birth_date,
        emergency_contact_name, emergency_contact_phone, notes, tags, status, created_at, updated_at
      )
      SELECT id, "clinicId", "recordNumber", "fullName", email, phone, "birthDate"::date,
        "emergencyContactName", "emergencyContactPhone", notes, tags, status::patient_status,
        "createdAt"::timestamptz, "updatedAt"::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS p(
        id uuid, "clinicId" uuid, "recordNumber" text, "fullName" text, email text,
        phone text, "birthDate" text, "emergencyContactName" text,
        "emergencyContactPhone" text, notes text, tags text[], status text,
        "createdAt" text, "updatedAt" text
      )
      ON CONFLICT DO NOTHING`,
      [JSON.stringify(demoPatients)],
    );
    // Cadastros demo gravados antes com a codificação errada ficaram com "?" no lugar de
    // letras acentuadas. Restaura só os campos idênticos à versão corrompida, sem tocar em edições.
    await client.query(
      String.raw`UPDATE patients p
      SET notes = CASE WHEN p.notes = regexp_replace(src.notes, '[^\x01-\x7F]', '?', 'g') THEN src.notes ELSE p.notes END,
        tags = CASE WHEN array_to_string(p.tags, chr(31)) = regexp_replace(array_to_string(src.tags, chr(31)), '[^\x01-\x7F]', '?', 'g') THEN src.tags ELSE p.tags END,
        updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS src(id uuid, notes text, tags text[])
      WHERE p.id = src.id
        AND (
          (p.notes IS DISTINCT FROM src.notes AND p.notes = regexp_replace(src.notes, '[^\x01-\x7F]', '?', 'g'))
          OR (p.tags IS DISTINCT FROM src.tags AND array_to_string(p.tags, chr(31)) = regexp_replace(array_to_string(src.tags, chr(31)), '[^\x01-\x7F]', '?', 'g'))
        )`,
      [JSON.stringify(demoPatients)],
    );
    await client.query(`
      INSERT INTO appointments (
      id, clinic_id, patient_id, professional_id, room_id, service_id,
      starts_at, ends_at, status
    )
    VALUES
      (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
        '99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333',
        '55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777777',
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '09:00') AT TIME ZONE 'America/Sao_Paulo'),
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '09:50') AT TIME ZONE 'America/Sao_Paulo'), 'confirmed'
      ),
      (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555', '88888888-8888-4888-8888-888888888888',
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '10:30') AT TIME ZONE 'America/Sao_Paulo'),
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '11:30') AT TIME ZONE 'America/Sao_Paulo'), 'scheduled'
      ),
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333',
        '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '14:00') AT TIME ZONE 'America/Sao_Paulo'),
        (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + time '14:50') AT TIME ZONE 'America/Sao_Paulo'), 'scheduled'
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await seedDemoScenarios(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
