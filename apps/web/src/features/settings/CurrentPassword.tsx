import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";

type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "shown"; password: string }
  | { status: "error"; message: string };

/**
 * Senha atual do usuário, mascarada até o admin clicar no olho. Nada é buscado ao abrir: cada
 * clique faz uma consulta (e um registro no histórico). Ocultar só limpa a tela. Respostas de
 * consultas antigas ou que chegam depois de desmontar são descartadas.
 */
export function CurrentPassword({
  userId,
  disabled = false,
}: {
  userId: string;
  disabled?: boolean;
}) {
  const titleId = useId();
  const [state, setState] = useState<RevealState>({ status: "hidden" });
  const latest = useRef(0);
  useEffect(() => {
    const requests = latest;
    return () => {
      requests.current += 1;
    };
  }, []);

  async function reveal() {
    const ticket = ++latest.current;
    setState({ status: "loading" });
    try {
      const { password } = await api.revealUserPassword(userId);
      if (ticket === latest.current) setState({ status: "shown", password });
    } catch (cause) {
      if (ticket === latest.current)
        setState({ status: "error", message: (cause as Error).message });
    }
  }

  function hide() {
    latest.current += 1;
    setState({ status: "hidden" });
  }

  const loading = state.status === "loading";
  const shown = state.status === "shown";
  return (
    <div className="password-card">
      <span className="password-card-title" id={titleId}>
        Senha atual
      </span>
      <div className="password-field">
        {shown ? (
          <input
            type="text"
            readOnly
            autoComplete="off"
            value={state.password}
            aria-labelledby={titleId}
          />
        ) : (
          <span className="password-mask" aria-hidden="true">
            ••••••••
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={shown ? "Ocultar senha atual" : "Mostrar senha atual"}
          aria-busy={loading}
          disabled={disabled || loading}
          onClick={() => (shown ? hide() : void reveal())}
        >
          {shown ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      {loading && <p className="field-hint">Consultando senha...</p>}
      {shown && (
        <p className="field-hint">Senha exibida apenas para consulta.</p>
      )}
      {state.status === "error" && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
