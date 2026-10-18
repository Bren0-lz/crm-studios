import { useSyncExternalStore } from "react";
import {
  type DataDomain,
  getDataVersion,
  subscribeDataVersion,
} from "../api/data-version";

/**
 * Versão atual dos domínios informados. Use no array de dependências do `useEffect` que
 * carrega a tela: qualquer mutação nesses domínios refaz a consulta (QC6).
 */
export function useDataVersion(...domains: DataDomain[]) {
  return useSyncExternalStore(subscribeDataVersion, () =>
    getDataVersion(domains),
  );
}
