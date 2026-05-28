import { randomBytes } from "node:crypto";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Schema } from "effect";
import {
  AuditEvent,
  AuditEventSequence,
  AuditLog,
  AuditRecord,
} from "../../../Application/Ports/AuditLog.js";

const AuditEventRow = Schema.Struct({
  sequence: Schema.Number,
  timestamp: Schema.String,
  sourceIp: Schema.String,
  userAgent: Schema.String,
  method: Schema.String,
  targetUrl: Schema.String,
  matchedCredentialId: Schema.NullOr(Schema.String),
  upstreamStatus: Schema.NullOr(Schema.Number),
  errorCode: Schema.NullOr(Schema.String),
  outcome: Schema.String,
});
type AuditEventRow = Schema.Schema.Type<typeof AuditEventRow>;

export const AuditLogSqlite = Layer.effect(
  AuditLog,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      record: (auditRecord: AuditRecord) =>
        Schema.decodeUnknown(AuditRecord)(auditRecord).pipe(
          Effect.flatMap(
            (record) => sql`INSERT INTO audit_logs (
          audit_log_id,
          audit_sequence,
          event_type,
          subject,
          metadata_json,
          source_ip,
          user_agent,
          method,
          target_url,
          matched_credential_id,
          upstream_status,
          error_code,
          outcome,
          created_at
        ) VALUES (
          ${generateAuditLogId()},
          (SELECT COALESCE(MAX(audit_sequence), 0) + 1 FROM audit_logs),
          ${record.outcome},
          ${record.targetUrl},
          ${JSON.stringify({})},
          ${record.sourceIp},
          ${record.userAgent},
          ${record.method},
          ${record.targetUrl},
          ${record.matchedCredentialId},
          ${record.upstreamStatus},
          ${record.errorCode},
          ${record.outcome},
          ${record.timestamp}
        )`,
          ),
          Effect.asVoid,
          Effect.orDie,
        ),
      readRecent: ({ limit }) =>
        sql<AuditEventRow>`SELECT * FROM (
          SELECT
            audit_sequence AS sequence,
            created_at AS timestamp,
            source_ip AS sourceIp,
            user_agent AS userAgent,
            method,
            target_url AS targetUrl,
            matched_credential_id AS matchedCredentialId,
            upstream_status AS upstreamStatus,
            error_code AS errorCode,
            outcome
          FROM audit_logs
          WHERE audit_sequence IS NOT NULL
            AND source_ip IS NOT NULL
            AND user_agent IS NOT NULL
            AND method IS NOT NULL
            AND target_url IS NOT NULL
            AND outcome IS NOT NULL
          ORDER BY audit_sequence DESC
          LIMIT ${limit}
        ) ORDER BY sequence ASC`.pipe(Effect.flatMap(decodeRows), Effect.orDie),
      readAfter: (sequence: AuditEventSequence) =>
        sql<AuditEventRow>`SELECT
          audit_sequence AS sequence,
          created_at AS timestamp,
          source_ip AS sourceIp,
          user_agent AS userAgent,
          method,
          target_url AS targetUrl,
          matched_credential_id AS matchedCredentialId,
          upstream_status AS upstreamStatus,
          error_code AS errorCode,
          outcome
        FROM audit_logs
        WHERE audit_sequence > ${sequence}
          AND source_ip IS NOT NULL
          AND user_agent IS NOT NULL
          AND method IS NOT NULL
          AND target_url IS NOT NULL
          AND outcome IS NOT NULL
        ORDER BY audit_sequence ASC`.pipe(Effect.flatMap(decodeRows), Effect.orDie),
    };
  }),
);

function decodeRows(rows: ReadonlyArray<unknown>) {
  return Effect.forEach(rows, decodeRow);
}

function decodeRow(row: unknown) {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknown(AuditEventRow)(row);

    return yield* Schema.decodeUnknown(AuditEvent)({
      sequence: decoded.sequence,
      event: "OutboundCallCompleted",
      timestamp: decoded.timestamp,
      sourceIp: decoded.sourceIp,
      userAgent: decoded.userAgent,
      method: decoded.method,
      targetUrl: decoded.targetUrl,
      ...(decoded.matchedCredentialId === null
        ? {}
        : { matchedCredentialId: decoded.matchedCredentialId }),
      ...(decoded.upstreamStatus === null ? {} : { upstreamStatus: decoded.upstreamStatus }),
      ...(decoded.errorCode === null ? {} : { errorCode: decoded.errorCode }),
      outcome: decoded.outcome,
    });
  });
}

function generateAuditLogId() {
  return `audit_${randomBytes(18).toString("base64url")}`;
}
