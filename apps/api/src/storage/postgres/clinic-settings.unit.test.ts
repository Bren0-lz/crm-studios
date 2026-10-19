import type { ClinicSettingsInput } from "@crm/contracts";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresClinicRepository } from "../../postgres-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const input: ClinicSettingsInput = {
  name: "Clínica atualizada",
  legalName: "Clínica atualizada Ltda.",
  taxId: "11.222.333/0001-81",
  phone: "11999991234",
  email: "clinica@example.com",
  address: "Rua de teste, 123",
  timezone: "America/Sao_Paulo",
};

// Models the serverless pool: a pool query cannot acquire another connection
// while the only client is leased, even after that client commits.
function singleConnectionRepository({
  missing = false,
  auditFails = false,
} = {}) {
  let leased = false;
  const row = {
    id: clinicId,
    ...input,
    updatedAt: new Date("2026-10-13T12:00:00.000Z"),
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("UPDATE clinics"))
      return { rows: missing ? [] : [row], rowCount: missing ? 0 : 1 };
    if (sql.includes("FROM clinics"))
      return { rows: missing ? [] : [row], rowCount: missing ? 0 : 1 };
    if (sql.includes("INSERT INTO audit_events") && auditFails)
      throw new Error("Audit unavailable");
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn(() => {
    leased = false;
  });
  const pool = {
    connect: vi.fn(async () => {
      if (leased) throw new Error("Connection acquisition timeout");
      leased = true;
      return { query, release };
    }),
    query: vi.fn(async (sql: string) => {
      if (leased) throw new Error("Connection acquisition timeout");
      return query(sql);
    }),
  };
  return {
    repository: new PostgresClinicRepository(pool as unknown as Pool),
    query,
    release,
  };
}

describe("clinic settings with a single database connection", () => {
  it("returns all saved fields and releases the connection for repeated saves", async () => {
    const { repository, release } = singleConnectionRepository();
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        await repository.updateClinicSettings(clinicId, actorId, input),
      ).toEqual({
        id: clinicId,
        ...input,
        updatedAt: "2026-10-13T12:00:00.000Z",
      });
    }
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing clinic and releases the connection", async () => {
    const { repository, query, release } = singleConnectionRepository({
      missing: true,
    });
    await expect(
      repository.updateClinicSettings(clinicId, actorId, input),
    ).rejects.toMatchObject({
      code: "CLINIC_NOT_FOUND",
    });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back instead of reporting success if the transactional audit fails", async () => {
    const { repository, query, release } = singleConnectionRepository({
      auditFails: true,
    });
    await expect(
      repository.updateClinicSettings(clinicId, actorId, input),
    ).rejects.toThrow("Audit unavailable");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
});
