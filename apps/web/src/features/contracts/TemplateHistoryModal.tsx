import type { DocumentTemplate } from "@crm/contracts";
import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { diffTemplateLines, templateDiffSummary } from "./template-diff";

function versionAuthor(version: DocumentTemplate) {
  const createdAt = new Date(version.createdAt);
  const when = `${shortDate.format(createdAt)} às ${timeLabel.format(createdAt)}`;
  return version.createdByName
    ? `${when} · por ${version.createdByName}`
    : `${when} · autor não registrado`;
}

/** Versões de um modelo: o que mudou de uma para a outra, quem mudou e restauração. */
export function TemplateHistoryModal({
  versions,
  canRestore,
  onClose,
  onRestored,
}: {
  /** Todas as versões do mesmo modelo, em qualquer ordem. */
  versions: DocumentTemplate[];
  canRestore: boolean;
  onClose: () => void;
  onRestored: (template: DocumentTemplate, fromVersion: number) => void;
}) {
  const ordered = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions],
  );
  const [selectedId, setSelectedId] = useState(
    () => (ordered.find((item) => item.active) ?? ordered[0])?.id,
  );
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const restoringRef = useRef(false);
  const selectedIndex = Math.max(
    0,
    ordered.findIndex((item) => item.id === selectedId),
  );
  const selected = ordered[selectedIndex];
  const previous = ordered[selectedIndex + 1];
  const diff = useMemo(
    () =>
      selected
        ? diffTemplateLines(previous?.body ?? selected.body, selected.body)
        : [],
    [previous, selected],
  );
  if (!selected) return null;

  async function restore(version: DocumentTemplate) {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    setError("");
    try {
      onRestored(
        await api.restoreDocumentTemplateVersion(version.id),
        version.version,
      );
    } catch (cause) {
      setError((cause as Error).message);
      setRestoring(false);
      restoringRef.current = false;
    }
  }

  return (
    <Modal
      title="Histórico do modelo"
      subtitle={`${selected.name} · ${ordered.length} ${ordered.length === 1 ? "versão" : "versões"}`}
      eyebrow="Modelos"
      wide
      className="template-history-modal"
      busy={restoring}
      onClose={onClose}
    >
      <div className="template-history">
        <ol className="template-history-list" aria-label="Versões do modelo">
          {ordered.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                className="template-history-version"
                aria-current={version.id === selected.id ? "true" : undefined}
                onClick={() => {
                  setError("");
                  setSelectedId(version.id);
                }}
              >
                <strong>
                  Versão {version.version}
                  {version.active && (
                    <span className="status-pill active">Em uso</span>
                  )}
                </strong>
                <span>{versionAuthor(version)}</span>
                {version.restoredFromVersion && (
                  <span>
                    Restaurada da versão {version.restoredFromVersion}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
        <section
          className="template-history-detail"
          aria-label={`Versão ${selected.version}`}
        >
          <div className="template-history-detail-head">
            <div>
              <h3>Versão {selected.version}</h3>
              <p className="panel-context">
                {versionAuthor(selected)}
                {selected.restoredFromVersion
                  ? ` · restaurada da versão ${selected.restoredFromVersion}`
                  : ""}
              </p>
            </div>
            {canRestore && !selected.active && (
              <button
                type="button"
                className="secondary-button button-sm"
                disabled={restoring}
                onClick={() => void restore(selected)}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {restoring
                  ? "Restaurando…"
                  : `Restaurar versão ${selected.version}`}
              </button>
            )}
          </div>
          <p className="template-history-summary">
            {previous
              ? `Comparada à versão ${previous.version}: ${templateDiffSummary(diff)}.`
              : "Primeira versão do modelo."}
          </p>
          {error && <div className="form-error">{error}</div>}
          <div
            className="template-history-diff"
            aria-label={
              previous
                ? `Mudanças da versão ${previous.version} para a ${selected.version}`
                : `Texto da versão ${selected.version}`
            }
          >
            {diff.map((line, index) => (
              <p key={index} className={`diff-line diff-${line.kind}`}>
                <span className="diff-mark" aria-hidden="true">
                  {line.kind === "added"
                    ? "+"
                    : line.kind === "removed"
                      ? "−"
                      : ""}
                </span>
                {line.kind === "added" ? (
                  <ins>{line.text || " "}</ins>
                ) : line.kind === "removed" ? (
                  <del>{line.text || " "}</del>
                ) : (
                  <span>{line.text || " "}</span>
                )}
              </p>
            ))}
          </div>
        </section>
      </div>
      <div className="modal-actions">
        <ModalCancelButton disabled={restoring}>Fechar</ModalCancelButton>
      </div>
    </Modal>
  );
}
