import type {
  Branch,
  PayrollEmployee,
  PayrollEmployeeInput,
  Professional,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Cadastro do colaborador da folha: salário fixo e, se atende, o profissional da agenda. */
export function PayrollEmployeeModal({
  employee,
  initial,
  professionals,
  branches,
  takenProfessionalIds,
  onClose,
  onSave,
}: {
  employee: PayrollEmployee | null;
  /** Preenchimento de um profissional com comissão sem colaborador. */
  initial?: { name: string; professionalId: string; branchId?: string };
  professionals: Professional[];
  branches: Branch[];
  /** Profissionais já ligados a outro colaborador. */
  takenProfessionalIds: string[];
  onClose: () => void;
  onSave: (input: PayrollEmployeeInput) => Promise<void>;
}) {
  const [name, setName] = useState(employee?.name ?? initial?.name ?? ""),
    [role, setRole] = useState(employee?.role ?? ""),
    [professionalId, setProfessionalId] = useState(
      employee?.professionalId ?? initial?.professionalId ?? "",
    ),
    [branchId, setBranchId] = useState(
      employee?.branchId ?? initial?.branchId ?? "",
    ),
    [salary, setSalary] = useState(employee?.baseSalaryInCents ?? 0),
    [active, setActive] = useState(employee?.active ?? true);
  const dirty = useFormDirty({
    name,
    role,
    professionalId,
    branchId,
    salary,
    active,
  });
  const professional = professionals.find((item) => item.id === professionalId);
  const options = professionals.filter(
    (item) =>
      item.id === professionalId || !takenProfessionalIds.includes(item.id),
  );
  return (
    <ActionModal
      eyebrow="Folha de pagamento"
      title={employee ? `Editar ${employee.name}` : "Novo colaborador"}
      subtitle="Salário fixo mensal e, para quem atende, o profissional da agenda."
      effect="As comissões e os ajustes do profissional ligado entram na folha deste colaborador e são pagos com ela."
      confirmLabel="Salvar"
      missing={name.trim().length < 2 ? ["Nome"] : []}
      dirty={dirty}
      onClose={onClose}
      onConfirm={() =>
        onSave({
          name: name.trim(),
          ...(role.trim() ? { role: role.trim() } : {}),
          ...(professionalId ? { professionalId } : {}),
          // Com profissional, a filial é a dele.
          ...(branchId && !professional ? { branchId } : {}),
          baseSalaryInCents: salary,
          active,
        })
      }
    >
      <label className="span-2">
        Nome
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Cargo
        <input value={role} onChange={(event) => setRole(event.target.value)} />
      </label>
      <CurrencyField label="Salário fixo" value={salary} onChange={setSalary} />
      <label>
        Profissional da agenda
        <select
          value={professionalId}
          onChange={(event) => setProfessionalId(event.target.value)}
        >
          <option value="">Sem comissão</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
      </label>
      {branches.length > 1 && !professional && (
        <label>
          Filial
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">Filial em uso</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="checkbox-field span-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Colaborador ativo (entra na folha do mês)
      </label>
    </ActionModal>
  );
}
