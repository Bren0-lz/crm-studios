import type { useUserAgenda } from "./useUserAgenda";
import { LoadingBlock } from "../../shared/components/LoadingBlock";

export function UserAgendaFields({
  agenda,
}: {
  agenda: ReturnType<typeof useUserAgenda>;
}) {
  const { draft } = agenda;
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Agenda</legend>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={agenda.attends}
          onChange={(event) => agenda.toggle(event.target.checked)}
        />
        Realiza atendimentos
      </label>
      {agenda.attends ? (
        <div className="form-fieldset-grid">
          <label className="span-2">
            Cadastro do profissional
            <select
              value={agenda.mode}
              onChange={(event) =>
                agenda.changeMode(event.target.value as "create" | "existing")
              }
            >
              <option value="create">Cadastrar profissional</option>
              <option value="existing">Vincular profissional existente</option>
            </select>
          </label>
          {agenda.mode === "existing" && (
            <div className="span-2">
              {agenda.loading && <LoadingBlock />}
              {agenda.error && (
                <>
                  <p className="form-error" role="alert">
                    Não foi possível carregar os profissionais da agenda:{" "}
                    {agenda.error}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={agenda.retry}
                  >
                    Tentar novamente
                  </button>
                </>
              )}
              <label>
                Profissional da agenda
                <select
                  value={agenda.selected}
                  onChange={(event) => agenda.select(event.target.value)}
                >
                  <option value="">Selecione um profissional</option>
                  {agenda.options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                      {!item.active ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!agenda.loading &&
                !agenda.error &&
                agenda.options.length === 0 && (
                  <p className="muted-copy">
                    Nenhum profissional disponível nesta filial. Escolha
                    “Cadastrar profissional” para criar um.
                  </p>
                )}
            </div>
          )}
          <label>
            Nome na agenda
            <input
              required
              minLength={3}
              maxLength={160}
              value={draft.fullName}
              onChange={(event) =>
                agenda.setDraft({ ...draft, fullName: event.target.value })
              }
            />
          </label>
          <label>
            Registro profissional
            <input
              required
              minLength={4}
              maxLength={40}
              value={draft.crefito}
              onChange={(event) =>
                agenda.setDraft({ ...draft, crefito: event.target.value })
              }
            />
          </label>
          <label>
            Especialidade
            <input
              required
              minLength={2}
              maxLength={100}
              value={draft.specialty}
              onChange={(event) =>
                agenda.setDraft({ ...draft, specialty: event.target.value })
              }
            />
          </label>
          <label>
            Cor
            <input
              type="color"
              value={draft.color}
              onChange={(event) =>
                agenda.setDraft({ ...draft, color: event.target.value })
              }
            />
          </label>
        </div>
      ) : agenda.hasProfessional ? (
        <p className="muted-copy">
          Ao desmarcar, o profissional fica inativo para novos agendamentos. O
          vínculo, o histórico e os atendimentos já marcados são mantidos.
        </p>
      ) : (
        <p className="muted-copy">
          Marque para cadastrar ou vincular o profissional desta pessoa na
          agenda.
        </p>
      )}
    </fieldset>
  );
}
