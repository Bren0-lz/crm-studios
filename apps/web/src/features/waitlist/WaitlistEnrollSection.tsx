import {
  describeGroupSchedule,
  type GroupClass,
  type WaitlistEntry,
  waitlistDesiredGroupName,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { GroupDetails } from "../../shared/components/GroupDetails";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  groupOperationRange,
  groupVacancyLabel,
} from "../../shared/lib/formatting";

/**
 * Matrícula pela Lista de espera (TW3): só turmas ativas do serviço aguardado e com vaga. A turma
 * desejada (guardada nas observações) já vem escolhida quando ainda tem vaga.
 */
export function WaitlistEnrollSection({
  entry,
  disabled,
  opening,
  onEnroll,
}: {
  entry: WaitlistEntry;
  disabled: boolean;
  /** Carregando o cliente para abrir a contratação. */
  opening: boolean;
  onEnroll: (group: GroupClass) => void;
}) {
  const [groups, setGroups] = useState<GroupClass[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [groupId, setGroupId] = useState("");
  useEffect(() => {
    let active = true;
    const dates = groupOperationRange();
    api
      .groupWorkspace(dates.from, dates.to)
      .then((data) => {
        if (!active) return;
        const open = data.groups.filter(
          (group) =>
            group.active &&
            group.serviceId === entry.serviceId &&
            group.activeEnrollments < group.capacity,
        );
        setGroups(open);
        const desired = waitlistDesiredGroupName(entry.notes);
        setGroupId(
          (open.find((group) => group.name === desired) ?? open[0])?.id ?? "",
        );
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [entry.serviceId, entry.notes, attempt]);
  const selected = groups?.find((group) => group.id === groupId);
  return (
    <fieldset className="form-fieldset waitlist-enroll">
      <legend>Matricular em turma</legend>
      {error ? (
        <p className="form-error" role="alert">
          {`Não foi possível carregar as turmas: ${error}`}{" "}
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => {
              setError("");
              setAttempt((current) => current + 1);
            }}
          >
            Tentar carregar turmas
          </button>
        </p>
      ) : groups === null ? (
        <LoadingBlock />
      ) : groups.length === 0 ? (
        <p className="field-hint">
          {`Nenhuma turma de ${entry.itemName} com vaga no momento.`}
        </p>
      ) : (
        <>
          <label>
            Turma com vaga
            <select
              value={groupId}
              disabled={disabled}
              onChange={(event) => setGroupId(event.target.value)}
            >
              {groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {`${group.name} — ${describeGroupSchedule(group.weeklySlots ?? [])} · ${group.professionalName} · ${groupVacancyLabel(group)}`}
                </option>
              ))}
            </select>
          </label>
          {selected && <GroupDetails group={selected} />}
          <p className="field-hint">
            Em seguida, registre o plano com a forma de pagamento e o contrato e
            envie o link de assinatura ao cliente.
          </p>
          <button
            type="button"
            className="secondary-button waitlist-notify"
            disabled={disabled || !selected || opening}
            onClick={() => selected && onEnroll(selected)}
          >
            {opening ? "Abrindo…" : "Matricular e configurar pagamento"}
          </button>
        </>
      )}
    </fieldset>
  );
}
