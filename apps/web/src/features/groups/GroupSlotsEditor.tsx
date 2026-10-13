import type { GroupClass } from "@crm/contracts";
import { X } from "lucide-react";

export function GroupSlotsEditor({
  slots,
  onChange,
  weekDayNames,
}: {
  slots: GroupClass["weeklySlots"];
  onChange: (slots: GroupClass["weeklySlots"]) => void;
  weekDayNames: string[];
}) {
  function addSlot() {
    const candidate = [
      ["09:00", "10:00"],
      ["10:00", "11:00"],
      ["11:00", "12:00"],
      ["14:00", "15:00"],
      ["15:00", "16:00"],
      ["16:00", "17:00"],
      ["18:00", "19:00"],
    ]
      .flatMap(([startTime, endTime]) =>
        [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
          weekday,
          startTime: startTime!,
          endTime: endTime!,
        })),
      )
      .find(
        (slot) =>
          !slots.some(
            (item) =>
              item.weekday === slot.weekday &&
              item.startTime < slot.endTime &&
              item.endTime > slot.startTime,
          ),
      );
    if (candidate) onChange([...slots, candidate]);
  }
  return (
    <div className="group-slots-editor">
      <div className="group-slots-head">
        <div>
          <h4>Dias e horários fixos</h4>
          <p>
            Estes horários ficam reservados na agenda toda semana, com o
            profissional e a sala da turma.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button button-sm"
          disabled={slots.length >= 14}
          onClick={addSlot}
        >
          Adicionar horário
        </button>
      </div>
      {slots.length === 0 && (
        <p className="group-empty">
          Adicione ao menos um dia e horário para a turma.
        </p>
      )}
      {slots.map((slot, index) => (
        <div className="group-slot-row" key={index}>
          <label>
            Dia
            <select
              value={slot.weekday}
              onChange={(event) =>
                onChange(
                  slots.map((item, position) =>
                    position === index
                      ? { ...item, weekday: Number(event.target.value) }
                      : item,
                  ),
                )
              }
            >
              {weekDayNames.map((name, weekday) => (
                <option key={name} value={weekday}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              type="time"
              required
              value={slot.startTime}
              onChange={(event) =>
                onChange(
                  slots.map((item, position) =>
                    position === index
                      ? { ...item, startTime: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Término
            <input
              type="time"
              required
              min={slot.startTime}
              value={slot.endTime}
              onChange={(event) =>
                onChange(
                  slots.map((item, position) =>
                    position === index
                      ? { ...item, endTime: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remover horário ${index + 1}`}
            onClick={() =>
              onChange(slots.filter((_, position) => position !== index))
            }
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
