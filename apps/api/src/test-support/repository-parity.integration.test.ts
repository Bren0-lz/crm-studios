import { nextTestCpf } from "./cpf.js";
import {
  appointmentStatusSchema,
  documentContentFromText,
  documentContentText,
  appointmentInputSchema,
  professionalInputSchema,
  externalOperationInputSchema,
  planPurchaseInputSchema,
  clinicSettingsInputSchema,
  guidedPatientInputSchema,
  patientInputSchema,
  patientPlanInputSchema,
  planTemplateInputSchema,
  saoPauloToday,
  supplierInputSchema,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../infrastructure/mysql-client.js";
import { createDatabasePool } from "../database.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../memory-repository.js";
import { MysqlClinicRepository } from "../mysql-repository.js";
import type { ClinicRepository } from "../repository.js";
import { atInstant } from "./clock.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const serviceId = "77777777-7777-4777-8777-777777777777";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage} repository parity`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("repositorypa");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory")
          repository = new MemoryClinicRepository(false);
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function patient(name: string) {
        return repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `${name} ${randomUUID()}`,
            phone: "11988887777",
          }),
        );
      }
      async function plan(patientId: string) {
        const services = [
          { serviceId, totalSessions: 4, totalValueInCents: 20000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: `Parity ${randomUUID()}`,
            totalValueInCents: 20000,
            services,
          }),
        );
        return repository.createPatientPlan(
          clinicId,
          actorId,
          patientPlanInputSchema.parse({
            patientId,
            planTemplateId: template.id,
            name: template.name,
            kind: "fixed_package",
            services,
            totalValueInCents: 20000,
            installments: 1,
            validFrom: "2055-01-01",
            validUntil: "2055-12-31",
            firstDueDate: "2055-01-01",
          }),
        );
      }

      it("filters period sales by inclusive dates and clinic in both repositories", async () => {
        const client = await patient("Vendas por período");
        const inside = await atInstant("2062-12-31T03:00:00Z", () =>
          plan(client.id),
        );
        const outside = await atInstant("2063-01-02T03:00:00Z", () =>
          plan(client.id),
        );
        const report = await repository.getSalesPeriodReport(
          clinicId,
          "2062-12-31",
          "2063-01-01",
        );
        expect(
          report.sales
            .filter((item) => item.patientId === client.id)
            .map((item) => item.sourceId),
        ).toEqual([inside.id]);
        expect(report.sales.map((item) => item.sourceId)).not.toContain(
          outside.id,
        );
        expect(report.summary.netSalesInCents).toBeGreaterThanOrEqual(20000);
        const branch = await repository.saveBranch(clinicId, actorId, {
          name: "Relatórios " + randomUUID(),
        });
        const scope = { branchIds: [branch!.id], writeBranchId: branch!.id };
        const branchPlan = await atInstant("2062-12-31T12:00:00Z", () =>
          repository.branchScope.run(scope, () => plan(client.id)),
        );
        const scopedReport = await repository.branchScope.run(scope, () =>
          repository.getSalesPeriodReport(clinicId, "2062-12-31", "2063-01-01"),
        );
        expect(scopedReport.sales.map((item) => item.sourceId)).toEqual([
          branchPlan.id,
        ]);
        expect(scopedReport.summary.netSalesInCents).toBe(20000);
        const foreign = await repository.getSalesPeriodReport(
          "99999999-9999-4999-8999-999999999999",
          "2062-12-31",
          "2063-01-01",
        );
        expect(foreign.sales).toEqual([]);
        expect(foreign.payments).toEqual([]);
        expect(foreign.patientsWithoutReturn).toEqual([]);
      });

      it("preserves visual contracts, individual drafts and frozen branding", async () => {
        const client = await patient("Contrato visual");
        const content = documentContentFromText(
          "Contrato para {{paciente_nome}}. Condições do serviço.",
        );
        content.doc.content![0]!.content![1]!.marks = [{ type: "bold" }];
        const template = await repository.createDocumentTemplate(clinicId, {
          name: "Contrato visual " + randomUUID(),
          kind: "contract",
          body: "Texto incompatível será derivado do conteúdo.",
          content,
        });
        expect(template.body).toBe(documentContentText(content));
        const input = {
          templateId: template.id,
          patientId: client.id,
          title: "Contrato visual do cliente",
        };
        const before = (await repository.listIssuedDocuments(clinicId)).length;
        const preview = await repository.previewDocument(clinicId, input);
        expect(preview.snapshotBody).toContain(client.fullName);
        expect((await repository.listIssuedDocuments(clinicId)).length).toBe(
          before,
        );
        const document = await repository.createIssuedDocument(
          clinicId,
          actorId,
          { ...input, content: preview.snapshotContent },
        );
        const changed = documentContentFromText(
          document.snapshotBody +
            "\n\nCondição individual adicionada ao rascunho.",
        );
        const saved = await repository.updateDocumentDraft(
          clinicId,
          document.id,
          { title: input.title, content: changed },
        );
        expect(saved).toMatchObject({
          snapshotBody: documentContentText(changed),
          snapshotContent: changed,
          branding: document.branding,
        });
        expect(
          (await repository.listDocumentTemplates(clinicId)).find(
            (item) => item.id === template.id,
          )?.content,
        ).toEqual(content);
        expect(
          await repository.updateDocumentDraft(
            "99999999-9999-4999-8999-999999999999",
            document.id,
            { title: input.title, content: changed },
          ),
        ).toBeNull();
        const next = documentContentFromText(
          "Nova versão do modelo para contratos futuros.",
        );
        await repository.createDocumentTemplateVersion(
          clinicId,
          template.id,
          "",
          next,
        );
        const [issued, blocked] = await Promise.allSettled([
          repository.updateIssuedDocumentStatus(
            clinicId,
            document.id,
            "issued",
          ),
          repository.updateDocumentDraft(clinicId, document.id, {
            title: "Alteração concorrente",
            content: next,
          }),
        ]);
        expect(issued.status).toBe("fulfilled");
        expect(blocked.status).toBe("rejected");
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === document.id,
          ),
        ).toMatchObject({
          snapshotContent: changed,
          templateVersion: 1,
          branding: document.branding,
        });
      });

      it("refuses a meeting professional who does not serve the group's service", async () => {
        await atInstant("2056-01-01T12:00:00Z", async () => {
          const [linked, other] = await Promise.all(
            ["Vinculada", "Avulsa"].map((name) =>
              repository.createProfessional(clinicId, {
                fullName: `Profissional ${name} ${randomUUID()}`,
                crefito: `PARITY-${randomUUID().slice(0, 8)}`,
                specialty: "Pilates",
                color: "#336699",
              }),
            ),
          );
          const service = await repository.createService(clinicId, {
            name: "Serviço restrito " + randomUUID(),
            durationMinutes: 60,
            priceInCents: 0,
            color: "#336699",
            professionalIds: [linked!.id],
          });
          const room = await repository.createRoom(clinicId, {
            name: "Sala restrita " + randomUUID(),
            capacity: 4,
          });
          const group = await repository.createGroupClass(clinicId, {
            serviceId: service.id,
            professionalId: linked!.id,
            roomId: room.id,
            capacity: 2,
            weeklySlots: [{ weekday: 3, startTime: "06:00", endTime: "07:00" }],
          });
          const { sessions } = await repository.getGroupWorkspace(
            clinicId,
            "2056-01-01T00:00:00Z",
            "2056-02-01T00:00:00Z",
          );
          const session = sessions.find((item) => item.groupId === group.id)!;
          expect(session).toBeDefined();
          await expect(
            repository.updateGroupSessionProfessional(
              clinicId,
              actorId,
              session.id,
              other!.id,
            ),
          ).rejects.toMatchObject({ code: "SERVICE_NOT_AVAILABLE" });
        });
      });

      it("renames groups without changing sessions, attendance, enrollments or sequence", async () => {
        await atInstant("2055-01-01T12:00:00Z", async () => {
          const professional = await repository.createProfessional(clinicId, {
            fullName: "Profissional nome " + randomUUID(),
            crefito: `PARITY-${randomUUID().slice(0, 8)}`,
            specialty: "Pilates",
            color: "#336699",
          });
          const room = await repository.createRoom(clinicId, {
            name: "Sala nome " + randomUUID(),
            capacity: 4,
          });
          const input = {
            serviceId,
            professionalId: professional.id,
            roomId: room.id,
            capacity: 2,
            weeklySlots: [{ weekday: 3, startTime: "06:00", endTime: "07:00" }],
          };
          const group = await repository.createGroupClass(clinicId, {
            ...input,
            name: "Personalizada",
          });
          const original = structuredClone(group);
          const client = await patient("Nome da turma");
          await repository.createGroupEnrollment(clinicId, {
            groupId: group.id,
            patientId: client.id,
          });
          const from = "2055-01-01T00:00:00Z",
            to = "2055-02-01T00:00:00Z";
          const initial = await repository.getGroupWorkspace(
            clinicId,
            from,
            to,
          );
          const session = initial.sessions.find(
            (item) => item.groupId === group.id,
          )!;
          expect(session).toBeDefined();
          await repository.recordGroupAttendance(
            clinicId,
            actorId,
            session.id,
            client.id,
            { status: "excused_absence" },
          );
          const before = structuredClone(
            await repository.getGroupWorkspace(clinicId, from, to),
          );
          const renamed = await repository.renameGroupClass(
            clinicId,
            group.id,
            "Novo nome",
          );
          expect(renamed).toMatchObject({
            ...original,
            name: "Novo nome",
            activeEnrollments: 1,
          });
          const after = await repository.getGroupWorkspace(clinicId, from, to);
          expect(
            after.sessions.filter((item) => item.groupId === group.id),
          ).toEqual(
            before.sessions
              .filter((item) => item.groupId === group.id)
              .map((item) => ({ ...item, groupName: "Novo nome" })),
          );
          expect(after.enrollments).toEqual(before.enrollments);
          expect(after.attendance).toEqual(before.attendance);
          expect(after.replacementCredits).toEqual(before.replacementCredits);
          expect(
            (await repository.listGroupSessions(clinicId, from, to)).find(
              (item) => item.id === session.id,
            )?.groupName,
          ).toBe("Novo nome");
          expect(
            await repository.renameGroupClass(
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              group.id,
              "Outra clínica",
            ),
          ).toBeNull();
          expect(
            await repository.renameGroupClass(
              clinicId,
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              "Inexistente",
            ),
          ).toBeNull();
          const branch = (await repository.saveBranch(clinicId, actorId, {
            name: "Nome filial " + randomUUID(),
          }))!;
          await expect(
            repository.branchScope.run(
              { branchIds: [branch.id], writeBranchId: branch.id },
              () =>
                repository.renameGroupClass(clinicId, group.id, "Outra filial"),
            ),
          ).rejects.toMatchObject({
            code: "BRANCH_ACCESS_DENIED",
            statusCode: 403,
          });
          const next = await repository.createGroupClass(clinicId, {
            ...input,
            name: "Novo nome",
            weeklySlots: [{ weekday: 4, startTime: "06:00", endTime: "07:00" }],
          });
          expect(next.name).toBe("Novo nome");
          expect(next.sequence).toBe(original.sequence + 1);
        });
      });

      it("keeps each credit's source group outside the workspace period", async () => {
        await atInstant("2055-01-01T12:00:00Z", async () => {
          const client = await patient("Parity Créditos por turma");
          const groups = [];
          for (const weekday of [0, 1]) {
            const group = await repository.createGroupClass(clinicId, {
              serviceId,
              professionalId,
              roomId,
              capacity: 2,
              weeklySlots: [{ weekday, startTime: "06:00", endTime: "07:00" }],
            });
            groups.push(group);
            await repository.createGroupEnrollment(clinicId, {
              groupId: group.id,
              patientId: client.id,
              startsOn: "2055-01-01",
            });
          }
          const initial = await repository.getGroupWorkspace(
            clinicId,
            "2055-01-01T00:00:00Z",
            "2055-02-01T00:00:00Z",
          );
          const sources = [];
          for (const group of groups) {
            const source = initial.sessions.find(
              (item) => item.groupId === group.id,
            )!;
            expect(source).toBeDefined();
            sources.push(source);
            await repository.recordGroupAttendance(
              clinicId,
              actorId,
              source.id,
              client.id,
              {
                status: "excused_absence",
              },
            );
          }
          const later = await repository.getGroupWorkspace(
            clinicId,
            "2055-03-01T00:00:00Z",
            "2055-04-01T00:00:00Z",
          );
          const credits = later.replacementCredits.filter(
            (item) => item.patientId === client.id,
          );
          expect(credits).toHaveLength(2);
          for (const source of sources) {
            expect(later.sessions.some((item) => item.id === source.id)).toBe(
              false,
            );
            expect(
              credits.find((item) => item.sourceSessionId === source.id),
            ).toMatchObject({
              clinicId,
              sourceGroupId: source.groupId,
              status: "available",
            });
          }
          const otherClinic = await repository.getGroupWorkspace(
            randomUUID(),
            "2055-03-01T00:00:00Z",
            "2055-04-01T00:00:00Z",
          );
          expect(otherClinic.replacementCredits).toEqual([]);
        });
      });

      it("counts the whole local day by status, independently of the five pending rows", async () => {
        const date = "2088-10-12";
        const client = await patient("Parity Dashboard");
        const create = (startsAt: string) =>
          repository.createAppointment(
            clinicId,
            appointmentInputSchema.parse({
              patientId: client.id,
              professionalId,
              roomId,
              serviceId,
              startsAt,
            }),
          );
        for (const [
          index,
          status,
        ] of appointmentStatusSchema.options.entries()) {
          const appointment = await create(
            `${date}T${String(6 + index).padStart(2, "0")}:00:00Z`,
          );
          await atInstant(`${date}T23:00:00Z`, () =>
            repository.updateAppointmentStatus(
              clinicId,
              appointment.id,
              status,
            ),
          );
        }
        // Midnight in São Paulo is 03:00 UTC; the end of the day is exclusive.
        await create(`${date}T03:00:00Z`);
        for (let hour = 14; hour < 19; hour++)
          await create(`${date}T${hour}:00:00Z`);
        await create("2088-10-13T02:00:00Z");
        await create("2088-10-11T23:00:00Z");
        await create("2088-10-13T03:00:00Z");

        expect(await repository.getDashboard(clinicId, date)).toMatchObject({
          appointmentsToday: 14,
          nonCancelledAppointmentsToday: 13,
          pendingToday: 9,
          awaitingConfirmationToday: 8,
          completedToday: 1,
          nextAppointments: expect.any(Array),
        });
        expect(
          (await repository.getDashboard(clinicId, date)).nextAppointments,
        ).toHaveLength(5);
        expect(
          await repository.getDashboard(clinicId, "2088-10-15"),
        ).toMatchObject({
          appointmentsToday: 0,
          nonCancelledAppointmentsToday: 0,
          pendingToday: 0,
          awaitingConfirmationToday: 0,
          completedToday: 0,
          nextAppointments: [],
        });
        expect(await repository.getDashboard(randomUUID(), date)).toMatchObject(
          {
            appointmentsToday: 0,
            nonCancelledAppointmentsToday: 0,
            pendingToday: 0,
            awaitingConfirmationToday: 0,
            completedToday: 0,
            nextAppointments: [],
          },
        );
      });

      it("saves every settings section repeatedly with one database connection", async () => {
        const original = await repository.getClinicSettings(clinicId);
        const limitedPool = pool
          ? createDatabasePool({ url: pool.url, max: 1 })
          : undefined;
        const settingsRepository = limitedPool
          ? new MysqlClinicRepository(limitedPool)
          : repository;
        try {
          const input = clinicSettingsInputSchema.parse({
            name: "Clínica de teste",
            legalName: "Clínica de teste Ltda.",
            taxId: "11.222.333/0001-81",
            phone: "(11) 99999-1234",
            email: "clinica@example.com",
            address: "Rua de teste, 123",
            timezone: "America/Sao_Paulo",
          });
          expect(
            await settingsRepository.updateClinicSettings(
              clinicId,
              actorId,
              input,
            ),
          ).toMatchObject(input);
          const cleared = {
            ...input,
            legalName: "",
            taxId: "",
            phone: "",
            email: "",
            address: "",
          };
          expect(
            await settingsRepository.updateClinicSettings(
              clinicId,
              actorId,
              cleared,
            ),
          ).toMatchObject(cleared);
          expect(
            await settingsRepository.getClinicSettings(clinicId),
          ).toMatchObject(cleared);
          const audit = await settingsRepository.listAdminAuditEvents(clinicId);
          expect(
            audit.filter((event) => event.action === "clinic.updated"),
          ).toHaveLength(2);
          await expect(
            settingsRepository.updateClinicSettings(
              randomUUID(),
              actorId,
              input,
            ),
          ).rejects.toMatchObject({ code: "CLINIC_NOT_FOUND" });

          const user = await settingsRepository.createAdminUser(
            clinicId,
            actorId,
            {
              fullName: "Usuária de teste",
              email: `${randomUUID()}@example.com`,
              role: "user",
              password: "SenhaForte123",
              permissions: ["settings.view"],
            },
            "initial-hash",
          );
          expect(
            await settingsRepository.updateAdminUser(
              clinicId,
              actorId,
              user.id,
              {
                fullName: "Usuária atualizada",
                role: "user",
                active: true,
                jobTitle: "Recepção",
                permissions: ["settings.view", "settings.tags_create"],
              },
            ),
          ).toMatchObject({
            fullName: "Usuária atualizada",
            jobTitle: "Recepção",
          });
          expect(
            await settingsRepository.resetAdminUserPassword(
              clinicId,
              actorId,
              user.id,
              "updated-hash",
            ),
          ).toBe(true);
          expect(
            await settingsRepository.setAdminUserProfessional(
              clinicId,
              actorId,
              user.id,
              null,
            ),
          ).toMatchObject({ id: user.id });

          const template = await settingsRepository.createPlanTemplate(
            clinicId,
            actorId,
            planTemplateInputSchema.parse({
              name: `Settings ${randomUUID()}`,
              totalValueInCents: 20000,
              services: [
                { serviceId, totalSessions: 4, totalValueInCents: 20000 },
              ],
            }),
          );
          expect(
            await settingsRepository.updatePlanTemplate(
              clinicId,
              actorId,
              template.id,
              { name: "Plano atualizado" },
            ),
          ).toMatchObject({ name: "Plano atualizado" });
          expect(
            await settingsRepository.updatePlanTemplate(
              clinicId,
              actorId,
              template.id,
              { active: false },
            ),
          ).toMatchObject({ active: false });

          const holiday = await settingsRepository.createHoliday(clinicId, {
            date: "2056-12-25",
            name: "Feriado de teste",
          });
          expect(await settingsRepository.listHolidays(clinicId)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: holiday.id }),
            ]),
          );
          expect(
            await settingsRepository.deleteHoliday(clinicId, holiday.id),
          ).toBe(true);

          const tag = await settingsRepository.createPatientTag(
            clinicId,
            actorId,
            { name: "Etiqueta de teste", color: "#abcdef" },
          );
          expect(
            await settingsRepository.updatePatientTag(
              clinicId,
              actorId,
              tag.id,
              { name: "Etiqueta atualizada" },
            ),
          ).toMatchObject({ name: "Etiqueta atualizada" });
          expect(
            await settingsRepository.deletePatientTag(
              clinicId,
              actorId,
              tag.id,
            ),
          ).toBe(true);

          const relationship =
            await settingsRepository.getRelationshipSettings(clinicId);
          for (const lowBalanceSessions of [7, 8]) {
            await settingsRepository.updateRelationshipSettings(clinicId, {
              ...relationship,
              lowBalanceSessions,
            });
            expect(
              await settingsRepository.getRelationshipSettings(clinicId),
            ).toMatchObject({ lowBalanceSessions });
          }
        } finally {
          try {
            if (original)
              await settingsRepository.updateClinicSettings(
                clinicId,
                actorId,
                original,
              );
          } finally {
            await limitedPool?.end();
          }
        }
      });

      it("saves, preserves and removes the clinic logo independently of other settings", async () => {
        const original = structuredClone(
          (await repository.getClinicSettings(clinicId))!,
        );
        const input = clinicSettingsInputSchema.parse(original);
        const logoDataUrl =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
        try {
          expect(
            await repository.updateClinicSettings(clinicId, actorId, {
              ...input,
              logoDataUrl,
            }),
          ).toMatchObject({ logoDataUrl });
          const withoutLogo = { ...input };
          delete withoutLogo.logoDataUrl;
          expect(
            await repository.updateClinicSettings(clinicId, actorId, {
              ...withoutLogo,
              name: "Clínica com logo preservado",
            }),
          ).toMatchObject({ name: "Clínica com logo preservado", logoDataUrl });
          expect(await repository.getClinicSettings(clinicId)).toMatchObject({
            logoDataUrl,
          });
          expect(
            await repository.updateClinicSettings(clinicId, actorId, {
              ...withoutLogo,
              logoDataUrl: "",
            }),
          ).toMatchObject({ logoDataUrl: "" });
          expect(await repository.getClinicSettings(clinicId)).toMatchObject({
            logoDataUrl: "",
          });
        } finally {
          await repository.updateClinicSettings(clinicId, actorId, {
            ...input,
            logoDataUrl: input.logoDataUrl ?? "",
          });
        }
      });

      it("purchases plan, schedule and document atomically with concurrent retry protection", async () => {
        const created = await patient("Contratação integrada");
        const services = [
          { serviceId, totalSessions: 4, totalValueInCents: 20000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: "Plano contratado " + randomUUID(),
            totalValueInCents: 20000,
            services,
          }),
        );
        const documentTemplate = await repository.createDocumentTemplate(
          clinicId,
          {
            name: "Contrato " + randomUUID(),
            kind: "contract",
            body: "Contrato de {{paciente_nome}}: {{plano_nome}} e {{plano_servicos}}.",
          },
        );
        const input = planPurchaseInputSchema.parse({
          idempotencyKey: randomUUID(),
          plan: {
            patientId: created.id,
            planTemplateId: template.id,
            name: template.name,
            kind: "fixed_package",
            services,
            totalValueInCents: 20000,
            installments: 2,
            validFrom: "2059-03-01",
            validUntil: "2059-03-31",
            firstDueDate: "2059-03-01",
          },
          appointments: [
            {
              professionalId,
              roomId,
              serviceId,
              startsAt: "2059-03-02T12:00:00Z",
            },
          ],
          document: {
            templateId: documentTemplate.id,
            title: "Contrato da contratação",
          },
        });
        const conflicting = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            ...input.appointments[0],
            patientId: created.id,
          }),
        );
        await expect(
          repository.purchasePatientPlan(clinicId, actorId, input),
        ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
        expect(await repository.listPatientPlans(clinicId, created.id)).toEqual(
          [],
        );
        expect(
          (await repository.getFinancialSummary(clinicId)).receivables.filter(
            (item) => item.patientId === created.id,
          ),
        ).toEqual([]);
        expect(
          (await repository.listIssuedDocuments(clinicId)).filter(
            (item) => item.patientId === created.id,
          ),
        ).toEqual([]);
        await repository.updateAppointmentStatus(
          clinicId,
          conflicting.id,
          "cancelled",
        );
        const results = await Promise.all([
          repository.purchasePatientPlan(clinicId, actorId, input),
          repository.purchasePatientPlan(clinicId, actorId, input),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect(results[0]!.appointments).toHaveLength(1);
        expect(results[0]!.document).toMatchObject({
          status: "issued",
          planId: results[0]!.plan.id,
          patientId: created.id,
        });
        expect(results[0]!.document!.snapshotBody).toContain(created.fullName);
        expect(
          await repository.listPatientPlans(clinicId, created.id),
        ).toHaveLength(1);
        expect(
          (await repository.getFinancialSummary(clinicId)).receivables.filter(
            (item) => item.patientId === created.id,
          ),
        ).toHaveLength(2);
        await expect(
          repository.purchasePatientPlan(clinicId, actorId, {
            ...input,
            appointments: [],
          }),
        ).rejects.toMatchObject({ code: "PLAN_PURCHASE_KEY_REUSED" });
        await repository.createDocumentTemplateVersion(
          clinicId,
          documentTemplate.id,
          "Novo conteúdo de contrato sem alterar o anterior.",
        );
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === results[0]!.document!.id,
          )?.snapshotBody,
        ).toBe(results[0]!.document!.snapshotBody);
        expect(
          (await repository.listAdminAuditEvents(clinicId)).filter(
            (item) =>
              item.action === "plan.purchased" &&
              item.entityId === results[0]!.plan.id,
          ),
        ).toHaveLength(1);
      });

      it("keeps the current group enrollment when a new plan is purchased for the same class", async () => {
        const created = await patient("Matrícula reaproveitada");
        const services = [
          { serviceId, totalSessions: 4, totalValueInCents: 20000 },
        ];
        const group = await repository.createGroupClass(clinicId, {
          serviceId,
          professionalId,
          roomId,
          capacity: 1,
          weeklySlots: [{ weekday: 6, startTime: "21:00", endTime: "22:00" }],
        });
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: "Plano da turma " + randomUUID(),
            totalValueInCents: 20000,
            services,
          }),
        );
        const purchase = (validFrom: string, validUntil: string) =>
          repository.purchasePatientPlan(
            clinicId,
            actorId,
            planPurchaseInputSchema.parse({
              idempotencyKey: randomUUID(),
              groupId: group.id,
              plan: {
                patientId: created.id,
                planTemplateId: template.id,
                name: template.name,
                kind: "fixed_package",
                services,
                totalValueInCents: 20000,
                installments: 1,
                validFrom,
                validUntil,
                firstDueDate: validFrom,
              },
            }),
          );
        const first = await purchase("2059-04-01", "2059-04-30");
        expect(first.enrollment).toMatchObject({
          groupId: group.id,
          patientId: created.id,
          status: "active",
        });
        // O plano anterior não encerra a matrícula: o novo segue com a mesma, sem erro.
        const second = await purchase("2059-05-01", "2059-05-31");
        expect(second.enrollment).toMatchObject({
          id: first.enrollment!.id,
          status: "active",
        });
        expect(
          await repository.listPatientPlans(clinicId, created.id),
        ).toHaveLength(2);
        const workspace = await repository.getGroupWorkspace(
          clinicId,
          new Date().toISOString(),
          new Date(Date.now() + 86_400_000).toISOString(),
        );
        expect(
          workspace.enrollments.filter(
            (item) =>
              item.groupId === group.id && item.patientId === created.id,
          ),
        ).toHaveLength(1);
      });

      it("issues a supplier contract and shares the link with the supplier's WhatsApp", async () => {
        const supplier = (await repository.saveSupplier(
          clinicId,
          actorId,
          supplierInputSchema.parse({
            name: "Fornecedor " + randomUUID(),
            kind: "person",
            document: "52998224725",
            whatsapp: "19988887777",
            contractAmountInCents: 50000,
          }),
        ))!;
        const template = await repository.createDocumentTemplate(clinicId, {
          name: "Contrato de fornecedor " + randomUUID(),
          kind: "contract",
          body: "Contrato com {{fornecedor_nome}}, CPF {{fornecedor_documento}}, cliente {{paciente_nome}}.",
        });
        const draft = await repository.createIssuedDocument(clinicId, actorId, {
          templateId: template.id,
          supplierId: supplier.id,
          title: "Contrato do fornecedor",
        });
        expect(draft).toMatchObject({
          supplierId: supplier.id,
          patientName: supplier.name,
          snapshotBody: `Contrato com ${supplier.name}, CPF 529.982.247-25, cliente não informado.`,
        });
        expect(draft).not.toHaveProperty("patientId");
        await repository.updateIssuedDocumentStatus(
          clinicId,
          draft.id,
          "issued",
        );
        const share = await repository.createDocumentSignatureLink(
          clinicId,
          actorId,
          draft.id,
        );
        expect(share).toMatchObject({ patientPhone: "19988887777" });
        expect(
          await repository.openPublicSignatureDocument(share!.token, {}),
        ).toMatchObject({ patientName: supplier.name, status: "pending" });
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === draft.id,
          ),
        ).toMatchObject({ supplierId: supplier.id, status: "issued" });
      });

      // QM15: prontuário sequencial e único; os 3 clientes semente são PAC-00001..00003.
      it("keeps record numbers unique and the seed clients as PAC-00001..00003", async () => {
        const patients = await repository.listPatients(clinicId);
        const numbers = patients.map((item) => item.recordNumber);
        expect(new Set(numbers).size).toBe(numbers.length);
        const byName = new Map(
          patients.map((item) => [item.fullName, item.recordNumber]),
        );
        expect(byName.get("Helena Almeida")).toBe("PAC-00001");
        expect(byName.get("Lucas Ribeiro")).toBe("PAC-00002");
        expect(byName.get("Sônia Barros")).toBe("PAC-00003");
        const created = await patient("Prontuário Sequencial");
        expect(created.recordNumber).toMatch(/^PAC-\d{5,}$/);
        expect(numbers).not.toContain(created.recordNumber);
      });

      it("closes one mixed tab charge, consumes only its linked service and reverses the credit before cancellation", async () => {
        const created = await patient("Comanda integrada");
        const tab = await repository.openPatientTab(clinicId, actorId, {
          patientId: created.id,
        });
        const product = await repository.createProduct(clinicId, actorId, {
          name: "Produto da comanda",
          sku: randomUUID(),
          unit: "un",
          costInCents: 500,
          salePriceInCents: 1000,
          initialStock: 3,
        });
        await repository.addPatientTabItem(clinicId, actorId, tab.id, {
          productId: product.id,
          quantity: 1,
        });
        const scheduled = await repository.createPatientTabAppointment(
          clinicId,
          actorId,
          tab.id,
          appointmentInputSchema.omit({ patientId: true }).parse({
            professionalId,
            roomId,
            serviceId,
            startsAt: "2059-02-02T12:00:00Z",
          }),
        );
        const appointmentId = scheduled.services![0]!.appointmentId;
        await expect(
          atInstant("2059-02-04T12:00:00Z", () =>
            repository.updateAppointmentStatus(
              clinicId,
              appointmentId,
              "completed",
            ),
          ),
        ).rejects.toMatchObject({ code: "NO_SESSION_BALANCE" });
        const closed = await Promise.allSettled([
          repository.closePatientTab(clinicId, actorId, tab.id, {
            settlement: "receivable",
            dueDate: "2059-02-02",
          }),
          repository.closePatientTab(clinicId, actorId, tab.id, {
            settlement: "receivable",
            dueDate: "2059-02-02",
          }),
        ]);
        expect(
          closed.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          closed.filter((result) => result.status === "rejected"),
        ).toHaveLength(1);
        const invoices = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.filter((item) => item.patientId === created.id);
        expect(invoices).toHaveLength(1);
        expect(invoices[0]!.amountInCents).toBe(scheduled.totalInCents);
        expect(invoices[0]!.description).toMatch(
          /^Comanda de \d{2}\/\d{2} · Comanda$/,
        );
        expect(invoices[0]!.description).not.toContain(
          tab.id.slice(0, 8).toUpperCase(),
        );
        const [credit] = await repository.listPatientPlans(
          clinicId,
          created.id,
        );
        expect(credit).toMatchObject({
          sourceTabId: tab.id,
          sourceAppointmentId: appointmentId,
          remainingSessions: 1,
        });
        const other = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            patientId: created.id,
            professionalId,
            roomId,
            serviceId,
            startsAt: "2059-02-03T12:00:00Z",
          }),
        );
        await atInstant("2059-02-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(clinicId, other.id, "completed"),
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]!
            .remainingSessions,
        ).toBe(1);
        await atInstant("2059-02-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointmentId,
            "completed",
          ),
        );
        await atInstant("2059-02-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointmentId,
            "completed",
          ),
        );
        await expect(
          repository.cancelPatientTab(clinicId, actorId, tab.id),
        ).rejects.toMatchObject({ code: "TAB_SERVICE_CORRECTION_REQUIRED" });
        expect(
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === product.id,
          )?.currentStock,
        ).toBe(2);
        await atInstant("2059-02-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointmentId,
            "confirmed",
          ),
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]!
            .remainingSessions,
        ).toBe(1);
        const ledger = await repository.listSessionMovements(
          clinicId,
          credit!.id,
        );
        expect(
          ledger.filter((item) => item.kind === "consumption"),
        ).toHaveLength(1);
        expect(ledger.filter((item) => item.kind === "reversal")).toHaveLength(
          1,
        );
        await repository.cancelPatientTab(clinicId, actorId, tab.id);
        expect(
          (await repository.listSessionMovements(clinicId, credit!.id)).reduce(
            (total, item) => total + item.quantity,
            0,
          ),
        ).toBe(0);
        expect(
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === product.id,
          )?.currentStock,
        ).toBe(3);
        expect(
          await repository.listPatientPlans(randomUUID(), created.id),
        ).toEqual([]);
      });

      it("refuses outcomes and evolutions before start − 15 min and accepts them from then on", async () => {
        const created = await patient("Parity Início");
        await plan(created.id);
        // 10:00 em São Paulo; libera às 09:45.
        const startsAt = "2055-02-07T13:00:00Z";
        const appointment = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            patientId: created.id,
            professionalId,
            roomId,
            serviceId,
            startsAt,
          }),
        );
        const notStarted = {
          code: "APPOINTMENT_NOT_STARTED",
          message: "Disponível a partir de 07/02 às 09:45.",
          statusCode: 409,
        };
        const evolution = {
          appointmentId: appointment.id,
          subjective: "Relato",
          objective: "Exame",
          assessment: "Avaliação",
          plan: "Plano",
        };
        for (const status of ["completed", "no_show"] as const)
          await expect(
            atInstant("2055-02-07T12:44:59Z", () =>
              repository.updateAppointmentStatus(
                clinicId,
                appointment.id,
                status,
              ),
            ),
          ).rejects.toMatchObject(notStarted);
        await expect(
          atInstant("2055-02-07T12:44:59Z", () =>
            repository.saveClinicalRecord(clinicId, actorId, evolution),
          ),
        ).rejects.toMatchObject(notStarted);
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]
            ?.remainingSessions,
        ).toBe(4);
        const done = await atInstant("2055-02-07T12:45:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "completed",
          ),
        );
        expect(done?.status).toBe("completed");
        const record = await atInstant("2055-02-07T12:45:00Z", () =>
          repository.saveClinicalRecord(clinicId, actorId, evolution),
        );
        expect(record.appointmentId).toBe(appointment.id);
      });

      it("pins clinical alerts by severity and hides archived ones", async () => {
        const client = await patient("Alerta");
        const info = await repository.createClinicalAlert(clinicId, actorId, {
          patientId: client.id,
          severity: "info",
          text: "Prefere a sala 2.",
        });
        await repository.createClinicalAlert(clinicId, actorId, {
          patientId: client.id,
          severity: "critical",
          text: "Marcapasso: sem eletroterapia.",
        });
        let workspace = await repository.getClinicalWorkspace(
          clinicId,
          client.id,
          actorId,
        );
        expect(workspace?.alerts.map((alert) => alert.severity)).toEqual([
          "critical",
          "info",
        ]);
        expect(await repository.archiveClinicalAlert(clinicId, info.id)).toBe(
          true,
        );
        expect(await repository.archiveClinicalAlert(clinicId, info.id)).toBe(
          false,
        );
        workspace = await repository.getClinicalWorkspace(
          clinicId,
          client.id,
          actorId,
        );
        expect(workspace?.alerts.map((alert) => alert.text)).toEqual([
          "Marcapasso: sem eletroterapia.",
        ]);
      });

      it("persists and finds a patient without exposing the record to another clinic", async () => {
        const created = await patient("Parity Cliente");
        expect(
          await repository.listPatients(clinicId, created.fullName),
        ).toEqual([expect.objectContaining({ id: created.id })]);
        expect(
          await repository.listPatients(randomUUID(), created.fullName),
        ).toEqual([]);
        expect(
          await repository.updatePatient(
            randomUUID(),
            created.id,
            patientInputSchema.parse({
              cpf: nextTestCpf(),
              fullName: "Alteração indevida",
              phone: "11988887777",
            }),
          ),
        ).toBeNull();
      });

      it("rejects an overlapping appointment without persisting a second record", async () => {
        const created = await patient("Parity Agenda");
        const input = appointmentInputSchema.parse({
          patientId: created.id,
          professionalId,
          roomId,
          serviceId,
          startsAt: "2055-01-03T12:00:00Z",
        });
        await repository.createAppointment(clinicId, input);
        await expect(
          repository.createAppointment(clinicId, {
            ...input,
            startsAt: "2055-01-03T12:15:00Z",
          }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(
          (
            await repository.listAppointments(
              clinicId,
              "2055-01-03T00:00:00Z",
              "2055-01-04T00:00:00Z",
            )
          ).filter((item) => item.patientId === created.id),
        ).toHaveLength(1);
      });

      it("consumes and reverses one session when completion is repeated or reopened", async () => {
        const created = await patient("Parity Sessão");
        const sold = await plan(created.id);
        const appointment = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            patientId: created.id,
            professionalId,
            roomId,
            serviceId,
            startsAt: "2055-01-04T12:00:00Z",
          }),
        );
        await atInstant("2055-01-05T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "completed",
          ),
        );
        await atInstant("2055-01-05T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "completed",
          ),
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]
            ?.remainingSessions,
        ).toBe(3);
        await atInstant("2055-01-05T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "confirmed",
          ),
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]
            ?.remainingSessions,
        ).toBe(4);
        const movements = await repository.listSessionMovements(
          clinicId,
          sold.id,
        );
        expect(
          movements
            .filter((item) => item.appointmentId === appointment.id)
            .map((item) => item.quantity)
            .sort(),
        ).toEqual([-1, 1]);
      });

      it("rejects duplicate payments and reversals while preserving the cash movements", async () => {
        const created = await patient("Parity Pagamento");
        await plan(created.id);
        const receivable = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.find((item) => item.patientId === created.id)!;
        await repository.settleReceivable(
          clinicId,
          actorId,
          receivable.id,
          "pix",
        );
        await expect(
          repository.settleReceivable(clinicId, actorId, receivable.id, "pix"),
        ).rejects.toMatchObject({ code: "RECEIVABLE_NOT_OPEN" });
        await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          receivable.id,
        );
        await expect(
          repository.reverseReceivablePayment(clinicId, actorId, receivable.id),
        ).rejects.toMatchObject({ code: "RECEIVABLE_NOT_PAID" });
        const movements = (
          await repository.getDailyCash(clinicId, saoPauloToday())
        ).movements.filter((item) => item.counterpart === created.fullName);
        expect(movements).toHaveLength(2);
        expect(
          movements.reduce((sum, item) => sum + item.amountInCents, 0),
        ).toBe(0);
      });

      it("keeps external proof out of financial balances and rolls back rejected references", async () => {
        const client = await patient("Parity External");
        const invoice = await repository.createManualReceivable(
          clinicId,
          actorId,
          {
            patientId: client.id,
            description: "Receita da paridade",
            amountInCents: 4500,
            dueDate: "2055-01-10",
            competence: "2055-01",
          },
        );
        const proof = Buffer.from("%PDF-1.4\nParity external proof\n%%EOF"),
          input = externalOperationInputSchema.parse({
            kind: "partner",
            counterpart: "Parceiro de paridade",
            reference: randomUUID(),
            occurredOn: "2055-01-10",
            receivableId: invoice.id,
            fileName: "proof.pdf",
            mimeType: "application/pdf",
            sizeInBytes: proof.length,
            contentBase64: proof.toString("base64"),
          });
        const before = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.find((item) => item.id === invoice.id);
        const attempts = await Promise.allSettled([
          repository.createExternalOperation(clinicId, actorId, input),
          repository.createExternalOperation(clinicId, actorId, input),
        ]);
        expect(
          attempts.filter((item) => item.status === "fulfilled"),
        ).toHaveLength(1);
        const entries = await repository.listExternalOperations(
          clinicId,
          client.id,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).not.toHaveProperty("contentBase64");
        expect(
          await repository.getExternalOperationContent(
            clinicId,
            actorId,
            entries[0]!.id,
          ),
        ).toMatchObject({
          contentBase64: input.contentBase64,
          sha256: entries[0]!.sha256,
        });
        expect(
          (await repository.getFinancialSummary(clinicId)).receivables.find(
            (item) => item.id === invoice.id,
          ),
        ).toEqual(before);
        const other = await patient("Parity External Other");
        await expect(
          repository.createExternalOperation(clinicId, actorId, {
            ...input,
            reference: randomUUID(),
            patientId: other.id,
          }),
        ).rejects.toMatchObject({ code: "EXTERNAL_OPERATION_RECEIVABLE" });
        expect(
          await repository.listExternalOperations(clinicId, other.id),
        ).toEqual([]);
        expect(
          await repository.getExternalOperationContent(
            randomUUID(),
            actorId,
            entries[0]!.id,
          ),
        ).toBeNull();
      });
      it("shares manual birthday work and returns completion authors after reload", async () => {
        const client = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: "Parity Birthday " + randomUUID(),
            phone: "11988887777",
            birthDate: "1990-01-10",
          }),
        );
        await repository.generateReminders(clinicId, "2055-01-10", {
          appointments: false,
          payments: false,
          birthdays: true,
        });
        const messages = (
          await repository.getCommunicationCenter(clinicId)
        ).messages.filter((item) => item.patientId === client.id);
        expect(messages).toHaveLength(1);
        expect(messages[0]!.kind).toBe("birthday_reminder");
        await repository.generateReminders(clinicId, "2055-01-10", {
          appointments: false,
          payments: false,
          birthdays: true,
        });
        expect(
          (await repository.getCommunicationCenter(clinicId)).messages.filter(
            (item) => item.patientId === client.id,
          ),
        ).toHaveLength(1);
        await repository.completeManualMessage(
          clinicId,
          actorId,
          messages[0]!.id,
          "sent",
        );
        expect(
          (await repository.getCommunicationCenter(clinicId)).messages.find(
            (item) => item.id === messages[0]!.id,
          ),
        ).toMatchObject({ manualCompletion: { actorId, status: "sent" } });
      });
      it("preserves paid commissions and reconciles cash recoveries with immutable adjustments", async () => {
        const client = await patient("Parity Commission Reconciliation"),
          professional = await repository.createProfessional(
            clinicId,
            professionalInputSchema.parse({
              fullName: "Paridade Comissão " + randomUUID(),
              crefito: "PARITY-12345",
              specialty: "Pilates",
              color: "#8b5cf6",
            }),
          ),
          room = await repository.createRoom(clinicId, {
            name: "Paridade comissão " + randomUUID().slice(0, 8),
            capacity: 1,
          });
        await repository.createCommissionRule(clinicId, {
          professionalId: professional.id,
          serviceId,
          kind: "fixed",
          percentage: 0,
          fixedAmountInCents: 1500,
          effectiveFrom: "2057-01-01",
        });
        const appointment = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            patientId: client.id,
            professionalId: professional.id,
            roomId: room.id,
            serviceId,
            startsAt: "2057-04-13T15:00:00Z",
            visitType: "trial",
          }),
        );
        await atInstant("2057-04-14T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "completed",
          ),
        );
        const generated = await repository.generateCommissions(
            clinicId,
            "2057-04",
          ),
          commission = generated.find(
            (entry) => entry.appointmentId === appointment.id,
          )!;
        expect(commission.amountInCents).toBe(1500);
        await repository.settleCommission(clinicId, actorId, commission.id);
        const frozen = structuredClone(
            (await repository.getFinancialWorkspace(clinicId)).commissions.find(
              (entry) => entry.id === commission.id,
            ),
          ),
          beforeCash = await repository.getDailyCash(clinicId, saoPauloToday());
        await atInstant("2057-04-14T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "confirmed",
          ),
        );
        const preview = await repository.getCommissionReconciliationPreview(
            clinicId,
            commission.id,
          ),
          input = {
            idempotencyKey: randomUUID(),
            expectedDigest: preview.digest,
            reason: "Origem corrigida após pagamento",
          };
        const [first, repeat] = await Promise.all([
          repository.reconcileCommission(
            clinicId,
            actorId,
            commission.id,
            input,
          ),
          repository.reconcileCommission(
            clinicId,
            actorId,
            commission.id,
            input,
          ),
        ]);
        expect(first.id).toBe(repeat.id);
        expect(first.adjustments).toHaveLength(1);
        expect(first.adjustments[0]!.amountInCents).toBe(-1500);
        const payment = await repository.settleCommissionAccount(
          clinicId,
          actorId,
          commission.id,
          professional.id,
          -1500,
        );
        expect(
          (await repository.getDailyCash(clinicId, saoPauloToday()))
            .totalOutflowInCents,
        ).toBe(beforeCash.totalOutflowInCents - 1500);
        expect(
          (await repository.getFinancialWorkspace(clinicId)).commissions.find(
            (entry) => entry.id === commission.id,
          ),
        ).toEqual(frozen);
        expect(
          (
            await repository.getCommissionReconciliationPreview(
              clinicId,
              commission.id,
            )
          ).reconciliations,
        ).toHaveLength(1);
        await repository.reverseCommissionAccountPayment(
          clinicId,
          actorId,
          payment.id,
        );
        expect(
          (await repository.getDailyCash(clinicId, saoPauloToday()))
            .totalOutflowInCents,
        ).toBe(beforeCash.totalOutflowInCents);
        await expect(
          repository.reverseCommissionAccountPayment(
            clinicId,
            actorId,
            payment.id,
          ),
        ).rejects.toMatchObject({
          code: "COMMISSION_ACCOUNT_PAYMENT_REVERSED",
        });
      });
      it("rolls back a guided registration when the subsequent plan cannot be created", async () => {
        const name = `Parity Rollback ${randomUUID()}`;
        const input = guidedPatientInputSchema.parse({
          next: "plan",
          patient: { cpf: nextTestCpf(), fullName: name, phone: "11988887777" },
          plan: {
            planTemplateId: randomUUID(),
            name: "Plano inexistente",
            kind: "fixed_package",
            services: [
              { serviceId, totalSessions: 4, totalValueInCents: 20000 },
            ],
            totalValueInCents: 20000,
            installments: 1,
            validFrom: "2055-01-01",
            firstDueDate: "2055-01-01",
          },
        });
        await expect(
          repository.createPatientWithNextStep(clinicId, actorId, input),
        ).rejects.toBeInstanceOf(Error);
        expect(await repository.listPatients(clinicId, name)).toEqual([]);
      });
      it("keeps WhatsApp campaign snapshots and progress", async () => {
        const png =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const template = await repository.createMessageTemplate(
          clinicId,
          actorId,
          {
            title: "Paridade",
            body: "Olá, {{nome}}",
            images: [
              {
                fileName: "a.png",
                mimeType: "image/png",
                sizeBytes: 68,
                dataUrl: png,
              },
            ],
          },
        );
        const client = await patient("Campanha");
        const campaign = await repository.createWhatsappCampaign(
          clinicId,
          actorId,
          {
            templateId: template.id,
            name: "Paridade",
            recipients: [
              {
                patientId: client.id,
                patientName: client.fullName,
                phone: "11988887777",
                message: "Olá, Campanha",
              },
            ],
          },
        );
        const updated = await repository.updateMessageTemplate(
          clinicId,
          actorId,
          template.id,
          { title: "Nova", body: "Outro", images: [] },
        );
        expect(updated?.images).toEqual([]);
        const detail = await repository.getWhatsappCampaign(
          clinicId,
          campaign.id,
        );
        expect(detail).toMatchObject({
          templateTitle: "Paridade",
          body: "Olá, {{nome}}",
          total: 1,
          sent: 0,
        });
        expect(detail?.images.map((image) => image.fileName)).toEqual([
          "a.png",
        ]);
        expect(
          (
            await repository.getMessageTemplateImage(
              clinicId,
              detail!.images[0]!.id,
            )
          )?.dataUrl,
        ).toBe(png);
        const result = await repository.setWhatsappCampaignRecipientStatus(
          clinicId,
          actorId,
          campaign.id,
          campaign.recipients[0]!.id,
          "sent",
        );
        expect(result?.recipient.status).toBe("sent");
        expect(result?.recipient.handledByName).toBeTruthy();
        expect(result?.campaign).toMatchObject({ sent: 1 });
        expect(result?.campaign.completedAt).toBeTruthy();
        await repository.setMessageTemplateArchived(
          clinicId,
          actorId,
          template.id,
          true,
        );
        await expect(
          repository.createWhatsappCampaign(clinicId, actorId, {
            templateId: template.id,
            name: "Arquivada",
            recipients: campaign.recipients,
          }),
        ).rejects.toMatchObject({ code: "MESSAGE_TEMPLATE_NOT_FOUND" });
      });
    },
  );
}
