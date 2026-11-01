import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: promoção das campanhas manuais`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("campaignpromo");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("guarda a promoção da campanha e o uso ao agendar, separado das automáticas", async () => {
        const patient = await repository.createPatient(clinicId, {
          cpf: nextTestCpf(),
          fullName: "Paula Promo Manual",
          phone: "11988887777",
          tags: [],
        });
        const template = await repository.createMessageTemplate(
          clinicId,
          actorId,
          { title: "Promo", body: "Olá, {{nome}}", images: [] },
        );
        const recipients = [
          {
            patientId: patient.id,
            patientName: patient.fullName,
            phone: "11988887777",
            message: "Olá, Paula",
          },
        ];
        const plain = await repository.createWhatsappCampaign(
          clinicId,
          actorId,
          { templateId: template.id, name: "Sem promoção", recipients },
        );
        expect(plain.promotion).toBeUndefined();
        const campaign = await repository.createWhatsappCampaign(
          clinicId,
          actorId,
          {
            templateId: template.id,
            name: "Com promoção",
            recipients,
            promotion: { validUntil: "2039-06-30" },
          },
        );
        expect(campaign.promotion).toEqual({ validUntil: "2039-06-30" });
        expect(
          (await repository.listWhatsappCampaigns(clinicId)).find(
            (item) => item.id === campaign.id,
          )?.promotion,
        ).toEqual({ validUntil: "2039-06-30" });

        const [[professional], [room], [service]] = await Promise.all([
          repository.listProfessionals(clinicId),
          repository.listRooms(clinicId),
          repository.listServices(clinicId),
        ]);
        const booked = await repository.createAppointment(
          clinicId,
          {
            patientId: patient.id,
            professionalId: professional!.id,
            roomId: room!.id,
            serviceId: service!.id,
            startsAt: "2039-06-20T13:00:00.000Z",
            visitType: "regular",
          },
          {
            promotion: {
              source: "manual",
              campaignId: campaign.id,
              occurrenceKey: campaign.recipients[0]!.id,
              redeemedOn: "2039-06-05",
            },
          },
        );
        const used = await repository.listWhatsappCampaignRedemptions(clinicId);
        expect(used).toEqual([
          expect.objectContaining({
            campaignId: campaign.id,
            patientId: patient.id,
            occurrenceKey: campaign.recipients[0]!.id,
            appointmentId: booked.id,
            appointmentStatus: "scheduled",
            redeemedOn: "2039-06-05",
          }),
        ]);
        expect(used[0]?.blockedUntil).toBeUndefined();
        expect(
          (await repository.listAutoCampaignRedemptions(clinicId)).some(
            (item) => item.campaignId === campaign.id,
          ),
        ).toBe(false);
      });
    },
  );
}
