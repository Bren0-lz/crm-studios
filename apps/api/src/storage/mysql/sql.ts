import { DEFAULT_CLINIC_TIMEZONE } from "../../modules/finance/daily-cash.js";
import type {
  QueryResult,
  Queryable,
} from "../../infrastructure/mysql-client.js";

/**
 * Trechos de SQL repetidos no repositório MySQL. As datas ficam em UTC (`DATETIME(6)`); o
 * dia e o mês "da clínica" saem de um deslocamento fixo do fuso da clínica, porque o MySQL
 * compartilhado da Hostinger não tem as tabelas de fusos nomeados. O Brasil não tem horário de verão desde 2019.
 */
export function utcOffsetOf(timeZone: string, at = new Date()) {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return match ? `${match[1]}:${match[2] ?? "00"}` : "+00:00";
}

export const CLINIC_UTC_OFFSET = utcOffsetOf(DEFAULT_CLINIC_TIMEZONE);

/** Deslocamento da clínica em minutos (ex.: -180). */
const offsetMinutes = (() => {
  const [hours, minutes] = CLINIC_UTC_OFFSET.split(":").map(Number);
  return (hours! < 0 ? -1 : 1) * (Math.abs(hours!) * 60 + minutes!);
})();

// Soma de intervalo em vez de CONVERT_TZ, que não converte datas fora da faixa de TIMESTAMP
// (depois de 2038) e devolveria o valor sem ajuste.

/** Instante UTC → data e hora locais da clínica. */
export const localTime = (expression: string) =>
  `((${expression}) + INTERVAL ${offsetMinutes} MINUTE)`;

/** Data e hora locais da clínica → instante UTC. */
export const utcTime = (expression: string) =>
  `((${expression}) - INTERVAL ${offsetMinutes} MINUTE)`;

/** Dia (aaaa-mm-dd) da clínica de um instante. */
export const localDate = (expression: string) =>
  `DATE(${localTime(expression)})`;

/** Mês (aaaa-mm) da clínica de um instante. */
export const localMonth = (expression: string) =>
  `DATE_FORMAT(${localTime(expression)}, '%Y-%m')`;

/** Início (UTC) do dia local `aaaa-mm-dd` informado. */
export const localDayStart = (dateExpression: string) =>
  utcTime(`CAST(${dateExpression} AS DATETIME(6))`);

/** Hoje no fuso da clínica. */
export const localToday = () => localDate("UTC_TIMESTAMP(6)");

/** `coluna` está no array JSON do parâmetro (equivale a `coluna = ANY($n)`). */
export const inJsonArray = (column: string, parameter: string) =>
  `JSON_CONTAINS(${parameter}, JSON_QUOTE(${column}))`;

/** Filial padrão da clínica do parâmetro. */
export const defaultBranchOf = (clinicParameter: string) =>
  `(SELECT b.id FROM branches b WHERE b.clinic_id = ${clinicParameter} AND b.is_default = 1)`;

/** Filial de uma gravação: a informada ou, se `NULL`, a padrão da clínica. */
export const branchOrDefault = (
  branchParameter: string,
  clinicParameter: string,
) => `COALESCE(${branchParameter}, ${defaultBranchOf(clinicParameter)})`;

type Row = Record<string, unknown>;

/**
 * INSERT de várias linhas a partir de objetos (`{ coluna: valor }`). `onDuplicate: "ignore"`
 * mantém a linha existente quando a chave já existe (o `ON CONFLICT DO NOTHING` do Postgres).
 */
export async function insertRows(
  client: Queryable,
  table: string,
  rows: readonly Row[],
  { onDuplicate }: { onDuplicate?: "ignore" } = {},
) {
  if (rows.length === 0) return 0;
  const columns = Object.keys(rows[0]!);
  const values: unknown[] = [];
  const tuples = rows.map(
    (row) =>
      `(${columns
        .map((column) => {
          values.push(row[column] ?? null);
          return `$${values.length}`;
        })
        .join(",")})`,
  );
  const result = await client.query(
    `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(",")})
     VALUES ${tuples.join(",")}${
       onDuplicate === "ignore"
         ? ` ON DUPLICATE KEY UPDATE "${columns[0]}" = "${columns[0]}"`
         : ""
     }`,
    values,
  );
  return result.rowCount;
}

/** Instante como texto ISO (`2026-01-01T10:00:00.000Z`) — para montar JSON na consulta. */
export const isoText = (expression: string) =>
  `DATE_FORMAT(${expression}, '%Y-%m-%dT%H:%i:%s.%fZ')`;

/** Instante como texto `aaaa-mm-dd hh:mm:ss.sss` em UTC (para JSON lido com `JSON_TABLE`). */
export const sqlTimestamp = (value: Date | string) =>
  new Date(value).toISOString().replace("T", " ").replace("Z", "");

/**
 * Última correção de datas do evento financeiro `eventAlias` (`LEFT JOIN` com alias
 * `correctionAlias`); no Postgres era um `LEFT JOIN LATERAL ... LIMIT 1`.
 */
export const latestDateCorrection = (
  correctionAlias: string,
  eventAlias: string,
  eventColumn: "receivable_event_id" | "payable_event_id",
) => `LEFT JOIN financial_date_corrections ${correctionAlias}
  ON ${correctionAlias}.id = (SELECT x.id FROM financial_date_corrections x
    WHERE x.clinic_id = ${eventAlias}.clinic_id AND x.${eventColumn} = ${eventAlias}.id
    ORDER BY x.revision DESC LIMIT 1)`;

/**
 * Grava e lê em seguida as linhas gravadas — o `UPDATE ... RETURNING` do Postgres. Sem linha
 * encontrada pela gravação, devolve vazio sem ler. `read` usa os mesmos parâmetros por padrão.
 */
export async function writeAndRead<T>(
  client: Queryable,
  write: string,
  params: readonly unknown[],
  read: string,
  readParams: readonly unknown[] = params,
): Promise<QueryResult<T>> {
  const written = await client.query(write, params);
  if (!written.rowCount) return { rows: [], rowCount: 0 };
  return client.query<T>(read, readParams);
}

/**
 * Regra de comissão vigente para a origem `a` (professional_id, service_id, starts_at) com
 * o profissional `pr`: regra do usuário antes da do profissional, por serviço antes da
 * geral, a de início mais recente. `JOIN` com alias `rule` (no Postgres, `JOIN LATERAL`).
 */
export const commissionRuleJoin = (clinicExpression: string) =>
  `JOIN commission_rules rule ON rule.id = (SELECT cr.id FROM commission_rules cr
    WHERE cr.clinic_id=${clinicExpression}
      AND (cr.professional_id=a.professional_id OR (pr.user_id IS NOT NULL AND cr.user_id=pr.user_id))
      AND cr.active AND (cr.service_id IS NULL OR cr.service_id=a.service_id)
      AND cr.effective_from<=${localDate("a.starts_at")}
      AND (cr.effective_until IS NULL OR cr.effective_until>=${localDate("a.starts_at")})
    ORDER BY (cr.user_id IS NOT NULL) DESC,(cr.service_id IS NOT NULL) DESC,cr.effective_from DESC LIMIT 1)`;

/** Cópia da regra aplicada, gravada no lançamento de comissão. */
export const commissionRuleSnapshot = `JSON_OBJECT('percentage',rule.percentage,'kind',rule.kind,'fixedAmountInCents',rule.fixed_amount_in_cents,'serviceId',rule.service_id,'effectiveFrom',rule.effective_from,'effectiveUntil',rule.effective_until)`;

/** Valor da comissão: fixo ou percentual arredondado do preço do serviço `s`. */
export const commissionAmount = `CASE WHEN rule.kind='fixed' THEN rule.fixed_amount_in_cents ELSE CAST(ROUND(s.price_in_cents*rule.percentage/100) AS SIGNED) END`;
