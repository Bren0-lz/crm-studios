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

/**
 * Troca as chaves de primeiro nível do objeto JSON `parameter` em `column` (o `||` do
 * Postgres), a partir do objeto gravado no parâmetro. O `JSON_MERGE_PATCH` sozinho mesclaria
 * também os objetos internos e apagaria as chaves `null`: as chaves saem antes, voltam com o
 * valor novo e as `null` ficam gravadas como `null`.
 */
export const replaceJsonKeys = (
  column: string,
  parameter: string,
  value: Record<string, unknown>,
) => {
  const paths = Object.keys(value).map((key) => {
    if (!/^\w+$/.test(key)) throw new Error(`Chave JSON inválida: ${key}`);
    return `'$.${key}'`;
  });
  const merged = `JSON_MERGE_PATCH(${paths.length ? `JSON_REMOVE(${column}, ${paths.join(", ")})` : column}, ${parameter})`;
  const nulls = Object.keys(value)
    .filter((key) => value[key] === null)
    .map((key) => `'$.${key}', NULL`);
  return nulls.length ? `JSON_SET(${merged}, ${nulls.join(", ")})` : merged;
};

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
 * Regra de comissão vigente para a origem `a` (professional_id, starts_at) com o profissional
 * `pr`: regra do usuário antes da do profissional, a de início mais recente. Só a comissão
 * geral: regras antigas por serviço ou de valor fixo não valem mais. `JOIN` com alias `rule`.
 */
export const commissionRuleJoin = (clinicExpression: string) =>
  `JOIN commission_rules rule ON rule.id = (SELECT cr.id FROM commission_rules cr
    WHERE cr.clinic_id=${clinicExpression}
      AND (cr.professional_id=a.professional_id OR (pr.user_id IS NOT NULL AND cr.user_id=pr.user_id))
      AND cr.active AND cr.service_id IS NULL AND cr.kind<>'fixed'
      AND cr.effective_from<=${localDate("a.starts_at")}
      AND (cr.effective_until IS NULL OR cr.effective_until>=${localDate("a.starts_at")})
    ORDER BY (cr.user_id IS NOT NULL) DESC,cr.effective_from DESC LIMIT 1)`;

/** Cópia da regra aplicada, gravada no lançamento de comissão. */
export const commissionRuleSnapshot = `JSON_OBJECT('percentage',rule.percentage,'effectiveFrom',rule.effective_from,'effectiveUntil',rule.effective_until)`;

/**
 * Base da comissão: o valor que o cliente pagou pelo atendimento/presença. Sessão consumida
 * de um plano (inclusive plano avulso; sessão estornada não conta) → valor do serviço no plano
 * com o desconto do cliente das cobranças, dividido pelas sessões (arredondado, meio para
 * cima); sem consumo de plano → NULL (não gera comissão; o preço de tabela e o plano avulso
 * só cadastrado não entram). Mesma regra de `commissionBaseInCents` (memória) e
 * `planSessionPaidValueInCents` (contratos).
 */
export function commissionBase(source: {
  clinic: string;
  appointmentId: string;
  attendanceId: string;
  serviceId: string;
}) {
  return `(SELECT COALESCE(CAST((2*pps.total_value_in_cents*GREATEST(pp.total_value_in_cents-COALESCE((SELECT SUM(r.customer_discount_in_cents) FROM receivables r WHERE r.clinic_id=pp.clinic_id AND r.plan_id=pp.id AND r.status<>'cancelled'),0),0)+pp.total_value_in_cents*pps.total_sessions) DIV NULLIF(2*pp.total_value_in_cents*pps.total_sessions,0) AS SIGNED),0)
      FROM session_movements sm
      JOIN patient_plans pp ON pp.id=sm.plan_id AND pp.clinic_id=sm.clinic_id
      JOIN patient_plan_services pps ON pps.clinic_id=pp.clinic_id AND pps.plan_id=pp.id AND pps.service_id=COALESCE(sm.service_id,${source.serviceId})
      WHERE sm.clinic_id=${source.clinic} AND sm.kind='consumption'
        AND (sm.appointment_id=${source.appointmentId} OR sm.group_attendance_id=${source.attendanceId})
        AND NOT EXISTS (SELECT 1 FROM session_movements rv WHERE rv.clinic_id=sm.clinic_id AND rv.plan_id=sm.plan_id AND rv.kind='reversal'
          AND (rv.appointment_id=${source.appointmentId} OR rv.group_attendance_id=${source.attendanceId}))
      ORDER BY sm.created_at,sm.id LIMIT 1)`;
}

/** Valor da comissão: percentual da regra sobre a base (`commissionBase`), arredondado. */
export function commissionAmount(base: string) {
  return `CAST(ROUND(${base}*rule.percentage/100) AS SIGNED)`;
}
