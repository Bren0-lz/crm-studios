import { compatiblePlanGroups } from "../lib/plan-groups";
import type { GroupChoices } from "../workflows/types";
import { GroupDetails } from "./GroupDetails";
import { LoadingBlock } from "./LoadingBlock";

export function PlanGroupPicker({
  groups,
  services,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  groups: GroupChoices;
  services: { serviceId: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Plano de aulas em grupo: a turma é obrigatória quando há turma compatível. */
  required?: boolean;
}) {
  const choices = compatiblePlanGroups(groups.items, services);
  const mandatory = required && choices.length > 0;
  const selected = choices.find((group) => group.id === value);
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return (
    <fieldset className="form-fieldset span-2">
      <legend>{mandatory ? "Turma" : "Turma opcional"}</legend>
      <label>
        Turma
        <select
          required={mandatory}
          value={value}
          disabled={disabled || !choices.length || Boolean(groups.error)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">
            {mandatory ? "Selecione a turma" : "Escolher depois"}
          </option>
          {choices.map((group) => {
            const vacancies = Math.max(
              0,
              group.capacity - group.activeEnrollments,
            );
            const schedule = group.weeklySlots
              .map(
                (slot) =>
                  `${weekdays[slot.weekday]} ${slot.startTime}–${slot.endTime}`,
              )
              .join(", ");
            return (
              <option key={group.id} value={group.id}>
                {`${group.name} · ${group.professionalName} · ${schedule} · ${vacancies ? `${vacancies} ${vacancies === 1 ? "vaga" : "vagas"}` : "Sem vagas · lista de espera"}`}
              </option>
            );
          })}
        </select>
      </label>
      {groups.error ? (
        <div className="form-error" role="alert">
          {`Não foi possível carregar as turmas: ${groups.error}`}{" "}
          <button
            type="button"
            className="secondary-button button-sm"
            disabled={disabled}
            onClick={groups.retry}
          >
            Tentar carregar turmas
          </button>
        </div>
      ) : groups.items === null ? (
        <LoadingBlock />
      ) : choices.length === 0 ? (
        <p className="muted-copy">
          Nenhuma turma compatível disponível. Você pode vincular o plano e
          escolher uma turma depois.
        </p>
      ) : null}
      {selected && <GroupDetails group={selected} />}
      {selected && selected.activeEnrollments >= selected.capacity && (
        <p className="muted-copy">
          Esta turma está cheia. O cliente será incluído na lista de espera.
        </p>
      )}
      <p className="field-hint">
        {mandatory
          ? "Plano de aulas em grupo: escolha a turma do cliente."
          : "A turma pode ser escolhida depois com o responsável."}
      </p>
    </fieldset>
  );
}
