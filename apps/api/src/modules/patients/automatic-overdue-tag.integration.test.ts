import { nextTestCpf } from "../../test-support/cpf.js";
import { OVERDUE_PAYMENT_TAG } from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  type UserRole,
  authenticatedApp,
  configuredPlan,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("etiqueta automática 'Pagamento atrasado' (QC7)", () => {
  it("aparece para quem tem parcela vencida, bate com os Contatos sugeridos e não é gravada à mão", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const createPatient = async (fullName: string, phone: string) =>
        (
          await app.inject({
            method: "POST",
            url: "/patients",
            headers,
            payload: {
              cpf: nextTestCpf(),
              fullName,
              phone,
              whatsapp: phone,
              emergencyContactName: fullName,
              emergencyContactPhone: phone,
              tags: [],
            },
          })
        ).json() as { id: string };
      const late = await createPatient("Lara Atrasada", "11955550001");
      const onTime = await createPatient("Otávio Em Dia", "11955550002");
      const service = (
        await app.inject({ method: "GET", url: "/services", headers })
      ).json()[0] as { id: string };
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          ...(await configuredPlan(app, {
            serviceId: service.id,
            name: "Pacote atrasado",
            totalSessions: 10,
            totalValueInCents: 30000,
          })),
          patientId: late.id,
          kind: "fixed_package",
          validFrom: "2026-09-01",
          validUntil: "2027-03-01",
          installments: 1,
          firstDueDate: "2026-09-05",
        },
      });
      expect(plan.statusCode, plan.body).toBe(201);

      const tagsOf = (list: { id: string; tags: string[] }[], id: string) =>
        list.find((item) => item.id === id)?.tags;
      const patients = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json() as { id: string; tags: string[] }[];
      expect(tagsOf(patients, late.id)).toEqual([OVERDUE_PAYMENT_TAG]);
      expect(tagsOf(patients, onTime.id)).toEqual([]);

      const options = (
        await app.inject({ method: "GET", url: "/patients/options", headers })
      ).json() as { id: string; tags: string[] }[];
      expect(tagsOf(options, late.id)).toEqual([OVERDUE_PAYMENT_TAG]);
      const detail = await app.inject({
        method: "GET",
        url: `/patients/${late.id}`,
        headers,
      });
      expect(detail.json().tags).toEqual([OVERDUE_PAYMENT_TAG]);

      // Mesmo número que os Contatos sugeridos (motivo overdue_payment).
      const suggestions = (
        await app.inject({
          method: "GET",
          url: "/relationship/suggestions",
          headers,
        })
      ).json() as { patientId: string; reason: string }[];
      const suggested = new Set(
        suggestions
          .filter((item) => item.reason === "overdue_payment")
          .map((item) => item.patientId),
      );
      const tagged = new Set(
        patients
          .filter((item) => item.tags.includes(OVERDUE_PAYMENT_TAG))
          .map((item) => item.id),
      );
      expect(tagged).toEqual(suggested);

      // Exportação filtra pela etiqueta automática.
      const exported = await app.inject({
        method: "GET",
        url: `/patients/export?tags=${encodeURIComponent(OVERDUE_PAYMENT_TAG)}&columns=fullName,tags`,
        headers,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).toContain("Lara Atrasada");
      expect(exported.body).not.toContain("Otávio Em Dia");

      // Como a sugestão, só aparece para quem vê o Financeiro.
      const receptionPatients = (
        await app.inject({
          method: "GET",
          url: "/patients",
          headers: roleHeaders("reception"),
        })
      ).json() as { id: string; tags: string[] }[];
      expect(tagsOf(receptionPatients, late.id)).toEqual([]);

      // Informada à mão, é ignorada (não grava nem dá erro de etiqueta desconhecida).
      const updated = await app.inject({
        method: "PUT",
        url: `/patients/${onTime.id}`,
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Otávio Em Dia",
          phone: "11955550002",
          whatsapp: "11955550002",
          emergencyContactName: "Otávio Em Dia",
          emergencyContactPhone: "11955550002",
          tags: ["pagamento atrasado"],
        },
      });
      expect(updated.statusCode, updated.body).toBe(200);
      expect(updated.json().tags).toEqual([]);
      const keptLate = await app.inject({
        method: "PUT",
        url: `/patients/${late.id}`,
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Lara Atrasada",
          phone: "11955550001",
          whatsapp: "11955550001",
          emergencyContactName: "Lara Atrasada",
          emergencyContactPhone: "11955550001",
          tags: [],
        },
      });
      expect(keptLate.json().tags).toEqual([OVERDUE_PAYMENT_TAG]);

      // Não pode ser cadastrada nem renomeada em Configurações › Etiquetas.
      const created = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers,
        payload: { name: "Pagamento Atrasado" },
      });
      expect(created.statusCode).toBe(400);
      expect(created.json().code).toBe("PATIENT_TAG_AUTOMATIC");
      const configured = (
        await app.inject({ method: "GET", url: "/patient-tags", headers })
      ).json() as { id: string; name: string }[];
      expect(configured.map((tag) => tag.name)).not.toContain(
        OVERDUE_PAYMENT_TAG,
      );
      const renamed = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${configured[0]!.id}`,
        headers,
        payload: { name: OVERDUE_PAYMENT_TAG },
      });
      expect(renamed.statusCode).toBe(400);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
