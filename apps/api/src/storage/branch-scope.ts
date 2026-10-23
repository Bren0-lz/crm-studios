import type { BranchScope } from "@crm/contracts";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Filial da requisição em curso, por instância de repositório. O `onRequest` abre o contexto
 * (`open`) e o `authenticate` grava o escopo (`set`) depois de validar o acesso do usuário.
 * Sem escopo (seeds, testes que chamam o repositório direto) a leitura é consolidada e a
 * gravação vai para a filial padrão da clínica.
 */
export class BranchScopeStore {
  private readonly storage = new AsyncLocalStorage<{ scope?: BranchScope }>();

  /** Abre um contexto vazio para `callback` e tudo o que ele disparar. */
  open<T>(callback: () => T) {
    return this.storage.run({}, callback);
  }

  /** Grava o escopo no contexto aberto (sem contexto, não faz nada). */
  set(scope: BranchScope) {
    const store = this.storage.getStore();
    if (store) store.scope = scope;
  }

  /** Executa `callback` já no escopo informado (scripts e testes). */
  run<T>(scope: BranchScope, callback: () => T) {
    return this.storage.run({ scope }, callback);
  }

  current(): BranchScope | undefined {
    return this.storage.getStore()?.scope;
  }

  /** Filiais da leitura: `null` = todas. */
  readIds(): string[] | null {
    return this.current()?.branchIds ?? null;
  }

  /** Filial escolhida para gravar; ausente = filial padrão da clínica. */
  writeId(): string | undefined {
    return this.current()?.writeBranchId;
  }
}
