import {
  legacyPermissions,
  saoPauloToday,
  userRoleSchema,
  type AdminUser,
  type PermissionKey,
  type Professional,
  type UserRole,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { PermissionEditor } from "../../PermissionEditor";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { roleLabels } from "../../shared/lib/formatting";
import {
  isoDateLabel,
  loadCommissionProfessionals,
  parsePercentage,
  percentageLabel,
  percentageText,
  userSaveErrorMessage,
} from "./model";

export function UserFormModal({
  user,
  users,
  onUserUpdated,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  users: AdminUser[];
  onUserUpdated: (updated: AdminUser) => void;
  onClose: () => void;
  onSaved: (saved: AdminUser) => void;
}) {
  // Usuário já gravado (o editado ou o recém-criado numa falha parcial): a próxima tentativa
  // é PATCH, nunca outro POST.
  const [current, setCurrent] = useState<AdminUser | null>(user);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "user");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
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
  const [savedCommission, setSavedCommission] = useState({
    percentage: parsePercentage(percentageText(user?.commissionPercentage)),
    effectiveFrom: today,
  });
  const [professionals, setProfessionals] = useState<Professional[] | null>(
    null,
  );
  const [professionalsError, setProfessionalsError] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState(
    user?.professionalId ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = role === "admin";
  // Fontes para copiar: usuários comuns já cadastrados, menos o próprio.
  const copySources = users.filter(
    (item) => item.role === "user" && item.id !== current?.id,
  );

  useEffect(() => {
    let active = true;
    loadCommissionProfessionals(
      (items) => {
        if (active) setProfessionals(items);
      },
      (message) => {
        if (active) setProfessionalsError(message);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Livres: sem os já ligados a outros usuários; o do próprio usuário continua na lista.
  const taken = new Set(
    users
      .filter((item) => item.id !== current?.id && item.professionalId)
      .map((item) => item.professionalId),
  );
  const professionalOptions = (professionals ?? []).filter(
    (item) =>
      item.id === current?.professionalId ||
      (item.active && !taken.has(item.id)),
  );

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

  function commissionError() {
    if (typedPercentage === undefined) {
      return savedCommission.percentage === undefined
        ? ""
        : "A comissão não pode ficar em branco: para não pagar comissão, informe 0%.";
    }
    if (!commissionChanged) return "";
    if (
      Number.isNaN(typedPercentage) ||
      typedPercentage < 0 ||
      typedPercentage > 100
    ) {
      return "Informe um percentual de comissão entre 0 e 100.";
    }
    if (!effectiveFrom)
      return "Informe a data em que a comissão passa a valer.";
    return "";
  }

  /**
   * Um botão grava tudo: dados e módulos (POST/PATCH), depois a ligação com o profissional
   * e a comissão (PUT), cada um só se mudou. Se um PUT falhar, o que já foi gravado fica.
   */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const invalid = commissionError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    // Admin ou nada marcado grava `null` (admin: acesso total; usuário comum: nenhum módulo).
    const permissions = { permissions: isAdmin ? [] : selectedPermissions };
    const title = jobTitle.trim();
    const commission =
      commissionChanged && typedPercentage !== undefined
        ? { percentage: typedPercentage, effectiveFrom }
        : undefined;
    let latest: AdminUser;
    try {
      latest = current
        ? await api.updateAdminUser(current.id, {
            fullName: fullName.trim(),
            role,
            active: current.active,
            jobTitle: title,
            ...permissions,
          })
        : await api.createAdminUser({
            fullName: fullName.trim(),
            email: email.trim(),
            password,
            role,
            ...(title ? { jobTitle: title } : {}),
            ...permissions,
            ...(commission ? { commission } : {}),
          });
    } catch (cause) {
      setError(userSaveErrorMessage(cause));
      setSaving(false);
      return;
    }
    // Na criação a comissão já foi junto no POST.
    const commissionByPut = current !== null ? commission : undefined;
    if (commission && !commissionByPut) {
      setSavedCommission({ percentage: commission.percentage, effectiveFrom });
    }
    let failed: "professional" | "commission" = "professional";
    try {
      if (selectedProfessional !== (latest.professionalId ?? "")) {
        latest = await api.setUserProfessional(
          latest.id,
          selectedProfessional || null,
        );
      }
      failed = "commission";
      if (commissionByPut) {
        latest = await api.setUserCommission(latest.id, commissionByPut);
      }
      onSaved(latest);
    } catch (cause) {
      const saved = latest;
      setCurrent(saved);
      onUserUpdated(saved);
      const part =
        failed === "professional"
          ? "a ligação com o profissional da agenda não foi salva"
          : "a comissão não foi salva";
      setError(
        `${current ? "Dados do usuário salvos" : `Usuário ${saved.fullName} criado`}, mas ${part}: ${(cause as Error).message} Ajuste e clique em “Salvar alterações” de novo.`,
      );
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
                minLength={10}
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
        {!current && (
          <p className="muted-copy span-2">
            A senha precisa de 10 caracteres ou mais, com letra maiúscula,
            minúscula e número. O cargo é só informativo: o acesso vem dos
            módulos abaixo.
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
                ? `Vigente hoje: ${percentageLabel.format(current.commissionPercentage)}%${current.commissionEffectiveFrom ? ` desde ${isoDateLabel(current.commissionEffectiveFrom)}` : ""}. Um percentual ou data novos criam uma nova vigência; o histórico é mantido.`
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
                  ? `Data futura: o percentual atual (${percentageLabel.format(current.commissionPercentage)}%) continua valendo até ${isoDateLabel(effectiveFrom)}.`
                  : `Data futura: a comissão só passa a valer em ${isoDateLabel(effectiveFrom)}.`}
              </p>
            )}
            {professionals === null && !professionalsError ? (
              <LoadingBlock />
            ) : professionalsError ? (
              <div className="form-error" role="alert">
                Não foi possível carregar os profissionais da agenda:{" "}
                {professionalsError}
              </div>
            ) : (
              <label>
                Profissional da agenda (opcional)
                <select
                  value={selectedProfessional}
                  onChange={(event) =>
                    setSelectedProfessional(event.target.value)
                  }
                >
                  <option value="">Nenhum</option>
                  {professionalOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted-copy">
              Ligue o profissional da agenda para contar os atendimentos desta
              pessoa na comissão.
            </p>
          </div>
        </fieldset>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving
              ? "Salvando…"
              : current
                ? "Salvar alterações"
                : "Criar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
