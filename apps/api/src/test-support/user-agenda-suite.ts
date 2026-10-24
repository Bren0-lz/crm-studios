import { nextTestCpf } from "./cpf.js";
import { randomUUID } from "node:crypto";
import {
  adminUserInputSchema,
  adminUserUpdateSchema,
  saoPauloToday,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import type { ClinicRepository } from "../repository.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const data = () => ({
  fullName: "Dra. Ana",
  crefito: randomUUID(),
  specialty: "Pilates",
  color: "#547A6B",
});
const input = () =>
  adminUserInputSchema.parse({
    fullName: "Ana Souza",
    email: `${randomUUID()}@test.local`,
    role: "user",
    password: "Senha123",
    professional: { mode: "create", data: data() },
  });
const update = (extra: Record<string, unknown>) =>
  adminUserUpdateSchema.parse({
    fullName: "Ana Souza",
    role: "user",
    active: true,
    ...extra,
  });

export function userAgendaSuite(repository: () => ClinicRepository) {
  describe("usuário e agenda na mesma operação", () => {
    it("cria, edita, desativa e reativa o mesmo profissional sem alterar o histórico", async () => {
      const repo = repository();
      const created = await repo.createAdminUser(
        clinic,
        actor,
        {
          ...input(),
          commission: { percentage: 20, effectiveFrom: saoPauloToday() },
        },
        "hash",
      );
      const professional = created.professional!;
      expect(created).toMatchObject({
        professionalId: professional.id,
        professionalName: "Dra. Ana",
        commissionPercentage: 20,
      });
      expect(professional).toMatchObject({
        active: true,
        clinicId: clinic,
        specialty: "Pilates",
      });
      expect(professional.branchId).toBeTruthy();
      const patient = await repo.createPatient(clinic, {
        cpf: nextTestCpf(),
        fullName: "Cliente unificado",
        phone: "11999991234",
        tags: [],
      });
      const [room] = await repo.listRooms(clinic);
      const [service] = await repo.listServices(clinic);
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + 10);
      startsAt.setUTCHours(14, 0, 0, 0);
      const appointment = await repo.createAppointment(clinic, {
        patientId: patient.id,
        professionalId: professional.id,
        roomId: room!.id,
        serviceId: service!.id,
        startsAt: startsAt.toISOString(),
        visitType: "regular",
        notes: "",
      });
      const renamed = {
        fullName: "Ana na agenda",
        crefito: professional.crefito,
        specialty: professional.specialty,
        color: "#112233",
      };
      const edited = await repo.updateAdminUser(
        clinic,
        actor,
        created.id,
        update({
          fullName: "Nome do acesso",
          professional: { mode: "save", id: professional.id, data: renamed },
          commission: { percentage: 30, effectiveFrom: saoPauloToday() },
        }),
      );
      expect(edited).toMatchObject({
        fullName: "Nome do acesso",
        professional: {
          id: professional.id,
          fullName: "Ana na agenda",
          color: "#112233",
        },
        commissionPercentage: 30,
      });
      const disabled = await repo.updateAdminUser(
        clinic,
        actor,
        created.id,
        update({ professional: { mode: "deactivate" } }),
      );
      expect(disabled).toMatchObject({
        professionalId: professional.id,
        professional: { active: false },
      });
      expect(
        (await repo.listProfessionals(clinic)).some(
          (p) => p.id === professional.id,
        ),
      ).toBe(false);
      const appointments = await repo.listAppointments(
        clinic,
        startsAt.toISOString(),
        new Date(+startsAt + 86400000).toISOString(),
      );
      expect(appointments.find((a) => a.id === appointment.id)).toMatchObject({
        professionalName: "Ana na agenda",
        professionalColor: "#112233",
      });
      await expect(
        repo.createAppointment(clinic, {
          patientId: patient.id,
          professionalId: professional.id,
          roomId: room!.id,
          serviceId: service!.id,
          startsAt: new Date(+startsAt + 86400000).toISOString(),
          visitType: "regular",
          notes: "",
        }),
      ).rejects.toBeTruthy();
      const active = await repo.updateAdminUser(
        clinic,
        actor,
        created.id,
        update({
          professional: { mode: "save", id: professional.id, data: renamed },
        }),
      );
      expect(active?.professional).toMatchObject({
        id: professional.id,
        active: true,
      });
      expect(
        (await repo.listProfessionals(clinic)).filter(
          (p) => p.id === professional.id,
        ),
      ).toHaveLength(1);
    });

    it("preserva chamadas antigas e vincula um cadastro existente sem duplicá-lo", async () => {
      const repo = repository();
      const newInput = input();
      delete newInput.professional;
      const user = await repo.createAdminUser(clinic, actor, newInput, "hash");
      expect(user.professional).toBeUndefined();
      const details = data();
      const professional = await repo.createProfessional(clinic, details);
      const linked = await repo.updateAdminUser(
        clinic,
        actor,
        user.id,
        update({
          professional: { mode: "save", id: professional.id, data: details },
        }),
      );
      expect(linked?.professional?.id).toBe(professional.id);
      const unchanged = await repo.updateAdminUser(
        clinic,
        actor,
        user.id,
        update({ fullName: "Só nome do acesso" }),
      );
      expect(unchanged?.professional).toEqual(linked?.professional);
      const unlinked = await repo.setAdminUserProfessional(
        clinic,
        actor,
        user.id,
        null,
      );
      expect(unlinked?.professionalId).toBeUndefined();
    });

    it("rejeita registro e e-mail duplicados sem deixar usuário, comissão ou auditoria parcial", async () => {
      const repo = repository();
      const firstInput = input();
      const first = await repo.createAdminUser(
        clinic,
        actor,
        firstInput,
        "hash",
      );
      const users = await repo.listAdminUsers(clinic);
      const audit = await repo.listAdminAuditEvents(clinic);
      const duplicate = input();
      duplicate.professional = firstInput.professional;
      await expect(
        repo.createAdminUser(
          clinic,
          actor,
          {
            ...duplicate,
            commission: { percentage: 20, effectiveFrom: saoPauloToday() },
          },
          "hash",
        ),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_CREFITO_EXISTS" });
      await expect(
        repo.createAdminUser(
          clinic,
          actor,
          { ...input(), email: first.email },
          "hash",
        ),
      ).rejects.toMatchObject({ code: "USER_EMAIL_DUPLICATE" });
      const other = await repo.createAdminUser(clinic, actor, input(), "hash");
      const before = (await repo.listAdminUsers(clinic)).find(
        (u) => u.id === other.id,
      );
      await expect(
        repo.updateAdminUser(
          clinic,
          actor,
          other.id,
          update({
            fullName: "Não deve salvar",
            commission: { percentage: 40, effectiveFrom: saoPauloToday() },
            professional: {
              mode: "save",
              id: other.professionalId!,
              data:
                firstInput.professional!.mode === "create"
                  ? firstInput.professional!.data
                  : data(),
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_CREFITO_EXISTS" });
      expect(
        (await repo.listAdminUsers(clinic)).find((u) => u.id === other.id),
      ).toEqual(before);
      expect(
        (await repo.listAdminUsers(clinic)).filter((u) => u.id !== other.id),
      ).toEqual(users);
      expect(
        (await repo.listAdminAuditEvents(clinic)).filter(
          (e) => e.entityId !== other.id,
        ),
      ).toEqual(audit);
    });

    it("desfaz tudo quando a comissão ou as filiais são inválidas", async () => {
      const repo = repository();
      const created = await repo.createAdminUser(
        clinic,
        actor,
        input(),
        "hash",
      );
      const before = await repo.listAdminUsers(clinic);
      const audit = await repo.listAdminAuditEvents(clinic);
      for (const invalid of [
        {
          commission: {
            percentage: 20,
            effectiveFrom: saoPauloToday(),
            serviceId: randomUUID(),
          },
        },
        { branchAccess: { allBranches: false, branchIds: [randomUUID()] } },
      ]) {
        await expect(
          repo.updateAdminUser(
            clinic,
            actor,
            created.id,
            update({
              fullName: "Não salvar",
              professional: { mode: "deactivate" },
              ...invalid,
            }),
          ),
        ).rejects.toBeTruthy();
        await expect(
          repo.createAdminUser(
            clinic,
            actor,
            { ...input(), ...invalid },
            "hash",
          ),
        ).rejects.toBeTruthy();
      }
      expect(await repo.listAdminUsers(clinic)).toEqual(before);
      expect(await repo.listAdminAuditEvents(clinic)).toEqual(audit);
    });

    it("mantém exclusividade do vínculo sob concorrência", async () => {
      const repo = repository();
      const details = data();
      const professional = await repo.createProfessional(clinic, details);
      const create = () =>
        repo.createAdminUser(
          clinic,
          actor,
          {
            ...input(),
            professional: { mode: "save", id: professional.id, data: details },
          },
          "hash",
        );
      const results = await Promise.allSettled([create(), create()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "PROFESSIONAL_ALREADY_LINKED" },
      });
      expect(
        (await repo.listAdminUsers(clinic)).filter(
          (u) => u.professionalId === professional.id,
        ),
      ).toHaveLength(1);
    });

    it("troca o vínculo e cria outro cadastro preservando os profissionais anteriores", async () => {
      const repo = repository();
      const user = await repo.createAdminUser(clinic, actor, input(), "hash");
      const details = data();
      const existing = await repo.createProfessional(clinic, details);
      const linked = await repo.updateAdminUser(
        clinic,
        actor,
        user.id,
        update({
          professional: { mode: "save", id: existing.id, data: details },
        }),
      );
      expect(linked?.professionalId).toBe(existing.id);
      const replacement = await repo.updateAdminUser(
        clinic,
        actor,
        user.id,
        update({ professional: { mode: "create", data: data() } }),
      );
      expect(replacement?.professionalId).not.toBe(existing.id);
      expect(replacement?.professionalId).not.toBe(user.professionalId);
      const available = await repo.listProfessionals(clinic);
      expect(available.find((p) => p.id === user.professionalId)?.active).toBe(
        true,
      );
      expect(available.find((p) => p.id === existing.id)?.active).toBe(true);
      // O vínculo anterior fica livre para outro usuário, como no endpoint legado.
      const reused = await repo.createAdminUser(
        clinic,
        actor,
        {
          ...input(),
          professional: { mode: "save", id: existing.id, data: details },
        },
        "hash",
      );
      expect(reused.professionalId).toBe(existing.id);
    });

    it("respeita clínica, filial selecionada e acesso do usuário", async () => {
      const repo = repository();
      const [main] = await repo.listBranches(clinic);
      const branch = (await repo.saveBranch(clinic, actor, {
        name: `Filial ${randomUUID()}`,
      }))!;
      const scope = { branchIds: [branch.id], writeBranchId: branch.id };
      const user = await repo.branchScope.run(scope, () =>
        repo.createAdminUser(
          clinic,
          actor,
          {
            ...input(),
            branchAccess: { allBranches: false, branchIds: [branch.id] },
          },
          "hash",
        ),
      );
      expect(user.professional?.branchId).toBe(branch.id);
      expect(
        await repo.updateAdminUser(
          randomUUID(),
          actor,
          user.id,
          update({ professional: { mode: "deactivate" } }),
        ),
      ).toBeNull();
      expect(
        (await repo.listAdminUsers(clinic)).find((item) => item.id === user.id)
          ?.professional?.active,
      ).toBe(true);
      await expect(
        repo.updateAdminUser(
          clinic,
          actor,
          user.id,
          update({
            branchAccess: { allBranches: false, branchIds: [main!.id] },
          }),
        ),
      ).rejects.toMatchObject({ code: "USER_PROFESSIONAL_BRANCH_MISMATCH" });
      await expect(
        repo.branchScope.run(
          { branchIds: [main!.id], writeBranchId: main!.id },
          () =>
            repo.updateAdminUser(
              clinic,
              actor,
              user.id,
              update({ professional: { mode: "deactivate" } }),
            ),
        ),
      ).rejects.toMatchObject({ code: "BRANCH_ACCESS_DENIED" });
      await expect(
        repo.branchScope.run(scope, () =>
          repo.createAdminUser(
            clinic,
            actor,
            {
              ...input(),
              branchAccess: { allBranches: false, branchIds: [main!.id] },
            },
            "hash",
          ),
        ),
      ).rejects.toMatchObject({ code: "USER_PROFESSIONAL_BRANCH_MISMATCH" });
      await expect(
        repo.createAdminUser(
          clinic,
          actor,
          {
            ...input(),
            professional: { mode: "save", id: randomUUID(), data: data() },
          },
          "hash",
        ),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_NOT_FOUND" });
    });
  });
}
