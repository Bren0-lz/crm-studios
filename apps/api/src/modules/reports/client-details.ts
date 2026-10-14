import {
  type ClientDetailsReport,
  type ClientDetailsColumn,
  clientDetailsColumns,
  type PatientProfileFilter,
  matchesPatientProfile,
  matchesPatientSegment,
  type Patient,
  patientProfileValueLabels,
} from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";
import { clientSegments } from "../patients/client-segments.js";
import { clinicDateOf } from "../finance/daily-cash.js";
export async function buildClientDetails(
  repository: ClinicRepository,
  clinicId: string,
  actorId: string,
  input: PatientProfileFilter & {
    from: string;
    to: string;
    search?: string | undefined;
    status?: Patient["status"] | undefined;
    columns?: ClientDetailsColumn[] | undefined;
  },
  financial: boolean,
  clinical: boolean,
  exporting = false,
): Promise<ClientDetailsReport> {
  const settings = await repository.getClinicSettings(clinicId),
    timezone = settings?.timezone ?? "America/Sao_Paulo",
    from = new Date(Date.parse(input.from) - 86400000).toISOString(),
    to = new Date(Date.parse(input.to) + 2 * 86400000).toISOString(),
    inPeriod = (date: string) => {
      const day = clinicDateOf(new Date(date), timezone);
      return day >= input.from && day <= input.to;
    };
  const [
    patients,
    summary,
    appointments,
    groups,
    inventory,
    resources,
    sources,
  ] = await Promise.all([
    repository.listPatients(clinicId, input.search),
    clientSegments(repository, clinicId, financial),
    repository.listAppointments(clinicId, from, to),
    repository.getGroupWorkspace(clinicId, from, to),
    repository.getInventoryWorkspace(clinicId),
    clinical
      ? repository.listClinicalResources(
          clinicId,
          actorId,
          undefined,
          exporting ? "export" : "read",
        )
      : Promise.resolve([]),
    clinical ? repository.listClinicalSources(clinicId) : Promise.resolve([]),
  ]);
  const canonicalPatients = new Map(
    await Promise.all(
      [
        ...new Set(
          resources
            .filter((item) => item.patientId)
            .map((item) => item.patientId!),
        ),
      ].map(
        async (id) =>
          [id, (await repository.getPatient(clinicId, id))?.id ?? id] as const,
      ),
    ),
  );
  const availableColumns = clientDetailsColumns
      .filter(
        (column) =>
          financial ||
          !["pendingReceivables", "overdueReceivables"].includes(column),
      )
      .filter((column) => clinical || column !== "equipment"),
    columns = input.columns?.filter((column) =>
      availableColumns.includes(column),
    ) ?? [...availableColumns];
  const rows = patients
    .filter(
      (patient) =>
        (!input.status || patient.status === input.status) &&
        matchesPatientProfile(patient, input) &&
        matchesPatientSegment(
          summary.find((item) => item.patientId === patient.id),
          input.segment,
        ),
    )
    .map((patient) => {
      const segment = summary.find((item) => item.patientId === patient.id)!;
      const individual = appointments.filter(
          (item) => item.patientId === patient.id && inPeriod(item.startsAt),
        ),
        collective = groups.attendance.filter(
          (item) =>
            item.patientId === patient.id &&
            item.outcome !== "cancelled" &&
            item.outcome !== "scheduled" &&
            inPeriod(
              groups.sessions.find((session) => session.id === item.sessionId)
                ?.startsAt ?? "1970-01-01T00:00:00Z",
            ),
        );
      const attendanceCount =
          individual.filter((item) => item.status === "completed").length +
          collective.filter(
            (item) => item.status === "present" || item.outcome === "present",
          ).length,
        absenceCount =
          individual.filter((item) =>
            ["no_show", "excused_absence"].includes(item.status),
          ).length +
          collective.filter(
            (item) =>
              ["absent", "excused_absence"].includes(item.status) ||
              ["absent", "excused_absence"].includes(item.outcome ?? ""),
          ).length;
      const equipmentIds = resources.flatMap((item) => {
        if (item.data.kind === "training_execution") {
          if (
            canonicalPatients.get(item.data.patientId) !== patient.id ||
            !inPeriod(item.data.startedAt)
          )
            return [];
          const trainingId = item.data.trainingId;
          const training = resources.find(
            (entry) => entry.id === trainingId,
          )?.data;
          return training?.kind === "training"
            ? training.exercises.flatMap((entry) => {
                const exercise = resources.find(
                  (resource) => resource.id === entry.exerciseId,
                )?.data;
                return exercise?.kind === "exercise" && exercise.equipmentId
                  ? [exercise.equipmentId]
                  : [];
              })
            : [];
        }
        if (item.data.kind !== "evolution") return [];
        const evolution = item.data,
          origin = sources.find(
            (entry) =>
              entry.id === evolution.sourceId &&
              entry.type === evolution.sourceType,
          );
        const originDate = item.originStartsAt ?? origin?.startsAt;
        if (
          canonicalPatients.get(evolution.patientId) !== patient.id ||
          !originDate ||
          !inPeriod(originDate)
        )
          return [];
        return [
          ...evolution.equipmentIds,
          ...evolution.exerciseIds.flatMap((id) => {
            const exercise = resources.find((entry) => entry.id === id)?.data;
            return exercise?.kind === "exercise" && exercise.equipmentId
              ? [exercise.equipmentId]
              : [];
          }),
        ];
      });
      const equipment = [
          ...new Set(
            equipmentIds
              .map((id) => resources.find((item) => item.id === id)?.name)
              .filter(Boolean),
          ),
        ].join(", "),
        items = inventory.tabs
          .filter(
            (tab) =>
              tab.patientId === patient.id &&
              tab.status === "closed" &&
              tab.closedAt &&
              inPeriod(tab.closedAt),
          )
          .flatMap((tab) => tab.items);
      const values: Partial<
        Record<ClientDetailsColumn, string | number | boolean>
      > = {
        ...segment,
        attendanceCount,
        absenceCount,
        attendanceRate:
          attendanceCount + absenceCount
            ? Math.round(
                (100 * attendanceCount) / (attendanceCount + absenceCount),
              )
            : 0,
        equipment,
        products: [...new Set(items.map((item) => item.productName))].join(
          ", ",
        ),
        productQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      };
      for (const column of clientDetailsColumns) {
        if (column in patient) {
          const value = patient[column as keyof Patient];
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          )
            values[column] = value;
          else if (Array.isArray(value)) values[column] = value.join(", ");
        }
      }
      if (patient.gender)
        values.gender = patientProfileValueLabels[patient.gender];
      if (patient.clientType)
        values.clientType = patientProfileValueLabels[patient.clientType];
      values.status = patient.status === "active" ? "Ativo" : "Inativo";
      return {
        id: patient.id,
        values: Object.fromEntries(
          columns.map((column) => [column, values[column] ?? ""]),
        ),
      };
    });
  return { from: input.from, to: input.to, columns, availableColumns, rows };
}
