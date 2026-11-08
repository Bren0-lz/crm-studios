import { starterAssessmentTemplates } from "@crm/contracts";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { demoCpf, demoPatients } from "./demo-patients.js";
import { databaseSslConfig } from "./infrastructure/database-connection.js";
import {
  Database,
  type Pool,
  type Queryable,
} from "./infrastructure/mysql-client.js";
import { ensurePatientTags } from "./mysql-repository.js";
import { seedDemoScenarios } from "./seed-demo-scenarios.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "./modules/finance/daily-cash.js";
import { createDefaultBranch } from "./storage/mysql/branches.js";
import { insertRows, localTime, utcTime } from "./storage/mysql/sql.js";

const migrationsPath = fileURLToPath(new URL("../migrations", import.meta.url));
const migrationLock = "crm:schema-migrations";

export function createDatabasePool({
  max = 10,
  url = config.DATABASE_URL,
  idleTimeoutMillis = 30_000,
  multipleStatements = false,
}: {
  max?: number;
  url?: string;
  idleTimeoutMillis?: number;
  multipleStatements?: boolean;
} = {}) {
  return new Database({
    url,
    connectionLimit: max,
    idleTimeoutMillis,
    multipleStatements,
    ssl: databaseSslConfig({
      ssl: config.DATABASE_SSL,
      ...(config.DATABASE_SSL_CA ? { caCertPath: config.DATABASE_SSL_CA } : {}),
    }),
  });
}

/**
 * Aplica as migrações pendentes, em ordem, e devolve os nomes das que foram aplicadas agora.
 * No MySQL cada comando de estrutura (CREATE/ALTER) grava na hora, sem transação: se uma
 * migração falhar no meio, corrija o banco à mão antes de rodar de novo. A trava nomeada
 * impede duas instâncias migrando ao mesmo tempo.
 */
/**
 * Migrações renomeadas depois de entrarem na `main` (nome novo → nome antigo). Se o banco já
 * registrou o nome antigo, o novo conta como aplicado e não roda de novo — a produção pode ter
 * aplicado a migração com o nome antigo antes da renomeação. Nunca remova uma entrada.
 */
export const renamedMigrations: Readonly<Record<string, string>> = {
  // Duas 0052 entraram ao mesmo tempo (#303 e #304); a do produto passou a 0053 em 07/11/2026.
  "0053_product_business_line.sql": "0052_product_business_line.sql",
};

export async function runMigrations(pool: Pool): Promise<string[]> {
  const runner = createDatabasePool({
    max: 1,
    url: pool.url,
    multipleStatements: true,
  });
  const lock = await runner.connect();
  try {
    await lock.lock(migrationLock, 120);
    await lock.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(191) NOT NULL PRIMARY KEY,
        applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      )
    `);
    const files = (await readdir(migrationsPath))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    const applied = new Set(
      (
        await lock.query<{ name: string }>("SELECT name FROM schema_migrations")
      ).rows.map((row) => row.name),
    );

    const appliedNow: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const previousName = renamedMigrations[file];
      if (previousName && applied.has(previousName)) {
        await lock.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          file,
        ]);
        continue;
      }
      const sql = await readFile(`${migrationsPath}/${file}`, "utf8");
      await lock.execute(sql);
      await lock.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      appliedNow.push(file);
    }
    pool.resetSchemaInfo();
    return appliedNow;
  } finally {
    lock.release();
    await runner.end();
  }
}

/**
 * Clínica nova: os modelos iniciais de avaliação entram junto com ela (seed demo e
 * `db:cleanup-test-data`). Não duplica um modelo de mesmo nome.
 */
export async function insertStarterAssessmentTemplates(
  client: Queryable,
  clinicId: string,
) {
  for (const template of starterAssessmentTemplates) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assessment_templates (id, clinic_id, name, specialty, fields, version, status, family_id)
       SELECT $4, $5, $1, $2, $3, 1, 'published', $4
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM assessment_templates WHERE clinic_id = $5 AND name = $1
       )`,
      [template.name, template.specialty, template.fields, id, clinicId],
    );
  }
}

const demoClinicId = "11111111-1111-4111-8111-111111111111";

/** Hoje (aaaa-mm-dd) no fuso da clínica, às `hora` locais, como instante UTC. */
const todayAt = (time: string) =>
  utcTime(`TIMESTAMP(DATE(${localTime("UTC_TIMESTAMP(6)")}), '${time}')`);

export async function seedDemoData(pool: Pool) {
  const passwordHash = await hash("Admin@123", 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO clinics (id, name, legal_name, timezone)
       VALUES ($1, 'Studios Aryana', 'Studios Aryana Ltda.', $2)
       ON DUPLICATE KEY UPDATE id = id`,
      [demoClinicId, DEFAULT_CLINIC_TIMEZONE],
    );
    // Só uma unidade demo nova recebe o endereço fictício; nunca sobrescreve cadastro existente.
    await client.query(
      `INSERT INTO branches (id, clinic_id, name, is_default, street, number, neighborhood, city, state)
       SELECT $2, $1, 'Matriz', 1, 'Rua das Flores', '100', 'Centro', 'Campinas', 'SP'
       FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM branches WHERE clinic_id = $1 AND is_default = 1)`,
      [demoClinicId, randomUUID()],
    );
    const branchId = await createDefaultBranch(client, demoClinicId);
    await insertStarterAssessmentTemplates(client, demoClinicId);
    await client.query(
      `INSERT INTO users (id, clinic_id, full_name, email, password_hash, role)
       VALUES ('22222222-2222-4222-8222-222222222222', $2, 'Aryana Dutra', 'admin@movimenta.local', $1, 'admin')
       ON DUPLICATE KEY UPDATE id = id`,
      [passwordHash, demoClinicId],
    );
    await insertRows(
      client,
      "professionals",
      [
        [
          "33333333-3333-4333-8333-333333333333",
          "Dra. Ana Martins",
          "CREFITO-3 123456-F",
          "Fisioterapia ortopédica",
          "#5c6f68",
        ],
        [
          "44444444-4444-4444-8444-444444444444",
          "Dr. Paulo Nunes",
          "CREFITO-3 654321-F",
          "Fisioterapia esportiva",
          "#9a6f4f",
        ],
      ].map(([id, full_name, crefito, specialty, color]) => ({
        id,
        clinic_id: demoClinicId,
        branch_id: branchId,
        full_name,
        crefito,
        specialty,
        color,
      })),
      { onDuplicate: "ignore" },
    );
    await insertRows(
      client,
      "rooms",
      [
        ["55555555-5555-4555-8555-555555555555", "Sala Movimento", 1],
        ["66666666-6666-4666-8666-666666666666", "Estúdio 1", 4],
      ].map(([id, name, capacity]) => ({
        id,
        clinic_id: demoClinicId,
        branch_id: branchId,
        name,
        capacity,
      })),
      { onDuplicate: "ignore" },
    );
    await insertRows(
      client,
      "services",
      [
        [
          "77777777-7777-4777-8777-777777777777",
          "Fisioterapia individual",
          50,
        ],
        [
          "88888888-8888-4888-8888-888888888888",
          "Avaliação funcional",
          60,
        ],
      ].map(([id, name, duration_minutes]) => ({
        id,
        clinic_id: demoClinicId,
        name,
        duration_minutes,
      })),
      { onDuplicate: "ignore" },
    );
    await insertRows(
      client,
      "patients",
      [
        [
          "99999999-9999-4999-8999-999999999999",
          "PAC-00001",
          "Helena Almeida",
          "11987654321",
          "Pós-operatório",
        ],
        [
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "PAC-00002",
          "Lucas Ribeiro",
          "11976543210",
          "Esportivo",
        ],
        [
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "PAC-00003",
          "Sônia Barros",
          "11965432109",
          "Recorrente",
        ],
      ].map(([id, record_number, full_name, phone, tag], index) => ({
        id,
        clinic_id: demoClinicId,
        record_number,
        full_name,
        cpf: demoCpf(index + 1),
        phone,
        whatsapp: phone,
        emergency_contact_name: full_name,
        emergency_contact_phone: phone,
        tags: [tag],
      })),
      { onDuplicate: "ignore" },
    );
    await insertRows(
      client,
      "patients",
      demoPatients.map((patient) => ({
        id: patient.id,
        clinic_id: patient.clinicId,
        record_number: patient.recordNumber,
        full_name: patient.fullName,
        cpf: patient.cpf ?? null,
        email: patient.email ?? null,
        phone: patient.phone,
        whatsapp: patient.whatsapp ?? null,
        birth_date: patient.birthDate ?? null,
        emergency_contact_name: patient.emergencyContactName ?? null,
        emergency_contact_phone: patient.emergencyContactPhone ?? null,
        notes: patient.notes ?? null,
        tags: patient.tags,
        extra_fields: patient.extraFields ?? {},
        status: patient.status,
        created_at: new Date(patient.createdAt),
        updated_at: new Date(patient.updatedAt),
      })),
      { onDuplicate: "ignore" },
    );
    const demoAppointments = [
      [
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "99999999-9999-4999-8999-999999999999",
        "33333333-3333-4333-8333-333333333333",
        "55555555-5555-4555-8555-555555555555",
        "77777777-7777-4777-8777-777777777777",
        "09:00",
        "09:50",
        "confirmed",
      ],
      [
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555",
        "88888888-8888-4888-8888-888888888888",
        "10:30",
        "11:30",
        "scheduled",
      ],
      [
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "33333333-3333-4333-8333-333333333333",
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
        "14:00",
        "14:50",
        "scheduled",
      ],
    ];
    for (const [
      id,
      patientId,
      professionalId,
      roomId,
      serviceId,
      start,
      end,
      status,
    ] of demoAppointments)
      await client.query(
        `INSERT INTO appointments (id, clinic_id, branch_id, patient_id, professional_id, room_id, service_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ${todayAt(`${start}:00`)}, ${todayAt(`${end}:00`)}, $8)
         ON DUPLICATE KEY UPDATE id = id`,
        [
          id,
          demoClinicId,
          branchId,
          patientId,
          professionalId,
          roomId,
          serviceId,
          status,
        ],
      );
    await seedDemoScenarios(client, branchId);
    // Etiquetas dos clientes demo precisam estar configuradas (o cadastro só aceita as da lista).
    const demoTags = await client.query<{ tags: string[] }>(
      "SELECT tags FROM patients WHERE clinic_id = $1",
      [demoClinicId],
    );
    await ensurePatientTags(client, demoClinicId, [
      ...new Set(demoTags.rows.flatMap((row) => row.tags)),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Data de lançamento padrão (dia da clínica do `createdAt`). */
export const postedOnOf = (createdAt: string | Date) =>
  clinicDateOf(createdAt, DEFAULT_CLINIC_TIMEZONE);
