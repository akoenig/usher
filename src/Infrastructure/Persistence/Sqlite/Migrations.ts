import { Migrator, SqlClient } from "@effect/sql"
import { Data, Effect } from "effect"

const credentialSchemaMigrationId = 20260527120000
const credentialSchemaMigrationName = "credential_persistence_schema"
const auditLogRequestFieldsMigrationId = 20260527121000
const auditLogRequestFieldsMigrationName = "audit_log_request_fields"
const oauthStateSchemaMigrationId = 20260527122000
const oauthStateSchemaMigrationName = "oauth_state_schema"

export const runSqliteMigrations = Migrator.make({})({
  table: "_migrations",
  loader: Effect.succeed([
    Data.tuple(
      credentialSchemaMigrationId,
      credentialSchemaMigrationName,
      Effect.succeed(Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient

        yield* sql`CREATE TABLE IF NOT EXISTS credentials (
          credential_id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          label TEXT NOT NULL,
          status TEXT NOT NULL,
          allowed_requests_json TEXT NOT NULL,
          config_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`

        yield* sql`CREATE TABLE IF NOT EXISTS audit_logs (
          audit_log_id TEXT PRIMARY KEY NOT NULL,
          event_type TEXT NOT NULL,
          subject TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      }))
    ),
    Data.tuple(
      auditLogRequestFieldsMigrationId,
      auditLogRequestFieldsMigrationName,
      Effect.succeed(Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient

        yield* sql`ALTER TABLE audit_logs ADD COLUMN source_ip TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN method TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN target_url TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN matched_credential_id TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN upstream_status INTEGER`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN error_code TEXT`
        yield* sql`ALTER TABLE audit_logs ADD COLUMN outcome TEXT`
      }))
    ),
    Data.tuple(
      oauthStateSchemaMigrationId,
      oauthStateSchemaMigrationName,
      Effect.succeed(Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient

        yield* sql`CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY NOT NULL,
          credential_id TEXT NOT NULL,
          code_verifier TEXT NOT NULL,
          redirect_uri TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )`
      }))
    )
  ])
})
