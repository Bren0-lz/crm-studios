import { autoFinalizationCutoff, type Appointment } from "@crm/contracts";
import { DomainError, type ClinicRepository } from "../../repository.js";

/**
 * "Realizado" pedido para atendimento que a rotina automática já finalizou (RE8): sem baixar
 * saldo de novo nem apagar o selo; o atendimento atual vai em `details` para a tela recarregar.
 */
export function appointmentAlreadyAutoCompletedError(appointment: Appointment) {
  return new DomainError(
    "APPOINTMENT_ALREADY_AUTO_COMPLETED",
    "Este atendimento já foi finalizado automaticamente.",
    409,
    { appointment },
  );
}

/** Intervalo mínimo entre varreduras da mesma clínica disparadas pelas requisições. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Finalização automática sem agendador: cada requisição autenticada dispara uma varredura da
 * clínica (no máximo uma por minuto por instância); as telas de finalização forçam a varredura
 * para mostrar o estado exato. Varreduras simultâneas da mesma clínica compartilham a execução.
 */
export function createAutoFinalizer(repository: ClinicRepository) {
  const lastRun = new Map<string, number>();
  const running = new Map<string, Promise<number>>();

  async function sweep(clinicId: string) {
    const settings = await repository.getAutoFinalizationSettings(clinicId);
    if (!settings.enabled) return 0;
    const now = new Date();
    return repository.autoFinalizeAppointments(
      clinicId,
      autoFinalizationCutoff(now, settings.delayMinutes).toISOString(),
      now.toISOString(),
    );
  }

  return {
    /** Finaliza o que já venceu; `force` ignora o intervalo mínimo. Devolve quantos finalizou. */
    run(clinicId: string, { force = false } = {}): Promise<number> {
      const inFlight = running.get(clinicId);
      if (inFlight) return inFlight;
      if (
        !force &&
        Date.now() - (lastRun.get(clinicId) ?? 0) < SWEEP_INTERVAL_MS
      )
        return Promise.resolve(0);
      lastRun.set(clinicId, Date.now());
      const job = sweep(clinicId).finally(() => running.delete(clinicId));
      running.set(clinicId, job);
      return job;
    },
  };
}

export type AutoFinalizer = ReturnType<typeof createAutoFinalizer>;
