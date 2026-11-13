import type { AutomaticPatientTag } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import { validAutomaticTags } from "../../shared/hooks/usePatientTags";
import { AutomaticTagEditModal } from "./AutomaticTagEditModal";

/**
 * Etiquetas automáticas (AT1): a regra de quando cada uma aparece é fixa; a clínica só troca o
 * nome exibido e a cor.
 */
export function AutomaticPatientTagsSection({
  canEdit,
  onNotice,
}: {
  canEdit: boolean;
  onNotice: (message: string) => void;
}) {
  const { can } = useAuthorization();
  const [tags, setTags] = useState<AutomaticPatientTag[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<AutomaticPatientTag | null>(null);

  useEffect(() => {
    let active = true;
    api
      .automaticPatientTags()
      .then((data) => active && setTags(validAutomaticTags(data)))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function replaceTag(updated: AutomaticPatientTag) {
    setTags((items) =>
      (items ?? []).map((item) => (item.key === updated.key ? updated : item)),
    );
  }

  return (
    <section
      className="automatic-tags-section"
      aria-labelledby="automatic-tags-title"
    >
      <h3 id="automatic-tags-title">Etiquetas automáticas</h3>
      <p className="muted-copy">
        O sistema coloca e tira estas etiquetas sozinho, conforme a regra de
        cada uma. Aqui dá para trocar o nome e a cor; a regra continua a mesma.
      </p>
      {error && (
        <>
          <ErrorBanner error={error} />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {!tags ? (
        !error && <LoadingBlock />
      ) : tags.length === 0 ? (
        <EmptyState
          title="Nenhuma etiqueta automática"
          copy="As etiquetas automáticas não foram encontradas."
        />
      ) : (
        <ul className="tag-list" aria-label="Etiquetas automáticas">
          {tags.map((tag) => (
            <li key={tag.key}>
              <div className="tag-list-info">
                <PatientTagBadge name={tag.name} color={tag.color} />
                {tag.name !== tag.defaultName && (
                  <small className="tag-category">
                    Padrão: {tag.defaultName}
                  </small>
                )}
                <small>{tag.description}</small>
              </div>
              {canEdit && can("settings.tags_update") && (
                <div className="tag-list-actions">
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    aria-label={`Editar etiqueta automática ${tag.name}`}
                    onClick={() => setEditing(tag)}
                  >
                    Editar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <AutomaticTagEditModal
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated, message) => {
            replaceTag(updated);
            onNotice(message);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
