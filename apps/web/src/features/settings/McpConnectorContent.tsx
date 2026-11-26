import type { McpConnectorStatus } from "@crm/contracts";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";

/**
 * Endereço do conector com botão de copiar, como o token das chaves de API e a mensagem do
 * Telegram: sem área de transferência, pede para selecionar e copiar à mão.
 */
function CopyEndpointField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("Selecione o endereço e copie manualmente.");
    }
  }

  return (
    <div className="clinical-form">
      <label>
        Endereço do conector
        <input
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
        />
      </label>
      {copyError && (
        <div className="form-error" role="alert">
          {copyError}
        </div>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void copy()}
        >
          {copied ? "Copiado" : "Copiar endereço"}
        </button>
      </div>
    </div>
  );
}

/** Conector MCP do manual (INT5): só informa; o token fica na configuração da hospedagem. */
export function McpConnectorContent() {
  const [status, setStatus] = useState<McpConnectorStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .mcpConnectorStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <section
      className="catalog-section mcp-connector-section"
      aria-labelledby="mcp-connector-title"
    >
      <header className="catalog-section-head">
        <div>
          <h3 id="mcp-connector-title">Manual MCP</h3>
          <p>Conecte o Claude aos guias do manual do CRM.</p>
        </div>
        {status && (
          <span
            className={
              "status-pill " + (status.enabled ? "confirmed" : "cancelled")
            }
          >
            {status.enabled ? "Ligado" : "Desligado"}
          </span>
        )}
      </header>
      {error && (
        <>
          <ErrorBanner error={error} />
          <div className="modal-actions">
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
          </div>
        </>
      )}
      {!status ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <p className="muted-copy">
            O conector só consulta os guias do manual do CRM para responder como
            fazer cada tarefa. Ele não lê nem altera os dados da clínica.
          </p>
          {!status.enabled || !status.endpoint ? (
            <EmptyState
              icon={BookOpen}
              title="Conector desligado"
              copy="O endereço e o token do conector ainda não foram configurados na hospedagem do CRM. Fale com quem administra a hospedagem."
            />
          ) : (
            <>
              <CopyEndpointField value={status.endpoint} />
              <h4>Como adicionar no Claude</h4>
              <ol className="mcp-connector-steps">
                <li>
                  No Claude, abra Configurações › Conectores e clique em
                  Adicionar conector personalizado.
                </li>
                <li>
                  Dê um nome ao conector, por exemplo “Manual do CRM”, e cole o
                  endereço acima.
                </li>
                <li>
                  Em Authentication, escolha No sign in. Em Request headers,
                  adicione o nome <code>Authorization</code> com o valor{" "}
                  <code>Bearer &lt;token&gt;</code>, usando o token entregue por
                  quem administra a hospedagem do CRM. Nunca coloque o token no
                  endereço.
                </li>
                <li>
                  Salve, ative o conector numa conversa e pergunte, por exemplo,
                  “Como remarcar um atendimento?”.
                </li>
              </ol>
              <p className="muted-copy">
                O token não aparece nesta tela. Para trocá-lo, fale com quem
                administra a hospedagem.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
