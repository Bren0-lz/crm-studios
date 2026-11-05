import {
  currentReceiptSignatureSummary,
  receiptSignatureReversalReason,
  receiptSignatureStatus,
  type DocumentSignatureLinkView,
  type PublicDocumentSignInput,
  type PublicRequestMetadata,
  type ReceiptSignature,
  type ReceiptSignatureSummary,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import {
  assertReceiptNotCancelled,
  assertReceiptSignable,
} from "../../modules/finance/receipt-signatures.js";
import {
  appendSignatureView,
  createSignatureToken,
  signerEvidence,
} from "../../modules/signatures/signature-evidence.js";
import type { MysqlRepositoryContext } from "./context.js";
import { branchClause, json } from "./helpers.js";

const columns = `rs.id, rs.clinic_id AS "clinicId", rs.receivable_id AS "receivableId",
  r.patient_id AS "patientId", rs.paid_at AS "paidAt", rs.amount_in_cents AS "amountInCents",
  rs.token, rs.created_at AS "createdAt", rs.sent_at AS "sentAt", rs.view_count AS "viewCount",
  rs.first_viewed_at AS "firstViewedAt", rs.last_viewed_at AS "lastViewedAt", rs.views,
  rs.signed_at AS "signedAt", rs.signature, rs.signature_image AS "signatureImage",
  rs.cancelled_at AS "cancelledAt", rs.cancel_reason AS "cancelReason"`;
const from = `FROM receipt_signatures rs
  JOIN receivables r ON r.id = rs.receivable_id AND r.clinic_id = rs.clinic_id`;

interface Row {
  id: string;
  clinicId: string;
  receivableId: string;
  patientId: string;
  paidAt: Date;
  amountInCents: number;
  token: string;
  createdAt: Date;
  sentAt: Date | null;
  viewCount: number;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  views: unknown;
  signedAt: Date | null;
  signature: unknown;
  signatureImage: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

interface StoredSignature {
  signerName: string;
  signerCpf?: string;
  ipAddress?: string;
  userAgent?: string;
}

const iso = (value: Date | null) => value?.toISOString();

function map(row: Row): ReceiptSignature {
  const signature = row.signature ? json<StoredSignature>(row.signature) : null;
  const optional = {
    sentAt: iso(row.sentAt),
    firstViewedAt: iso(row.firstViewedAt),
    lastViewedAt: iso(row.lastViewedAt),
    signedAt: iso(row.signedAt),
    signerName: signature?.signerName,
    signerCpf: signature?.signerCpf,
    signerIpAddress: signature?.ipAddress,
    signerUserAgent: signature?.userAgent,
    signatureImage: row.signatureImage ?? undefined,
    cancelledAt: iso(row.cancelledAt),
    cancelReason: row.cancelReason ?? undefined,
  };
  const receipt = {
    id: row.id,
    clinicId: row.clinicId,
    receivableId: row.receivableId,
    patientId: row.patientId,
    paidAt: row.paidAt.toISOString(),
    amountInCents: Number(row.amountInCents),
    token: row.token,
    createdAt: row.createdAt.toISOString(),
    viewCount: Number(row.viewCount),
    views: json<DocumentSignatureLinkView[]>(row.views ?? []),
    ...Object.fromEntries(
      Object.entries(optional).filter(([, value]) => value !== undefined),
    ),
  } as Omit<ReceiptSignature, "status">;
  return { ...receipt, status: receiptSignatureStatus(receipt) };
}

/**
 * Recibo da baixa que acabou de ser gravada, na transação de quem chama: valor e data vêm da
 * própria parcela já paga.
 */
export async function issueReceiptSignature(
  client: PoolClient,
  clinicId: string,
  receivableId: string,
) {
  await client.query(
    `INSERT INTO receipt_signatures
       (id, clinic_id, receivable_id, paid_at, amount_in_cents, token)
     SELECT $3, r.clinic_id, r.id, COALESCE(r.paid_at, NOW(6)), r.amount_in_cents, $4
       FROM receivables r
      WHERE r.clinic_id = $1 AND r.id = $2 AND r.status = 'paid'`,
    [clinicId, receivableId, randomUUID(), createSignatureToken()],
  );
}

/** Estorno da baixa (mesma transação): o recibo em aberto ou assinado fica cancelado. */
export async function cancelReceiptSignatures(
  client: PoolClient,
  clinicId: string,
  receivableId: string,
) {
  await client.query(
    `UPDATE receipt_signatures SET cancelled_at = NOW(6), cancel_reason = $3
      WHERE clinic_id = $1 AND receivable_id = $2 AND cancelled_at IS NULL`,
    [clinicId, receivableId, receiptSignatureReversalReason],
  );
}

/**
 * Resumo do recibo em vigor de cada parcela (RC4), para a listagem do Financeiro: uma consulta
 * só, nas filiais da leitura (`null` = todas). Só entram os recibos não cancelados.
 */
export async function loadReceiptSignatureSummaries(
  client: Pool | PoolClient,
  clinicId: string,
  branchIds: string[] | null,
) {
  const result = await client.query<{
    receivableId: string;
    viewCount: number;
    sentAt: Date | null;
    firstViewedAt: Date | null;
    signedAt: Date | null;
  }>(
    `SELECT rs.receivable_id AS "receivableId", rs.view_count AS "viewCount",
            rs.sent_at AS "sentAt", rs.first_viewed_at AS "firstViewedAt",
            rs.signed_at AS "signedAt"
       ${from}
      WHERE rs.clinic_id = $1 AND rs.cancelled_at IS NULL
        AND ${branchClause("r.branch_id", 2)}
      ORDER BY rs.created_at, rs.id`,
    [clinicId, branchIds],
  );
  const byReceivable = new Map<string, (typeof result.rows)[number][]>();
  for (const row of result.rows)
    byReceivable.set(row.receivableId, [
      ...(byReceivable.get(row.receivableId) ?? []),
      row,
    ]);
  const summaries = new Map<string, ReceiptSignatureSummary>();
  for (const [receivableId, rows] of byReceivable) {
    const summary = currentReceiptSignatureSummary(
      rows.map((row) => ({
        viewCount: Number(row.viewCount),
        sentAt: iso(row.sentAt),
        firstViewedAt: iso(row.firstViewedAt),
        signedAt: iso(row.signedAt),
      })),
    );
    if (summary) summaries.set(receivableId, summary);
  }
  return summaries;
}

async function findById(client: Pool | PoolClient, id: string) {
  const result = await client.query<Row>(
    `SELECT ${columns} ${from} WHERE rs.id = $1`,
    [id],
  );
  return result.rows[0] ? map(result.rows[0]) : null;
}

/** Recibo pelo token, travado para registrar visualização ou assinatura. */
async function lockByToken(client: PoolClient, token: string) {
  const result = await client.query<Row>(
    `SELECT ${columns} ${from} WHERE rs.token = $1 FOR UPDATE`,
    [token],
  );
  return result.rows[0] ? map(result.rows[0]) : null;
}

export function createReceiptSignaturesRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async listReceiptSignatures(clinicId: string, receivableId: string) {
      const receivable = (
        await context.pool.query<{ branchId: string }>(
          `SELECT branch_id AS "branchId" FROM receivables WHERE clinic_id = $1 AND id = $2`,
          [clinicId, receivableId],
        )
      ).rows[0];
      const readIds = context.branchReadIds();
      if (!receivable || (readIds && !readIds.includes(receivable.branchId)))
        return [];
      const result = await context.pool.query<Row>(
        `SELECT ${columns} ${from}
          WHERE rs.clinic_id = $1 AND rs.receivable_id = $2
          ORDER BY rs.created_at, rs.id`,
        [clinicId, receivableId],
      );
      return result.rows.map(map);
    },

    async markReceiptSignatureSent(clinicId: string, receiptId: string) {
      return context.inTransaction(async (client) => {
        const current = (
          await client.query<{ cancelledAt: Date | null }>(
            `SELECT cancelled_at AS "cancelledAt" FROM receipt_signatures
              WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
            [clinicId, receiptId],
          )
        ).rows[0];
        if (!current) return null;
        assertReceiptNotCancelled({ cancelledAt: iso(current.cancelledAt) });
        await client.query(
          `UPDATE receipt_signatures SET sent_at = COALESCE(sent_at, NOW(6))
            WHERE clinic_id = $1 AND id = $2`,
          [clinicId, receiptId],
        );
        return findById(client, receiptId);
      });
    },

    async openPublicReceiptSignature(
      token: string,
      metadata: PublicRequestMetadata,
    ) {
      return context.inTransaction(async (client) => {
        const receipt = await lockByToken(client, token);
        if (!receipt) return null;
        const viewedAt = new Date().toISOString();
        await client.query(
          `UPDATE receipt_signatures
              SET view_count = view_count + 1,
                  first_viewed_at = COALESCE(first_viewed_at, $2),
                  last_viewed_at = $2,
                  views = $3
            WHERE id = $1`,
          [
            receipt.id,
            viewedAt,
            JSON.stringify(
              appendSignatureView(receipt.views, metadata, viewedAt),
            ),
          ],
        );
        return findById(client, receipt.id);
      });
    },

    async signPublicReceiptSignature(
      token: string,
      input: PublicDocumentSignInput,
      metadata: PublicRequestMetadata,
    ) {
      return context.inTransaction(async (client) => {
        const receipt = await lockByToken(client, token);
        if (!receipt) return null;
        assertReceiptSignable(receipt);
        await client.query(
          `UPDATE receipt_signatures
              SET signed_at = NOW(6), signature = $2, signature_image = $3
            WHERE id = $1`,
          [
            receipt.id,
            JSON.stringify(signerEvidence(input, metadata)),
            input.signatureImage,
          ],
        );
        return findById(client, receipt.id);
      });
    },
  };
}
