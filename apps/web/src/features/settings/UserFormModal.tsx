import { UserAgendaFields } from "./UserAgendaFields";
import { UserServiceCommissionFields } from "./UserServiceCommissionFields";
import { useServiceCommissions } from "./useServiceCommissions";
import { useUserAgenda } from "./useUserAgenda";
import { CommissionRecalculationNotice } from "../finance/index";
import {
  legacyPermissions,
  saoPauloToday,
  userRoleSchema,
  type AdminUser,
  type AdminUserCommissionInput,
  type Branch,
  type CommissionRecalculationPreview,
  type PermissionKey,
  type UserRole,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { PermissionEditor } from "../../PermissionEditor";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { useMissingFields } from "../../shared/components/MissingFields";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { roleLabels, sentence } from "../../shared/lib/formatting";
import {
  isoDateLabel,
  parsePercentage,
  percentageLabel,
  percentageText,
  userSaveErrorMessage,
} from "./model";

export function UserFormModal({
  user,
  users,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  users: AdminUser[];
  onClose: () => void;
  onSaved: (saved: AdminUser) => void;
}) {
  const current = user;
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "user");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  // Usuário comum novo (ou admin sendo rebaixado) começa com tudo desmarcado: não há padrão.
  const [selectedPermissions, setSelectedPermissions] = useState<
    PermissionKey[]
  >(() =>
    user?.role === "user"
      ? (user.permissions ??
        legacyPermissions("user", user.modules, user.editModules))
      : [],
  );
  const [copiedFrom, setCopiedFrom] = useState("");
  // Comissão: percentual vigente e data de hoje; só vira nova vigência se algo mudar.
  const today = saoPauloToday();
  const [percentage, setPercentage] = useState(
    percentageText(user?.commissionPercentage),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [savedCommission] = useState({
    percentage: parsePercentage(percentageText(user?.commissionPercentage)),
    effectiveFrom: today,
  });
  // Folha de pagamento: só quem recebe salário entra nela (a folha não cadastra ninguém).
  const [receivesSalary, setReceivesSalary] = useState(
    user?.salaryInCents !== undefined,
  );
  const [salary, setSalary] = useState(user?.salaryInCents ?? 0);
  const agenda = useUserAgenda(user, users, fullName);
  const serviceCommissions = useServiceCommissions(user);
  // Filiais: só aparecem quando a rede tem mais de uma (admin sempre acessa todas).
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allBranches, setAllBranches] = useState(user?.allBranches ?? true);
  const [branchIds, setBranchIds] = useState<string[]>(user?.branchIds ?? []);
  const [dashboardAccess, setDashboardAccess] = useState(
    user?.dashboardAccess ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Prévia do recálculo das comissões já lançadas e as regras que ela descreve.
  const [recalculation, setRecalculation] = useState<{
    key: string;
    data: CommissionRecalculationPreview;
  } | null>(null);
  const dirty = useFormDirty({
    allBranches,
    branchIds,
    fullName,
    email,
    password,
    role,
    jobTitle,
    whatsapp,
    selectedPermissions,
    percentage,
    effectiveFrom,
    receivesSalary,
    salary,
    serviceCommissions: serviceCommissions.rows,
    agenda: {
      attends: agenda.attends,
      mode: agenda.mode,
      selected: agenda.selected,
      draft: agenda.draft,
    },
  });
  const isAdmin = role === "admin";
  // Fontes para copiar: usuários comuns já cadastrados, menos o próprio.
  const copySources = users.filter(
    (item) => item.role === "user" && item.id !== current?.id,
  );

  useEffect(() => {
    let active = true;
    api
      .adminBranches()
      .then((items) => {
        if (active && Array.isArray(items))
          setBranches(items.filter((item) => item.active));
      })
      .catch(() => {
        // Sem a lista, o acesso às filiais fica como está.
      });
    return () => {
      active = false;
    };
  }, []);
  const choosesBranches = branches.length > 1 && !isAdmin;

  const typedPercentage = parsePercentage(percentage);
  const commissionChanged =
    typedPercentage !== undefined &&
    (Number.isNaN(typedPercentage) ||
      typedPercentage !== savedCommission.percentage ||
      effectiveFrom !== savedCommission.effectiveFrom);
  const futureStart =
    commissionChanged && Boolean(effectiveFrom) && effectiveFrom > today;
  // Mesma data da vigência atual: a API corrige o percentual dela em vez de criar outra.
  const sameStart =
    commissionChanged &&
    Boolean(current?.commissionEffectiveFrom) &&
    effectiveFrom === current?.commissionEffectiveFrom;

  function copyPermissions(sourceId: string) {
    const source = copySources.find((item) => item.id === sourceId);
    if (!source) return;
    setSelectedPermissions(
      source.permissions ??
        legacyPermissions("user", source.modules, source.editModules),
    );
    setCopiedFrom(source.fullName);
  }

  // O que falta: o botão principal fica desativado listando os campos (QM14).
  const missing = useMissingFields([
    ...agenda.missing,
    ...(fullName.trim().length < 3
      ? ["Nome completo (pelo menos 3 caracteres)"]
      : []),
    ...(!current && !email.trim() ? ["E-mail de acesso"] : []),
    ...(!current && !password ? ["Senha inicial"] : []),
    // Já havia comissão: em branco não vale (para não pagar, 0%).
    ...(typedPercentage === undefined &&
    savedCommission.percentage !== undefined
      ? ["Comissão (%) — para não pagar comissão, informe 0%"]
      : []),
    ...(commissionChanged && !effectiveFrom ? ["Vale a partir de"] : []),
    ...(receivesSalary && salary <= 0 ? ["Salário mensal"] : []),
    ...serviceCommissions.missing,
  ]);

  const commission =
    commissionChanged && typedPercentage !== undefined
      ? { percentage: typedPercentage, effectiveFrom }
      : undefined;
  // Regras que o salvamento grava; a prévia do recálculo vale só para estas.
  const commissionRules: AdminUserCommissionInput[] = [
    ...(commission ? [commission] : []),
    ...serviceCommissions.payload,
  ];
  const recalculationKey = JSON.stringify(commissionRules);
  const confirmedRecalculation =
    recalculation?.key === recalculationKey ? recalculation.data : null;

  /** Regra do percentual informado (não é falta de campo). */
  function commissionError() {
    if (typedPercentage === undefined || !commissionChanged) return "";
    if (
      Number.isNaN(typedPercentage) ||
      typedPercentage < 0 ||
      typedPercentage > 100
    ) {
      return "Informe um percentual de comissão entre 0 e 100.";
    }
    return "";
  }

  // O servidor grava todo o formulário em uma única transação.
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const invalid =
      commissionError() ||
      serviceCommissions.validate() ||
      (whatsapp && whatsapp.length < 10
        ? "Informe o WhatsApp com DDD, por exemplo (11) 99999-9999."
        : "") ||
      (choosesBranches && !allBranches && branchIds.length === 0
        ? "Selecione ao menos uma filial."
        : "");
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    // Admin ou nada marcado grava `null` (admin: acesso total; usuário comum: nenhum módulo).
    const permissions = {
      permissions: isAdmin ? [] : selectedPermissions,
      ...(choosesBranches
        ? {
            branchAccess: {
              allBranches,
              branchIds: allBranches ? [] : branchIds,
            },
          }
        : {}),
    };
    const title = jobTitle.trim();
    // Edição: só envia o salário quando muda (ausente mantém o gravado).
    const nextSalary = receivesSalary ? salary : null;
    const salaryInput =
      nextSalary !== (current?.salaryInCents ?? null)
        ? { salaryInCents: nextSalary }
        : {};
    const services = serviceCommissions.payload.length
      ? { serviceCommissions: serviceCommissions.payload }
      : {};
    let latest: AdminUser;
    try {
      // Regra com início até hoje recalcula as comissões já lançadas: mostra antes o que muda.
      // Trocando o profissional ligado no mesmo salvamento, a prévia (feita com o vínculo
      // atual) não vale: o servidor recalcula sem conferir.
      let digest = confirmedRecalculation?.digest;
      if (
        current &&
        !agenda.operation &&
        !digest &&
        commissionRules.some((rule) => rule.effectiveFrom <= today)
      ) {
        const data = await api.commissionRecalculationPreview({
          userId: current.id,
          rules: commissionRules,
        });
        if (data.items.length) {
          setRecalculation({ key: recalculationKey, data });
          return;
        }
        digest = data.digest;
      }
      latest = current
        ? await api.updateAdminUser(current.id, {
            fullName: fullName.trim(),
            role,
            active: current.active,
            jobTitle: title,
            // Ausente mantém o número gravado; vazio remove.
            ...(whatsapp !== (current.whatsapp ?? "") ? { whatsapp } : {}),
            ...permissions,
            ...(dashboardAccess !== (current.dashboardAccess ?? false)
              ? { dashboardAccess }
              : {}),
            ...salaryInput,
            ...(commission ? { commission } : {}),
            ...services,
            ...(agenda.operation ? { professional: agenda.operation } : {}),
            ...(digest ? { recalculationDigest: digest } : {}),
          })
        : await api.createAdminUser({
            fullName: fullName.trim(),
            email: email.trim(),
            password,
            role,
            ...(title ? { jobTitle: title } : {}),
            ...(whatsapp ? { whatsapp } : {}),
            ...permissions,
            ...(dashboardAccess ? { dashboardAccess } : {}),
            ...salaryInput,
            ...(commission ? { commission } : {}),
            ...services,
            ...(agenda.operation ? { professional: agenda.operation } : {}),
          });
      onSaved(latest);
    } catch (cause) {
      setError(userSaveErrorMessage(cause));
      setRecalculation(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={current ? `Editar ${current.fullName}` : "Novo usuário"}
      subtitle={
        current
          ? current.email
          : "Acesso da equipe ao sistema, com cargo e módulos."
      }
      eyebrow="Usuários"
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nome completo
          <input
            required
            minLength={3}
            maxLength={160}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        {!current && (
          <>
            <label>
              E-mail de acesso
              <input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Senha inicial
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Tipo
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {userRoleSchema.options.map((item) => (
              <option value={item} key={item}>
                {roleLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cargo
          <input
            maxLength={80}
            placeholder="Ex.: Instrutora de Pilates"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </label>
        <div className="field-with-hint">
          <label>
            WhatsApp
            <PhoneInput value={whatsapp} onChange={setWhatsapp} />
          </label>
          <small className="field-hint">
            Usado para compartilhar a agenda do profissional.
          </small>
        </div>
        {!current && (
          <p className="muted-copy span-2">
            O cargo é só informativo: o acesso vem dos módulos abaixo.
          </p>
        )}
        <fieldset className="form-fieldset span-2">
          <legend>Permissões</legend>
          {isAdmin ? (
            <p className="muted-copy">
              Acesso total: o admin vê e edita todos os módulos, além da
              Administração.
            </p>
          ) : (
            <div className="permission-editor">
              {copySources.length > 0 && (
                <div className="permission-editor-head">
                  <label>
                    Copiar permissões de…
                    <select
                      value=""
                      onChange={(event) => copyPermissions(event.target.value)}
                    >
                      <option value="">Escolha um usuário</option>
                      {copySources.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {copiedFrom && (
                    <p className="muted-copy" role="status">
                      Permissões copiadas de {copiedFrom}. Ajuste abaixo antes
                      de salvar, se precisar.
                    </p>
                  )}
                </div>
              )}
              <PermissionEditor
                value={selectedPermissions}
                onChange={setSelectedPermissions}
              />
              <p className="muted-copy">
                “Visão geral” aparece para todos; Administração (usuários,
                feriados e dados da clínica) é sempre só do admin.
              </p>
            </div>
          )}
        </fieldset>
        {choosesBranches && (
          <fieldset className="form-fieldset span-2">
            <legend>Filiais</legend>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={allBranches}
                onChange={(event) => setAllBranches(event.target.checked)}
              />
              Acessa todas as filiais
            </label>
            {!allBranches &&
              branches.map((branch) => (
                <label className="checkbox-field" key={branch.id}>
                  <input
                    type="checkbox"
                    checked={branchIds.includes(branch.id)}
                    onChange={(event) =>
                      setBranchIds((current) =>
                        event.target.checked
                          ? [...current, branch.id]
                          : current.filter((id) => id !== branch.id),
                      )
                    }
                  />
                  {branch.name}
                </label>
              ))}
          </fieldset>
        )}
        <fieldset className="form-fieldset span-2">
          <legend>Painel de vendas</legend>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={dashboardAccess}
              onChange={(event) => setDashboardAccess(event.target.checked)}
            />
            Acessa o painel de vendas
          </label>
          <p className="muted-copy">
            Permissão especial: vale também para o admin, que só entra no painel
            com ela marcada. No painel, a pessoa vê e faz só o que as permissões
            acima permitem.
          </p>
        </fieldset>
        <UserAgendaFields agenda={agenda} />
        <fieldset className="form-fieldset span-2">
          <legend>Folha de pagamento</legend>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={receivesSalary}
              onChange={(event) => setReceivesSalary(event.target.checked)}
            />
            Recebe salário
          </label>
          {receivesSalary && (
            <div className="form-fieldset-grid">
              <CurrencyField
                label="Salário mensal"
                required
                value={salary}
                onChange={setSalary}
              />
            </div>
          )}
          <p className="muted-copy">
            {receivesSalary
              ? "Entra na folha de pagamento (Financeiro › Folha) com este salário e, se atende, as comissões."
              : "Sem salário, a pessoa fica fora da folha de pagamento; só as comissões de quem atende continuam sendo pagas por ela."}
          </p>
        </fieldset>
        <fieldset className="form-fieldset span-2">
          <legend>Comissão</legend>
          <div className="commission-editor">
            <div className="form-fieldset-grid">
              <label>
                Comissão (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Sem comissão"
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </label>
              <label>
                Vale a partir de
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </label>
            </div>
            <p className="muted-copy">
              {current?.commissionPercentage !== undefined
                ? `${sentence(`Vigente hoje: ${percentageLabel.format(current.commissionPercentage)}%${current.commissionEffectiveFrom ? ` desde ${isoDateLabel(current.commissionEffectiveFrom)}` : ""}`)} Um percentual ou data novos criam uma nova vigência; o histórico é mantido.`
                : "Percentual sobre os atendimentos desta pessoa. Deixe em branco se ela não recebe comissão."}
            </p>
            {sameStart && (
              <p className="muted-copy" role="status">
                Vai corrigir o percentual desta vigência.
              </p>
            )}
            {futureStart && (
              <p className="muted-copy" role="status">
                {current?.commissionPercentage !== undefined
                  ? `Data futura: o percentual atual (${percentageLabel.format(current.commissionPercentage)}%) continua valendo até ${sentence(isoDateLabel(effectiveFrom))}`
                  : `Data futura: a comissão só passa a valer em ${sentence(isoDateLabel(effectiveFrom))}`}
              </p>
            )}
          </div>
        </fieldset>
        <UserServiceCommissionFields commissions={serviceCommissions} />
        {confirmedRecalculation && (
          <CommissionRecalculationNotice preview={confirmedRecalculation} />
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            {saving
              ? "Salvando…"
              : confirmedRecalculation
                ? "Confirmar e recalcular"
                : current
                  ? "Salvar alterações"
                  : "Criar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
