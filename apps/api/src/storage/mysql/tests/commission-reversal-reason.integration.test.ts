import type { AdminAuditPage } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { buildApp } from "../../../app.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { sellSessionForAppointment } from "../../../test-support/commission-billing.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// D4: estornos de comissão e de pagamento de conta de comissão pedem motivo, que vai ao Histórico.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: motivo nos estornos de comissão`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let app: Awaited<ReturnType<typeof buildApp>>;
      let headers: { authorization: string };

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("commissionrsn");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(async () => {
        if (storage === "memory") repository = new MemoryClinicRepository();
        app = await buildApp({ repository, logger: false });
        headers = {
          authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
        };
      });

      afterEach(async () => {
        await app?.close();
      });

      afterAll(async () => {
        await database?.drop();
      });

      /** Comissão paga de um atendimento realizado no mês `competence`. */
      async function paidCommission(competence: string) {
        const marker = randomUUID().slice(0, 8);
        const professional = await repository.createProfessional(clinicId, {
            fullName: `Profissional estorno ${marker}`,
            crefito: randomUUID().slice(0, 12),
            specialty: "Pilates",
            color: "#547A6B",
          }),
          room = await repository.createRoom(clinicId, {
            name: `Sala ${marker}`,
            capacity: 1,
          }),
          service = await repository.createService(clinicId, {
            name: `Pilates ${marker}`,
            durationMinutes: 50,
          }),
          patient = await repository.createPatient(clinicId, {
            cpf: nextTestCpf(),
            fullName: `Cliente estorno de comissão ${marker}`,
            phone: "11988887777",
            tags: [],
          });
        await repository.createCommissionRule(clinicId, {
          professionalId: professional.id,
          percentage: 10,
          effectiveFrom: "2025-01-01",
        });
        const appointment = await repository.createAppointment(clinicId, {
          patientId: patient.id,
          professionalId: professional.id,
          roomId: room.id,
          serviceId: service.id,
          startsAt: `${competence}-08T13:00:00Z`,
          visitType: "regular",
          notes: "",
        });
        await sellSessionForAppointment(
          repository,
          clinicId,
          actorId,
          appointment,
          15_000,
        );
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        const commission = (
          await repository.generateCommissions(clinicId, competence, actorId)
        ).find((item) => item.appointmentId === appointment.id)!;
        expect(commission.amountInCents).toBe(1_500);
        await repository.settleCommission(clinicId, actorId, commission.id);
        return { commission, professional, appointment };
      }

      /** Usuário com o Financeiro, mas sem permissão de estornar comissão. */
      async function withoutReversal() {
        const user = await repository.createAdminUser(
          clinicId,
          actorId,
          {
            fullName: "Financeiro sem estorno",
            email: `sem-estorno-${randomUUID().slice(0, 8)}@teste.local`,
            password: "SenhaForte123",
            role: "user",
            permissions: ["finance.view", "finance.commissions_pay"],
          },
          "unused",
        );
        return {
          authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
        };
      }

      /** 403 antes do corpo; depois 400 sem motivo, só espaços ou longo demais. */
      async function expectReasonRequired(url: string) {
        const forbidden = await app.inject({
          method: "POST",
          url,
          headers: await withoutReversal(),
        });
        expect(forbidden.statusCode).toBe(403);
        for (const payload of [undefined, {}, { reason: "   " }]) {
          const refused = await app.inject({
            method: "POST",
            url,
            headers,
            ...(payload ? { payload } : {}),
          });
          expect(refused.statusCode).toBe(400);
          expect(refused.json().message).toContain("Informe o motivo");
        }
        const tooLong = await app.inject({
          method: "POST",
          url,
          headers,
          payload: { reason: "x".repeat(501) },
        });
        expect(tooLong.statusCode).toBe(400);
        expect(tooLong.json().message).toContain("até 500 caracteres");
      }

      async function history(action: string, entityId: string) {
        return (
          await app.inject({
            url: `/history/audit-events?action=${action}`,
            headers,
          })
        )
          .json<AdminAuditPage>()
          .items.filter((item) => item.entityId === entityId);
      }

      it("estorno de comissão exige motivo e o mostra no Histórico", async () => {
        const { commission } = await paidCommission("2025-05");
        const url = `/finance/commissions/${commission.id}/reverse`;
        await expectReasonRequired(url);
        // As recusas não estornaram a comissão.
        expect(
          (await repository.getFinancialWorkspace(clinicId)).commissions.find(
            (item) => item.id === commission.id,
          )?.status,
        ).toBe("paid");

        const reversed = await app.inject({
          method: "POST",
          url,
          headers,
          payload: { reason: "  Comissão paga em duplicidade  " },
        });
        expect(reversed.statusCode).toBe(200);
        expect(reversed.json()).toMatchObject({
          id: commission.id,
          status: "open",
        });
        const events = await history(
          "operation.finance.commissions_reverse",
          commission.id,
        );
        expect(events).toHaveLength(1);
        expect(events[0]?.metadata).toMatchObject({
          reason: "Comissão paga em duplicidade",
        });
        // O evento do estorno (domínio) também leva o motivo. Só a memória grava esse evento:
        // no MySQL o estorno avulso fica só no caixa (`commission_payment_events`).
        const domain = await history(
          "commission.payment_reversed",
          commission.id,
        );
        expect(domain).toHaveLength(storage === "memory" ? 1 : 0);
        for (const event of domain)
          expect(event.metadata).toMatchObject({
            reason: "Comissão paga em duplicidade",
          });
      });

      it("estorno de pagamento de conta de comissão exige motivo e o mostra no Histórico", async () => {
        const { commission, professional, appointment } =
          await paidCommission("2025-06");
        // Origem desfeita depois do pagamento: a conciliação gera o ajuste que é pago à parte.
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "confirmed",
        );
        const preview = await repository.getCommissionReconciliationPreview(
          clinicId,
          commission.id,
        );
        await repository.reconcileCommission(clinicId, actorId, commission.id, {
          idempotencyKey: randomUUID(),
          expectedDigest: preview.digest,
          reason: "Origem corrigida após o pagamento",
        });
        const payment = await repository.settleCommissionAccount(
          clinicId,
          actorId,
          commission.id,
          professional.id,
          -1_500,
        );
        const url = `/finance/commission-account-payments/${payment.id}/reverse`;
        await expectReasonRequired(url);
        expect(
          (
            await repository.getCommissionReconciliationPreview(
              clinicId,
              commission.id,
            )
          ).payments.find((item) => item.id === payment.id)?.reversedAt,
        ).toBeUndefined();

        const reversed = await app.inject({
          method: "POST",
          url,
          headers,
          payload: { reason: "Pagamento lançado em duplicidade" },
        });
        expect(reversed.statusCode).toBe(200);
        expect(reversed.json().reversedAt).toEqual(expect.any(String));
        const events = await history(
          "operation.finance.commissions_reverse",
          payment.id,
        );
        expect(events).toHaveLength(1);
        expect(events[0]?.metadata).toMatchObject({
          reason: "Pagamento lançado em duplicidade",
        });
        // O evento "Estorno da comissão conciliada" também leva o motivo.
        const domain = (
          await history("commission.account_reversed", commission.id)
        ).filter((item) => item.metadata.paymentId === payment.id);
        expect(domain).toHaveLength(1);
        expect(domain[0]?.metadata).toMatchObject({
          paymentId: payment.id,
          reason: "Pagamento lançado em duplicidade",
        });
      });
    },
  );
}
