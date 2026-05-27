import { SqlClient } from "@effect/sql"
import { Effect, Schema } from "effect"
import { MigrationRow } from "./Schema.js"

const credentialSchemaMigrationId = 20260527120000
const credentialSchemaMigrationName = "credential_persistence_schema"
const auditLogRequestFieldsMigrationId = 20260527121000
const auditLogRequestFieldsMigrationName = "audit_log_request_fields"
const oauthStateSchemaMigrationId = 20260527122000
const oauthStateSchemaMigrationName = "oauth_state_schema"

export const runSqliteMigrations = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* sql`CREATE TABLE IF NOT EXISTS _migrations (
    migration_id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`

  const existingRows = yield* sql<MigrationRow>`SELECT migration_id, name FROM _migrations`
  const existing = yield* Effect.forEach(existingRows, (row) => Schema.decodeUnknown(MigrationRow)(row))

  if (!existing.some((migration) => migration.migration_id === credentialSchemaMigrationId)) {
    yield* sql.withTransaction(Effect.gen(function*() {
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

      yield* sql`INSERT INTO _migrations (migration_id, name) VALUES (${credentialSchemaMigrationId}, ${credentialSchemaMigrationName})`
    }))
  }

  if (!existing.some((migration) => migration.migration_id === auditLogRequestFieldsMigrationId)) {
    yield* sql.withTransaction(Effect.gen(function*() {
      yield* sql`ALTER TABLE audit_logs ADD COLUMN source_ip TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN method TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN target_url TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN matched_credential_id TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN upstream_status INTEGER`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN error_code TEXT`
      yield* sql`ALTER TABLE audit_logs ADD COLUMN outcome TEXT`
      yield* sql`INSERT INTO _migrations (migration_id, name) VALUES (${auditLogRequestFieldsMigrationId}, ${auditLogRequestFieldsMigrationName})`
    }))
  }

  if (!existing.some((migration) => migration.migration_id === oauthStateSchemaMigrationId)) {
    yield* sql.withTransaction(Effect.gen(function*() {
      yield* sql`CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY NOT NULL,
        credential_id TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`
      yield* sql`INSERT INTO _migrations (migration_id, name) VALUES (${oauthStateSchemaMigrationId}, ${oauthStateSchemaMigrationName})`
    }))
  }
})
