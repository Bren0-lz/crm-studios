import { Plus } from "lucide-react";
import { useId, useState } from "react";

/**
 * Cadastro rápido de categoria ou centro de custo sem sair do formulário da despesa.
 * Sem permissão de cadastro, só explica o que falta.
 */
export function InlineClassificationCreate({
  emptyLabel,
  createLabel,
  canCreate,
  onCreate,
}: {
  emptyLabel: string;
  createLabel: string;
  canCreate: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const missingId = useId();
  const tooShort = name.trim().length < 2;
  async function create() {
    setSaving(true);
    setError("");
    try {
      await onCreate(name.trim());
      setName("");
      setOpen(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!canCreate)
    return (
      <span className="field-hint">
        {emptyLabel}. Peça a quem administra o financeiro para cadastrar.
      </span>
    );
  if (!open)
    return (
      <span className="inline-create">
        <span className="field-hint">{emptyLabel}.</span>
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(true)}
        >
          <Plus size={14} /> {createLabel}
        </button>
      </span>
    );
  return (
    <span className="inline-create">
      <input
        aria-label={createLabel}
        autoFocus
        maxLength={100}
        placeholder="Nome"
        value={name}
        disabled={saving}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          // Enter cria o item em vez de enviar a despesa.
          if (event.key === "Enter") {
            event.preventDefault();
            if (name.trim().length >= 2) void create();
          }
        }}
      />
      <button
        type="button"
        className="secondary-button"
        disabled={saving || tooShort}
        aria-describedby={tooShort ? missingId : undefined}
        onClick={() => void create()}
      >
        {saving ? "Criando…" : "Criar"}
      </button>
      {tooShort && (
        <span className="field-hint" id={missingId}>
          Falta: Nome (pelo menos 2 caracteres).
        </span>
      )}
      {error && <span className="form-error">{error}</span>}
    </span>
  );
}
