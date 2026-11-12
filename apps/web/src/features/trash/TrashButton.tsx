import { trashKindModules, type TrashKind } from "@crm/contracts";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { TrashIconButton } from "./TrashIconButton";
import { TrashModal } from "./TrashModal";

/** Ícone que abre a lixeira da tela; só para quem vê a lixeira e a própria área. */
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
      <TrashIconButton label="Abrir lixeira" onClick={() => setOpen(true)} />
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
