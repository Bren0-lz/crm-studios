import type {
  PayrollEmployee,
  PayrollEmployeeInput,
  Professional,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Cadastro do colaborador da folha: salário fixo e, se houver, o profissional das comissões. */
export function PayrollEmployeeModal({
  employee,
  employees,
  professionals,
  onClose,
  onSaved,
}: {
  employee?: PayrollEmployee;
  /** Colaboradores já cadastrados: um profissional só pode estar ligado a um deles. */
  employees: PayrollEmployee[];
  professionals: Professional[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PayrollEmployeeInput>({
    name: employee?.name ?? "",
    role: employee?.role ?? "",
    ...(employee?.professionalId
      ? { professionalId: employee.professionalId }
      : {}),
    baseSalaryInCents: employee?.baseSalaryInCents ?? 0,
    active: employee?.active ?? true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form);
  const missing = useMissingFields(
    [form.name.trim().length < 2 && "Nome (pelo menos 2 caracteres)"].filter(
      (item): item is string => Boolean(item),
    ),
  );
  const linked = new Set(
    employees
      .filter((item) => item.id !== employee?.id && item.professionalId)
      .map((item) => item.professionalId),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const input = { ...form, name: form.name.trim(), role: form.role?.trim() };
    try {
      if (employee) await api.updatePayrollEmployee(employee.id, input);
      else await api.createPayrollEmployee(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={employee ? "Editar colaborador" : "Novo colaborador"}
      subtitle="O total do mês é o salário fixo somado às comissões do profissional ligado."
      busy={loading}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          Nome
          <input
            required
            minLength={2}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Cargo
          <input
            value={form.role ?? ""}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          />
        </label>
        <label>
          Salário fixo
          <MoneyInput
            valueInCents={form.baseSalaryInCents}
            onChange={(cents) =>
              setForm({ ...form, baseSalaryInCents: cents ?? 0 })
            }
          />
        </label>
        <label>
          Comissões do profissional
          <select
            value={form.professionalId ?? ""}
            onChange={(event) => {
              const next: PayrollEmployeeInput = {
                ...form,
                professionalId: event.target.value,
              };
              if (!next.professionalId) delete next.professionalId;
              setForm(next);
            }}
          >
            <option value="">Sem comissão</option>
            {professionals
              .filter(
                (item) =>
                  !linked.has(item.id) &&
                  (item.active || item.id === form.professionalId),
              )
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.fullName}
                </option>
              ))}
          </select>
        </label>
        {employee && (
          <label className="checkbox-field span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
            Ativo na folha
          </label>
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={loading || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            {loading
              ? "Salvando…"
              : employee
                ? "Salvar alterações"
                : "Cadastrar colaborador"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
