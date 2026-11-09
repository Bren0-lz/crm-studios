/**
 * Eventos internos de domínio, publicados **depois do commit** da operação que os gerou.
 * Sem fila nesta versão: o publicador chama os assinantes em seguida, e a falha de um
 * assinante não desfaz a operação de origem (já gravada) nem impede os demais.
 */
export interface ReceiptSignedEvent {
  type: "receipt.signed";
  clinicId: string;
  receiptId: string;
  receivableId: string;
  patientId: string;
  amountInCents: number;
  /** Instante da baixa que gerou o recibo (pode ser anterior à assinatura). */
  paidAt: string;
  signedAt: string;
}

/** Atendimento marcado na agenda: data, profissional e cliente (ou lead) no momento da criação. */
export interface CreatedAppointmentSummary {
  id: string;
  /** Nome do cliente ou, na aula experimental, do lead. */
  patientName: string;
  lead: boolean;
  serviceName: string;
  professionalName: string;
  startsAt: string;
}

/**
 * Atendimentos criados por **uma** operação (avulso, recorrência, sessões de um plano, cadastro
 * guiado ou aula experimental de lead): a recorrência sai num evento só, com todas as sessões.
 */
export interface AppointmentsCreatedEvent {
  type: "appointments.created";
  clinicId: string;
  /** Quem marcou (usuário autenticado). */
  actorUserId: string;
  appointments: CreatedAppointmentSummary[];
}

/** Cadastro de cliente criado (formulário, cadastro guiado ou conversão de lead). */
export interface PatientCreatedEvent {
  type: "patient.created";
  clinicId: string;
  actorUserId: string;
  patientId: string;
  fullName: string;
  origin: "form" | "guided" | "lead";
}

/** Importação em lote: um evento com o total, não um por cliente. */
export interface PatientsImportedEvent {
  type: "patients.imported";
  clinicId: string;
  actorUserId: string;
  created: number;
}

export type DomainEvent =
  | ReceiptSignedEvent
  | AppointmentsCreatedEvent
  | PatientCreatedEvent
  | PatientsImportedEvent;

export type DomainEventType = DomainEvent["type"];

export const domainEventTypes = [
  "receipt.signed",
  "appointments.created",
  "patient.created",
  "patients.imported",
] as const satisfies readonly DomainEventType[];

export type DomainEventHandler<T extends DomainEventType = DomainEventType> = (
  event: Extract<DomainEvent, { type: T }>,
) => void | Promise<void>;

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Publicador em memória do processo: entrega a cada assinante do tipo do evento. */
export function createDomainEventPublisher(
  onHandlerError: (error: unknown, event: DomainEvent) => void = () => {},
) {
  const handlers = new Map<DomainEventType, DomainEventHandler[]>();
  return {
    subscribe<T extends DomainEventType>(
      type: T,
      handler: DomainEventHandler<T>,
    ) {
      // Só recebe eventos do próprio tipo (ver `publish`).
      const stored = handler as unknown as DomainEventHandler;
      handlers.set(type, [...(handlers.get(type) ?? []), stored]);
      return () =>
        handlers.set(
          type,
          (handlers.get(type) ?? []).filter((item) => item !== stored),
        );
    },
    async publish(event: DomainEvent) {
      for (const handler of handlers.get(event.type) ?? []) {
        try {
          await handler(event);
        } catch (error) {
          onHandlerError(error, event);
        }
      }
    },
  } satisfies DomainEventPublisher & { subscribe: unknown };
}

/** Resumo dos atendimentos para `appointments.created`. */
export function createdAppointmentSummaries(
  appointments: {
    id: string;
    patientName: string;
    leadId?: string | undefined;
    serviceName: string;
    professionalName: string;
    startsAt: string;
  }[],
): CreatedAppointmentSummary[] {
  return appointments.map((item) => ({
    id: item.id,
    patientName: item.patientName,
    lead: Boolean(item.leadId),
    serviceName: item.serviceName,
    professionalName: item.professionalName,
    startsAt: item.startsAt,
  }));
}

/** Publica `appointments.created` (nada quando a operação não criou atendimento). */
export async function publishAppointmentsCreated(
  events: DomainEventPublisher,
  clinicId: string,
  actorUserId: string,
  appointments: Parameters<typeof createdAppointmentSummaries>[0],
) {
  if (appointments.length === 0) return;
  await events.publish({
    type: "appointments.created",
    clinicId,
    actorUserId,
    appointments: createdAppointmentSummaries(appointments),
  });
}
