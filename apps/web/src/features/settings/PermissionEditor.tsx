import {
  appModuleLabels,
  appModuleSchema,
  permissionCatalog,
  togglePermissions,
  type PermissionKey,
} from "@crm/contracts";
import { useEffect, useRef, useState } from "react";

function BlockToggle({
  name,
  keys,
  value,
  onChange,
}: {
  name: string;
  keys: PermissionKey[];
  value: PermissionKey[];
  onChange: (value: PermissionKey[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const count = keys.filter((key) => value.includes(key)).length;
  useEffect(() => {
    if (input.current)
      input.current.indeterminate = count > 0 && count < keys.length;
  }, [count, keys.length]);
  return (
    <label className="checkbox-field">
      <input
        ref={input}
        type="checkbox"
        checked={count === keys.length}
        onChange={(event) =>
          onChange(togglePermissions(value, keys, event.target.checked))
        }
        aria-label={`Selecionar bloco ${name}`}
      />
      Selecionar bloco · {count}/{keys.length}
    </label>
  );
}

export function PermissionEditor({
  value,
  onChange,
}: {
  value: PermissionKey[];
  onChange: (value: PermissionKey[]) => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  return (
    <div className="operation-permissions">
      <div className="permission-toolbar">
        <label>
          Buscar permissão
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: estornar, agendar, exportar"
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange([])}
        >
          Limpar permissões
        </button>
        <span role="status">{value.length} permissões selecionadas</span>
      </div>
      {appModuleSchema.options.map((module) => {
        const all = permissionCatalog.filter((item) => item.module === module);
        const visible = all.filter((item) =>
          `${appModuleLabels[module]} ${item.name} ${item.description}`
            .toLocaleLowerCase("pt-BR")
            .includes(query),
        );
        if (!visible.length) return null;
        return (
          <section className="permission-group" key={module}>
            <div className="permission-group-head">
              <h3>{appModuleLabels[module]}</h3>
              <BlockToggle
                name={appModuleLabels[module]}
                keys={all.map((item) => item.key)}
                value={value}
                onChange={onChange}
              />
            </div>
            <div className="permission-options">
              {visible.map((item) => (
                <label className="permission-option" key={item.key}>
                  <input
                    type="checkbox"
                    checked={value.includes(item.key)}
                    onChange={(event) =>
                      onChange(
                        togglePermissions(
                          value,
                          [item.key],
                          event.target.checked,
                        ),
                      )
                    }
                    aria-label={`${appModuleLabels[module]}: ${item.name}`}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
      <p className="muted-copy">
        Operações exigem visualizar o módulo. Administração é exclusiva de
        administradores.
      </p>
    </div>
  );
}
