import { randomBytes } from "node:crypto"
import { SqlClient } from "@effect/sql"
import { Effect, Layer, Schema } from "effect"
import { AuditLog, AuditRecord } from "../../../Application/Ports/AuditLog.js"

export const AuditLogSqlite = Layer.effect(
  AuditLog,
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    return {
      record: (auditRecord: AuditRecord) => Schema.decodeUnknown(AuditRecord)(auditRecord).pipe(
        Effect.flatMap((record) => sql`INSERT INTO audit_logs (
          audit_log_id,
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
        )`),
        Effect.asVoid,
        Effect.orDie
      )
    }
  })
)

function generateAuditLogId() {
  return `audit_${randomBytes(18).toString("base64url")}`
}
