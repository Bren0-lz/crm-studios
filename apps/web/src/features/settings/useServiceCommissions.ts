import {
  saoPauloToday,
  type AdminUser,
  type AdminUserServiceCommissionInput,
  type Service,
} from "@crm/contracts";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { parsePercentage } from "./model";

/** Linha nova de comissão por serviço no formulário do usuário. */
export interface ServiceCommissionDraft {
  key: number;
  serviceId: string;
  kind: "percentage" | "fixed";
  percentage: string;
  fixedAmountInCents: number;
  effectiveFrom: string;
}

/**
 * Comissões por serviço do formulário de usuário: as regras gravadas ficam só para consulta
 * (histórico mantido) e cada linha nova vira uma vigência no mesmo salvamento.
 */
export function useServiceCommissions(user: AdminUser | null) {
  const today = saoPauloToday();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<ServiceCommissionDraft[]>([]);
  const nextKey = useRef(0);
  const saved = user?.serviceCommissions ?? [];

  useEffect(() => {
    let active = true;
    api
      .services()
      .then((items) => {
        if (active) setServices(items.filter((item) => item.active));
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function add(serviceId = "") {
    nextKey.current += 1;
    const key = nextKey.current;
    setRows((current) => [
      ...current,
      {
        key,
        serviceId,
        kind: "percentage",
        percentage: "",
        fixedAmountInCents: 0,
        effectiveFrom: today,
      },
    ]);
  }

  function change(key: number, patch: Partial<ServiceCommissionDraft>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  const missing = rows.flatMap((row, index) => {
    const position = index + 1;
    return [
      ...(row.serviceId ? [] : [`Serviço da comissão ${position}`]),
      ...(row.kind === "percentage" && row.percentage.trim() === ""
        ? [`Comissão do serviço ${position} (%)`]
        : []),
      ...(row.effectiveFrom
        ? []
        : [`Vale a partir de (comissão do serviço ${position})`]),
    ];
  });

  /** Regras dos valores informados (não é falta de campo). */
  function validate() {
    for (const row of rows) {
      const value = parsePercentage(row.percentage);
      if (
        row.kind === "percentage" &&
        (value === undefined || Number.isNaN(value) || value < 0 || value > 100)
      )
        return "Informe um percentual de comissão por serviço entre 0 e 100.";
    }
    const starts = rows.map((row) => `${row.serviceId}|${row.effectiveFrom}`);
    if (new Set(starts).size !== starts.length)
      return "O mesmo serviço aparece duas vezes com a mesma data de início.";
    return "";
  }

  const payload: AdminUserServiceCommissionInput[] = rows.map((row) =>
    row.kind === "fixed"
      ? {
          serviceId: row.serviceId,
          kind: "fixed",
          percentage: 0,
          fixedAmountInCents: row.fixedAmountInCents,
          effectiveFrom: row.effectiveFrom,
        }
      : {
          serviceId: row.serviceId,
          percentage: parsePercentage(row.percentage) ?? 0,
          effectiveFrom: row.effectiveFrom,
        },
  );

  return {
    today,
    services,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setError("");
      setAttempt((current) => current + 1);
    },
    saved,
    rows,
    add,
    change,
    remove,
    missing,
    validate,
    payload,
  };
}
