import type { Branch } from "@crm/contracts";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { api, getStoredBranchId, storeBranchId } from "../api";

/**
 * Filial ativa no cabeçalho: só aparece para quem acessa mais de uma filial. "Todas as filiais"
 * mostra o consolidado; o que é gravado nesse modo vai para a filial padrão.
 */
export function BranchSelector() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState(getStoredBranchId() ?? "");
  useEffect(() => {
    let active = true;
    api
      .branches()
      .then((items) => {
        if (!active || !Array.isArray(items)) return;
        setBranches(items);
        // Filial salva que o usuário não acessa mais (ou de outra sessão) volta ao consolidado.
        const stored = getStoredBranchId();
        if (stored && !items.some((item) => item.id === stored)) {
          storeBranchId(null);
          setSelected("");
        }
      })
      .catch(() => {
        // Sem a lista, o cabeçalho segue sem o seletor (a API usa as filiais do usuário).
      });
    return () => {
      active = false;
    };
  }, []);
  if (branches.length < 2) return null;
  return (
    <label className="branch-select" title="Filial ativa">
      <MapPin size={16} aria-hidden="true" />
      <span className="sr-only">Filial ativa</span>
      <select
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          storeBranchId(event.target.value || null);
        }}
      >
        <option value="">Todas as filiais</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}
