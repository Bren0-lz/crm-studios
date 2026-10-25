import { autoFinalizationCutoff } from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";

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
