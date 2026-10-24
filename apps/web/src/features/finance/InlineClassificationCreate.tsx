import { Plus } from "lucide-react";
import { useId, useState } from "react";

/** Valor da opção "+ Nova …" no fim do select: abre o cadastro rápido em vez de selecionar. */
export const CREATE_OPTION_VALUE = "__create__";

/**
 * Cadastro rápido de categoria ou centro de custo sem sair do formulário da despesa.
 * Com `emptyLabel` (lista vazia) mostra o aviso e o botão de criar; com a lista preenchida
 * só aparece quando `open` (escolhida a opção "+ Nova …" do select).
 * Sem permissão de cadastro, só explica o que falta.
 */
export function InlineClassificationCreate({
  emptyLabel,
  createLabel,
  canCreate,
  open: controlledOpen,
  onOpenChange,
  onCreate,
}: {
  emptyLabel?: string | undefined;
  createLabel: string;
  canCreate: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const missingId = useId();
  const tooShort = name.trim().length < 2;
  function setOpen(next: boolean) {
    setOwnOpen(next);
    onOpenChange?.(next);
  }
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
    return emptyLabel ? (
      <span className="field-hint">
        {emptyLabel}. Peça a quem administra o financeiro para cadastrar.
      </span>
    ) : null;
  if (!open)
    return emptyLabel ? (
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
    ) : null;
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
      <button
        type="button"
        className="text-button"
        disabled={saving}
        onClick={() => {
          setName("");
          setError("");
          setOpen(false);
        }}
      >
        Cancelar
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
