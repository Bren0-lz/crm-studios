import { withPrefix } from "@crm/contracts";
import { branchAddressLine, formatPhone, type Branch } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { BranchModal } from "./BranchModal";

const byName = (items: Branch[]) =>
  [...items].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

export function BranchesContent() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Branch | "new" | null>(null);

  useEffect(() => {
    let active = true;
    api
      .adminBranches()
      .then((data) => active && setBranches(byName(data)))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function saved(branch: Branch) {
    setBranches((items) =>
      byName([
        ...(items ?? []).filter((item) => item.id !== branch.id),
        branch,
      ]),
    );
    setNotice(editing === "new" ? "Filial cadastrada." : "Filial atualizada.");
    setEditing(null);
  }

  return (
    <>
      <p className="muted-copy">
        Escolha a filial ativa no topo da tela. Clientes, serviços, planos,
        etiquetas e formulários são compartilhados pela rede.
      </p>
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {error && (
        <>
          <ErrorBanner error={error} />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {!branches ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <div className="page-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setNotice("");
                setEditing("new");
              }}
            >
              <Plus size={17} />
              Nova filial
            </button>
          </div>
          {branches.length === 0 ? (
            <EmptyState
              title="Nenhuma filial cadastrada"
              copy="Cadastre as unidades da rede."
            />
          ) : (
            <div className="holiday-list">
              {branches.map((branch) => (
                <article key={branch.id}>
                  <div>
                    <strong>{branch.name}</strong>
                    <small>
                      {[
                        branch.isDefault ? "Filial padrão" : null,
                        branch.active ? null : "Inativa",
                        branchAddressLine(branch),
                        ...(branch.phones ?? []).map((phone) =>
                          phone.label
                            ? `${phone.label}: ${formatPhone(phone.number)}`
                            : formatPhone(phone.number),
                        ),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Ativa"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    aria-label={`Editar ${withPrefix("filial", branch.name)}`}
                    onClick={() => {
                      setNotice("");
                      setEditing(branch);
                    }}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {editing && (
        <BranchModal
          {...(editing === "new" ? {} : { branch: editing })}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}
