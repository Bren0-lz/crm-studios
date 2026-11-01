import {
  saoPauloToday,
  type Branch,
  type PayrollEmployee,
  type PayrollItem,
  type PayrollItemStatus,
  type PayrollLine,
  type PayrollPayableSummary,
  type PayrollSummary,
  type PayrollTotals,
  type Professional,
} from "@crm/contracts";
import { ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { allBranches, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import { formatCompetence } from "./model";
import { PayrollEmployeeModal } from "./PayrollEmployeeModal";
import { PayrollLaunchModal } from "./PayrollLaunchModal";

const statusLabels: Record<PayrollItemStatus, string> = {
  pending: "A lançar",
  launched: "Lançado",
  paid: "Pago",
  outside: "Pago fora da folha",
};
const money = (cents: number) => currency.format(cents / 100);

/** Cor da situação: âmbar pede ação (a lançar), cinza-azulado aguarda pagamento, verde quitado. */
const statusTones: Record<PayrollItemStatus, string> = {
  pending: "paused",
  launched: "open",
  paid: "paid",
  outside: "paid",
};

/**
 * Itens iguais (mesmo tipo, descrição e situação) somados numa linha. A descrição é separada
 * no primeiro " · ": "Comissão" como título e "Pilates individual" como detalhe.
 */
function groupItems(items: PayrollItem[]) {
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      detail: string;
      status: PayrollItemStatus;
      count: number;
      amountInCents: number;
    }
  >();
  for (const item of items) {
    const key = `${item.kind}|${item.description}|${item.status}`;
    const [title = item.description, ...rest] = item.description.split(" · ");
    const group = groups.get(key) ?? {
      key,
      title,
      detail: rest.join(" · "),
      status: item.status,
      count: 0,
      amountInCents: 0,
    };
    group.count += 1;
    group.amountInCents += item.amountInCents;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function lineStatus(line: PayrollLine) {
  if (line.pendingInCents !== 0) return { label: "A lançar", tone: "paused" };
  if (!line.payables.length) return { label: "Sem valores", tone: "open" };
  return line.payables.every((item) => item.status === "paid")
    ? { label: "Paga", tone: "paid" }
    : { label: "Lançada", tone: "open" };
}

function Totals({ totals, label }: { totals: PayrollTotals; label: string }) {
  return (
    <dl className="payroll-totals" aria-label={label}>
      <div>
        <dt>Salários</dt>
        <dd>{money(totals.salaryInCents)}</dd>
      </div>
      <div>
        <dt>Comissões</dt>
        <dd>{money(totals.commissionInCents)}</dd>
      </div>
      <div>
        <dt>Ajustes</dt>
        <dd>{money(totals.adjustmentInCents)}</dd>
      </div>
      <div className="is-total">
        <dt>Total</dt>
        <dd>{money(totals.totalInCents)}</dd>
      </div>
      <div className={totals.pendingInCents > 0 ? "is-pending" : undefined}>
        <dt>A lançar</dt>
        <dd>{money(totals.pendingInCents)}</dd>
      </div>
    </dl>
  );
}

/**
 * Folha de pagamento: por competência e por filial (uma ou várias, com "Selecionar todas"),
 * cada colaborador com salário, comissões e ajustes. É o único lugar que paga comissão.
 */
export function PayrollSection({
  professionals,
}: {
  professionals: Professional[];
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const canManage = can("finance.payroll_manage");
  const [competence, setCompetence] = useState(saoPauloToday().slice(0, 7));
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  // Só os colaboradores cadastrados antes do salário no usuário se editam aqui.
  const [editing, setEditing] = useState<PayrollEmployee | null>(null);
  const [launching, setLaunching] = useState(false);
  const [undoing, setUndoing] = useState<PayrollPayableSummary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const version = useDataVersion("finance");
  useEffect(() => {
    let active = true;
    api
      .branches()
      .then((items) => {
        if (!active) return;
        const usable = items.filter((item) => item.active);
        setBranches(usable);
        setSelected(usable.map((item) => item.id));
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!branches || !selected.length) return;
    let active = true;
    Promise.all([
      api.payroll(competence, selected, allBranches),
      api.payrollEmployees(allBranches),
    ])
      .then(([data, list]) => {
        if (!active) return;
        setSummary(data);
        setEmployees(list);
        setError("");
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [branches, selected, competence, version, attempt]);
  const reload = () => setAttempt((value) => value + 1);
  function toggleBranch(id: string) {
    setSummary(null);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function changeCompetence(value: string) {
    if (!value || value === competence) return;
    setSummary(null);
    setCompetence(value);
  }
  const allSelected = Boolean(
    branches && branches.every((item) => selected.includes(item.id)),
  );
  const lines = summary?.branches.flatMap((branch) => branch.lines) ?? [];
  return (
    <section className="panel finance-panel payroll-panel">
      <div className="panel-head">
        <div>
          <h2>Folha de pagamento</h2>
          <p className="panel-context">
            Competência {formatCompetence(competence)}
          </p>
          <p className="panel-help">
            Salário fixo, comissões e ajustes de cada colaborador. Entram na
            folha os usuários que recebem salário (Administração › Usuários).
            Lançar a folha cria uma despesa por colaborador em Contas a pagar;
            pagar a despesa paga as comissões incluídas.
          </p>
        </div>
        <div className="page-actions">
          <label className="payroll-competence">
            Competência
            <input
              type="month"
              value={competence}
              onChange={(event) => changeCompetence(event.target.value)}
            />
          </label>
          {canManage && (
            <button
              type="button"
              className="primary-button"
              disabled={!summary || summary.totals.pendingInCents <= 0}
              onClick={() => setLaunching(true)}
            >
              <Wallet size={18} /> Lançar folha do mês
            </button>
          )}
        </div>
      </div>
      {branches && branches.length > 1 && (
        <fieldset className="payroll-branches">
          <legend>Filiais</legend>
          {branches.map((branch) => (
            <label className="checkbox-field" key={branch.id}>
              <input
                type="checkbox"
                checked={selected.includes(branch.id)}
                onChange={() => toggleBranch(branch.id)}
              />
              {branch.name}
            </label>
          ))}
          <button
            type="button"
            className="secondary-button button-sm"
            disabled={allSelected}
            onClick={() => {
              setSummary(null);
              setSelected(branches.map((item) => item.id));
            }}
          >
            Selecionar todas
          </button>
        </fieldset>
      )}
      <div className="payroll-body">
        {error && (
          <>
            <ErrorBanner error={error} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setError("");
                reload();
              }}
            >
              Tentar de novo
            </button>
          </>
        )}
        {branches && !selected.length ? (
          <EmptyState
            title="Nenhuma filial selecionada"
            copy="Marque ao menos uma filial ou use “Selecionar todas”."
          />
        ) : !summary ? (
          !error && <LoadingBlock />
        ) : (
          <>
            {summary.unassigned.length > 0 && (
              <div className="payroll-unassigned" role="status">
                <p>
                  Comissões a pagar de profissionais que ainda não estão na
                  folha. Para incluí-las, ligue o profissional a um usuário em
                  Administração › Usuários.
                </p>
                <ul>
                  {summary.unassigned.map((row) => (
                    <li key={row.professionalId}>
                      <span>
                        {row.professionalName} · {row.count}{" "}
                        {row.count === 1 ? "lançamento" : "lançamentos"} ·{" "}
                        {money(row.pendingInCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lines.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Nenhum colaborador na folha"
                copy="Marque “Recebe salário” e informe o valor no cadastro do usuário (Administração › Usuários)."
              />
            ) : (
              <>
                {summary.branches.length > 1 && (
                  <Totals
                    totals={summary.totals}
                    label="Totais de todas as filiais selecionadas"
                  />
                )}
                {summary.branches.map((branch) => (
                  <section
                    className="payroll-branch"
                    key={branch.branchId}
                    aria-label={`Folha de ${branch.branchName}`}
                  >
                    <div className="payroll-branch-head">
                      <h3>{branch.branchName}</h3>
                      <Totals
                        totals={branch.totals}
                        label={`Totais de ${branch.branchName}`}
                      />
                    </div>
                    {branch.lines.length === 0 ? (
                      <p className="payroll-branch-empty">
                        Nenhum colaborador nesta filial.
                      </p>
                    ) : (
                      <div className="finance-table finance-list payroll-table">
                        <div
                          className="finance-row finance-head"
                          aria-hidden="true"
                        >
                          <span>Colaborador</span>
                          <span className="finance-number">Salário</span>
                          <span className="finance-number">Comissões</span>
                          <span className="finance-number">Ajustes</span>
                          <span className="finance-amount">Total</span>
                          <span>Situação</span>
                          <span className="finance-actions">Ações</span>
                        </div>
                        {branch.lines.map((line) => {
                          const expanded = open.includes(line.employee.id);
                          const status = lineStatus(line);
                          return (
                            <div
                              className={`payroll-line${expanded ? " is-open" : ""}`}
                              key={line.employee.id}
                            >
                              <div className="finance-row">
                                <div className="finance-item">
                                  <strong>{line.employee.name}</strong>
                                  <span>
                                    {[
                                      line.employee.role,
                                      line.employee.professionalName,
                                      !line.employee.active && "Inativo",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "Sem comissão"}
                                  </span>
                                </div>
                                <span className="finance-number">
                                  <span className="finance-label">
                                    Salário{" "}
                                  </span>
                                  {money(line.salaryInCents)}
                                </span>
                                <span className="finance-number">
                                  <span className="finance-label">
                                    Comissões{" "}
                                  </span>
                                  {money(line.commissionInCents)}
                                </span>
                                <span className="finance-number">
                                  <span className="finance-label">
                                    Ajustes{" "}
                                  </span>
                                  {money(line.adjustmentInCents)}
                                </span>
                                <strong className="finance-amount">
                                  {money(line.totalInCents)}
                                </strong>
                                <span>
                                  <span
                                    className={`status-pill ${status.tone}`}
                                  >
                                    {status.label}
                                  </span>
                                </span>
                                <div className="finance-actions">
                                  <button
                                    type="button"
                                    className="secondary-button button-sm"
                                    aria-expanded={expanded}
                                    aria-label={`Detalhes da folha de ${line.employee.name}`}
                                    onClick={() =>
                                      setOpen((current) =>
                                        expanded
                                          ? current.filter(
                                              (id) => id !== line.employee.id,
                                            )
                                          : [...current, line.employee.id],
                                      )
                                    }
                                  >
                                    {expanded ? (
                                      <ChevronUp size={16} />
                                    ) : (
                                      <ChevronDown size={16} />
                                    )}
                                    {expanded ? "Ocultar" : "Detalhes"}
                                  </button>
                                  {canManage && !line.employee.userId && (
                                    <button
                                      type="button"
                                      className="secondary-button button-sm"
                                      aria-label={`Editar ${line.employee.name}`}
                                      onClick={() =>
                                        setEditing(
                                          employees.find(
                                            (item) =>
                                              item.id === line.employee.id,
                                          ) ?? line.employee,
                                        )
                                      }
                                    >
                                      Editar
                                    </button>
                                  )}
                                </div>
                              </div>
                              {expanded && (
                                <div className="payroll-detail">
                                  <section className="payroll-detail-block">
                                    <h4>Composição do mês</h4>
                                    {line.items.length === 0 ? (
                                      <p className="payroll-detail-empty">
                                        Nada nesta competência.
                                      </p>
                                    ) : (
                                      <ul
                                        className="payroll-detail-list"
                                        aria-label={`Itens de ${line.employee.name}`}
                                      >
                                        {groupItems(line.items).map((group) => (
                                          <li key={group.key}>
                                            <span className="payroll-detail-text">
                                              <span>{group.title}</span>
                                              {group.detail && (
                                                <small>{group.detail}</small>
                                              )}
                                            </span>
                                            <span className="payroll-detail-meta">
                                              {group.count > 1
                                                ? `${group.count} lançamentos`
                                                : ""}
                                            </span>
                                            <strong>
                                              {money(group.amountInCents)}
                                            </strong>
                                            <span
                                              className={`status-pill ${statusTones[group.status]}`}
                                            >
                                              {statusLabels[group.status]}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </section>
                                  {line.payables.length > 0 && (
                                    <section className="payroll-detail-block">
                                      <h4>Contas a pagar</h4>
                                      <ul
                                        className="payroll-detail-list"
                                        aria-label={`Despesas da folha de ${line.employee.name}`}
                                      >
                                        {line.payables.map((payable) => (
                                          <li key={payable.id}>
                                            <span className="payroll-detail-text">
                                              <span>{payable.description}</span>
                                              {canManage &&
                                                payable.status === "open" && (
                                                  <button
                                                    type="button"
                                                    className="secondary-button button-sm"
                                                    onClick={() =>
                                                      setUndoing(payable)
                                                    }
                                                  >
                                                    Desfazer lançamento
                                                  </button>
                                                )}
                                            </span>
                                            <span className="payroll-detail-meta">
                                              Vence{" "}
                                              {formatIsoDate(payable.dueDate)}
                                            </span>
                                            <strong>
                                              {money(payable.amountInCents)}
                                            </strong>
                                            <span
                                              className={`status-pill ${payable.status}`}
                                            >
                                              {payable.status === "paid"
                                                ? "Paga"
                                                : "Em aberto"}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </section>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>
      {editing && (
        <PayrollEmployeeModal
          employee={editing}
          professionals={professionals}
          branches={branches ?? []}
          takenProfessionalIds={employees.flatMap((item) =>
            item.professionalId && item.id !== editing.id
              ? [item.professionalId]
              : [],
          )}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await api.savePayrollEmployee(input, editing.id);
            toast.success("Colaborador atualizado.");
            setEditing(null);
            reload();
          }}
        />
      )}
      {launching && summary && (
        <PayrollLaunchModal
          summary={summary}
          branchIds={allSelected ? [] : selected}
          onClose={() => setLaunching(false)}
          onLaunch={async (input) => {
            const result = await api.launchPayroll(input, allBranches);
            toast.success(
              result.payables.length === 1
                ? "Folha lançada: 1 despesa em Contas a pagar."
                : `Folha lançada: ${result.payables.length} despesas em Contas a pagar.`,
            );
            setLaunching(false);
            reload();
          }}
        />
      )}
      {undoing && (
        <ActionModal
          eyebrow="Folha de pagamento"
          title="Desfazer lançamento"
          subtitle={undoing.description}
          effect="A despesa é cancelada e o salário, as comissões e os ajustes dela voltam a ficar a lançar."
          confirmLabel="Desfazer lançamento"
          danger
          onClose={() => setUndoing(null)}
          onConfirm={async () => {
            await api.cancelPayrollLaunch(undoing.id, allBranches);
            toast.success("Lançamento da folha desfeito.");
            setUndoing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
