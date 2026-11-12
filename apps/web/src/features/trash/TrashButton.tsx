import { trashKindModules, type TrashKind } from "@crm/contracts";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { TrashModal } from "./TrashModal";

/** Botão "Lixeira" da tela do tópico; só para quem vê a lixeira e a própria área. */
export function TrashButton({
  kind,
  onChanged,
}: {
  kind: TrashKind;
  onChanged?: () => void;
}) {
  const { can } = useAuthorization();
  const [open, setOpen] = useState(false);
  if (!can("trash.view", `${trashKindModules[kind]}.view`)) return null;
  return (
    <>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={18} aria-hidden="true" />
        Lixeira
      </button>
      {open && (
        <TrashModal
          kind={kind}
          onClose={() => setOpen(false)}
          {...(onChanged ? { onChanged } : {})}
        />
      )}
    </>
  );
}
