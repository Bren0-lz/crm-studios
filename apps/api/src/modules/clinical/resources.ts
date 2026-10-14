import {
  type ClinicalResource,
  type ClinicalResourceInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import {
  inspectClinicalAttachment,
  validateClinicalAnswers,
} from "./clinical-integrity.js";

export interface ClinicalResourceReferences {
  samePatient: (a: string, b: string) => Promise<boolean>;
  patient: (id: string) => Promise<boolean>;
  professional: (id: string) => Promise<boolean>;
  resource: (id: string) => Promise<ClinicalResource | undefined>;
  catalog: (id: string, kind: string) => Promise<boolean>;
  source: (
    type: "appointment" | "group_attendance",
    id: string,
  ) => Promise<{ patientId: string; professionalId: string } | undefined>;
  executions: (trainingId: string) => Promise<number>;
}
export async function validateClinicalResource(
  input: ClinicalResourceInput,
  refs: ClinicalResourceReferences,
  previous?: ClinicalResource,
) {
  if (previous && previous.kind !== input.kind)
    throw new DomainError(
      "CLINICAL_RESOURCE_KIND",
      "O tipo do registro não pode ser alterado.",
      409,
    );
  if (
    previous &&
    "patientId" in input &&
    previous.patientId !== input.patientId
  )
    throw new DomainError(
      "CLINICAL_CONTEXT_CHANGED",
      "Crie uma cópia para vincular o registro a outro cliente.",
      409,
    );
  if (
    previous?.data.kind === "evolution" &&
    input.kind === "evolution" &&
    (previous.data.sourceId !== input.sourceId ||
      previous.data.sourceType !== input.sourceType)
  )
    throw new DomainError(
      "CLINICAL_CONTEXT_CHANGED",
      "O atendimento de origem não pode ser alterado.",
      409,
    );
  if (
    previous?.data.kind === "training_execution" &&
    input.kind === "training_execution" &&
    previous.data.trainingId !== input.trainingId
  )
    throw new DomainError(
      "CLINICAL_CONTEXT_CHANGED",
      "O treino da execução não pode ser alterado.",
      409,
    );
  if (previous?.status === "finalized")
    throw new DomainError(
      "CLINICAL_RECORD_FINALIZED",
      "O registro finalizado não pode ser alterado.",
      409,
    );
  if ("patientId" in input && !(await refs.patient(input.patientId)))
    throw new DomainError("PATIENT_NOT_FOUND", "Cliente não encontrado.", 404);
  if (
    "professionalId" in input &&
    !(
      previous &&
      "professionalId" in previous.data &&
      previous.data.professionalId === input.professionalId
    ) &&
    !(await refs.professional(input.professionalId))
  )
    throw new DomainError(
      "PROFESSIONAL_NOT_FOUND",
      "Profissional não encontrado.",
      404,
    );
  if ("image" in input && input.image) {
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(input.image)!;
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.length > 5 * 1024 * 1024)
      throw new DomainError(
        "CLINICAL_ATTACHMENT_TOO_LARGE",
        "A imagem pode ter até 5 MB.",
        413,
      );
    inspectClinicalAttachment({
      patientId: "00000000-0000-4000-8000-000000000000",
      fileName: "imagem",
      mimeType: match[1] as "image/png" | "image/jpeg",
      sizeInBytes: bytes.length,
      contentBase64: match[2]!,
    });
  }
  async function resource(id: string, kind: ClinicalResourceInput["kind"]) {
    const item = await refs.resource(id);
    if (!item || item.kind !== kind)
      throw new DomainError(
        "CLINICAL_RESOURCE_NOT_FOUND",
        "Cadastro clínico não encontrado nesta clínica.",
        404,
      );
    const historical = previous?.data;
    const historicIds = historical
      ? historical.kind === "exercise"
        ? [historical.equipmentId]
        : historical.kind === "evolution"
          ? [...historical.equipmentIds, ...historical.exerciseIds]
          : historical.kind === "training"
            ? historical.exercises.map((entry) => entry.exerciseId)
            : []
      : [];
    if (item.status === "inactive" && !historicIds.includes(id))
      throw new DomainError(
        "CLINICAL_RESOURCE_INACTIVE",
        "Selecione um cadastro clínico ativo para um novo vínculo.",
        409,
      );
    return item;
  }
  if (input.kind === "exercise") {
    if (input.equipmentId) await resource(input.equipmentId, "equipment");
    if (
      input.muscleGroupId &&
      !(await refs.catalog(input.muscleGroupId, "muscle_group"))
    )
      throw new DomainError(
        "CLINICAL_RESOURCE_NOT_FOUND",
        "Grupo muscular não encontrado.",
        404,
      );
  }
  if (input.kind === "evolution_template") {
    if (
      new Set(input.fields.map((field) => field.key)).size !==
      input.fields.length
    )
      throw new DomainError(
        "ASSESSMENT_FIELD_DUPLICATE",
        "Não repita os campos do modelo.",
        400,
      );
    if (
      input.status === "published" &&
      ((input.format === "questionnaire" &&
        !input.fields.some((field) => field.type !== "section")) ||
        (input.format === "text" && !input.body.trim()) ||
        (input.format === "soap" &&
          !input.body.trim() &&
          !Object.values(input.soap ?? {}).some((value) => value.trim())))
    )
      throw new DomainError(
        "CLINICAL_TEMPLATE_EMPTY",
        "Preencha o conteúdo antes de publicar o modelo.",
        400,
      );
    if (
      input.fields.some(
        (field) =>
          ["select", "multiselect"].includes(field.type) &&
          (!field.options?.length ||
            new Set(field.options).size !== field.options.length),
      )
    )
      throw new DomainError(
        "ASSESSMENT_INVALID_OPTIONS",
        "Informe opções únicas para os campos de seleção.",
        400,
      );
  }
  let templateSnapshot: ClinicalResource["templateSnapshot"];
  if (input.kind === "evolution") {
    const historicalProfessional =
      previous?.data.kind === "evolution" &&
      previous.data.professionalId === input.professionalId;
    const source = historicalProfessional
      ? { patientId: input.patientId, professionalId: input.professionalId }
      : await refs.source(input.sourceType, input.sourceId);
    if (
      !source ||
      !(await refs.samePatient(source.patientId, input.patientId)) ||
      source.professionalId !== input.professionalId
    )
      throw new DomainError(
        "CLINICAL_CONTEXT_NOT_FOUND",
        "O atendimento, cliente e profissional não correspondem.",
        400,
      );
    if (input.templateId) {
      const template = await resource(input.templateId, "evolution_template");
      if (
        template.data.kind !== "evolution_template" ||
        template.status !== "published" ||
        template.data.format !== input.format
      )
        throw new DomainError(
          "CLINICAL_TEMPLATE_NOT_PUBLISHED",
          "Selecione um modelo publicado deste formato.",
          400,
        );
      templateSnapshot = {
        name: template.name,
        version: template.version,
        fields: template.data.fields,
      };
    }
    if (input.format === "questionnaire") {
      if (!templateSnapshot)
        throw new DomainError(
          "CLINICAL_TEMPLATE_REQUIRED",
          "Selecione um modelo de questionário.",
          400,
        );
      validateClinicalAnswers(templateSnapshot.fields, input.values);
    }
    for (const id of input.equipmentIds) await resource(id, "equipment");
    for (const id of input.exerciseIds) await resource(id, "exercise");
  }
  if (input.kind === "training") {
    if (input.validUntil && input.validUntil < input.validFrom)
      throw new DomainError(
        "TRAINING_INVALID_PERIOD",
        "A data final deve ser posterior à inicial.",
        400,
      );
    if (
      new Set(input.exercises.map((item) => item.exerciseId)).size !==
      input.exercises.length
    )
      throw new DomainError(
        "TRAINING_DUPLICATE_EXERCISE",
        "Não repita exercícios no treino.",
        400,
      );
    for (const entry of input.exercises)
      await resource(entry.exerciseId, "exercise");
  }
  if (input.kind === "training_execution") {
    const training = await resource(input.trainingId, "training");
    if (
      training.data.kind !== "training" ||
      !(await refs.samePatient(training.data.patientId, input.patientId))
    )
      throw new DomainError(
        "TRAINING_CONTEXT_NOT_FOUND",
        "O treino não pertence ao cliente.",
        400,
      );
    const day = input.startedAt.slice(0, 10);
    if (
      day < training.data.validFrom ||
      (training.data.validUntil && day > training.data.validUntil)
    )
      throw new DomainError(
        "TRAINING_OUTSIDE_PERIOD",
        "A execução está fora da vigência do treino.",
        400,
      );
    if (input.endedAt && input.endedAt < input.startedAt)
      throw new DomainError(
        "TRAINING_INVALID_PERIOD",
        "A conclusão deve ser posterior ao início.",
        400,
      );
    if (
      !previous &&
      training.data.sessionLimit &&
      (await refs.executions(training.id)) >= training.data.sessionLimit
    )
      throw new DomainError(
        "TRAINING_SESSION_LIMIT",
        "O limite de execuções deste treino foi atingido.",
        409,
      );
  }
  return templateSnapshot;
}
