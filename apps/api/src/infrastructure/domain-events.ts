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

export type DomainEvent = ReceiptSignedEvent;

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Publicador em memória do processo: entrega a cada assinante do tipo do evento. */
export function createDomainEventPublisher(
  onHandlerError: (error: unknown, event: DomainEvent) => void = () => {},
) {
  const handlers = new Map<DomainEvent["type"], DomainEventHandler[]>();
  return {
    subscribe(type: DomainEvent["type"], handler: DomainEventHandler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return () =>
        handlers.set(
          type,
          (handlers.get(type) ?? []).filter((item) => item !== handler),
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
