import { groupVacancyLabel } from "../lib/formatting";
import { compatiblePlanGroups } from "../lib/plan-groups";
import type { GroupChoices } from "../workflows/types";
import { GroupDetails } from "./GroupDetails";
import { LoadingBlock } from "./LoadingBlock";
import { useState } from "react";
import { ActionModal } from "./ActionModal";
import { createPortal } from "react-dom";

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
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
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
          onChange={(event) => {
            const group = choices.find(
              (item) => item.id === event.target.value,
            );
            if (group && group.activeEnrollments >= group.capacity)
              setPendingGroup(group.id);
            else onChange(event.target.value);
          }}
        >
          <option value="">
            {mandatory ? "Selecione a turma" : "Escolher depois"}
          </option>
          {choices.map((group) => {
            const schedule = group.weeklySlots
              .map(
                (slot) =>
                  `${weekdays[slot.weekday]} ${slot.startTime}–${slot.endTime}`,
              )
              .join(", ");
            return (
              <option key={group.id} value={group.id}>
                {`${group.name} · ${group.professionalName} · ${schedule} · ${groupVacancyLabel(group)}`}
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
          Esta turma está cheia. O cliente será incluído na Lista de espera do
          serviço.
        </p>
      )}
      <p className="field-hint">
        {mandatory
          ? "Plano de aulas em grupo: escolha a turma do cliente."
          : "A turma pode ser escolhida depois com o responsável."}
      </p>
      {pendingGroup &&
        createPortal(
          <ActionModal
            eyebrow="Lista de espera"
            title="Turma cheia"
            subtitle="Deseja colocar o cliente na lista de espera desta turma?"
            effect="O plano não é vendido: o cliente entra na Lista de espera do serviço, sem forma de pagamento nem contrato. Quando abrir vaga, a matrícula e o pagamento são feitos pela Lista de espera."
            confirmLabel="Sim, colocar na lista de espera"
            onClose={() => setPendingGroup(null)}
            onConfirm={async () => {
              onChange(pendingGroup);
              setPendingGroup(null);
            }}
          />,
          document.body,
        )}
    </fieldset>
  );
}
