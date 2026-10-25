import {
  saoPauloToday,
  type PayrollEmployee,
  type PayrollSummary,
  type Professional,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency } from "../../shared/lib/formatting";
import { formatCompetence } from "./model";
import { PayrollEmployeeModal } from "./PayrollEmployeeModal";

const money = (cents: number) => currency.format(cents / 100);

/**
 * Folha de pagamento: só a parte salarial dos colaboradores. Cada linha soma o salário
 * fixo às comissões da competência do profissional ligado.
 */
export function PayrollSection({
  professionals,
}: {
  professionals: Professional[];
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [competence, setCompetence] = useState(saoPauloToday().slice(0, 7));
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<PayrollEmployee | "new" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const financeVersion = useDataVersion("finance");
  const canManage = can("finance.payroll_manage");
  useEffect(() => {
    let active = true;
    Promise.all([api.payroll(competence), api.payrollEmployees()])
      .then(([payroll, list]) => {
        if (!active) return;
        setSummary(payroll);
        setEmployees(list);
        setError("");
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [competence, financeVersion, attempt]);
  const inactive = employees.filter((item) => !item.active);
  const loading = !summary || summary.competence !== competence;
  return (
    <section className="panel finance-panel">
      <div className="panel-head">
        <div>
          <h2>Folha de pagamento</h2>
          <p className="panel-context">{formatCompetence(competence)}</p>
          <p className="panel-help">
            Salários dos colaboradores: o salário fixo somado às comissões do
            mês do profissional ligado.
          </p>
        </div>
        {canManage && (
          <button className="primary-button" onClick={() => setEditor("new")}>
            <Plus size={18} /> Novo colaborador
          </button>
        )}
      </div>
      <div className="list-toolbar payroll-toolbar">
        <label>
          Competência
          <input
            type="month"
            value={competence}
            onChange={(event) =>
              event.target.value && setCompetence(event.target.value)
            }
          />
        </label>
      </div>
      {error && (
        <div className="payroll-error">
          <ErrorBanner error={error} />
        </div>
      )}
      {loading ? (
        !error && <LoadingBlock />
      ) : summary.lines.length === 0 ? (
        <EmptyState
          title="Nenhum colaborador na folha"
          copy="Cadastre os colaboradores com o salário fixo; quem é profissional soma as comissões do mês."
        />
      ) : (
        <div className="finance-table finance-list payroll-table">
          <div className="finance-row finance-head" aria-hidden="true">
            <span>Colaborador</span>
            <span className="finance-amount">Salário fixo</span>
            <span className="finance-amount">Comissões</span>
            <span className="finance-amount">Total</span>
            <span className="finance-actions">Ações</span>
          </div>
          {summary.lines.map((line) => {
            const detail = [
              line.employee.role,
              line.employee.professionalName &&
                `Profissional: ${line.employee.professionalName}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div className="finance-row" key={line.employee.id}>
                <div className="finance-item">
                  <strong title={line.employee.name}>
                    {line.employee.name}
                  </strong>
                  <span title={detail}>{detail || "Sem cargo informado"}</span>
                </div>
                <span className="finance-amount">
                  <span className="finance-label">Salário fixo </span>
                  {money(line.baseSalaryInCents)}
                </span>
                <span className="finance-amount">
                  <span className="finance-label">Comissões </span>
                  {money(line.commissionInCents)}
                </span>
                <strong className="finance-amount">
                  <span className="finance-label">Total </span>
                  {money(line.totalInCents)}
                </strong>
                <div className="finance-actions">
                  {canManage && (
                    <button
                      className="secondary-button button-sm"
                      aria-label={`Editar ${line.employee.name}`}
                      onClick={() => setEditor(line.employee)}
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="finance-row payroll-total">
            <strong>Total da folha</strong>
            <span className="finance-amount">
              <span className="finance-label">Salário fixo </span>
              {money(summary.baseSalaryInCents)}
            </span>
            <span className="finance-amount">
              <span className="finance-label">Comissões </span>
              {money(summary.commissionInCents)}
            </span>
            <strong className="finance-amount">
              <span className="finance-label">Total </span>
              {money(summary.totalInCents)}
            </strong>
            <span />
          </div>
        </div>
      )}
      {inactive.length > 0 && (
        <div className="payroll-inactive">
          <h3>Fora da folha</h3>
          <ul>
            {inactive.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name}
                  {item.role && ` · ${item.role}`}
                </span>
                {canManage && (
                  <button
                    className="secondary-button button-sm"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setEditor(item)}
                  >
                    Editar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editor && (
        <PayrollEmployeeModal
          {...(editor === "new" ? {} : { employee: editor })}
          employees={employees}
          professionals={professionals}
          onClose={() => setEditor(null)}
          onSaved={() => {
            toast.success(
              editor === "new"
                ? "Colaborador cadastrado."
                : "Colaborador atualizado.",
            );
            setEditor(null);
            setAttempt((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
