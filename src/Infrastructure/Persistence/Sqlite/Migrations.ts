import { SqlClient } from "@effect/sql"
import { Effect, Schema } from "effect"
import { MigrationRow } from "./Schema.js"

const credentialSchemaMigrationId = 20260527120000
const credentialSchemaMigrationName = "credential_persistence_schema"

export const runSqliteMigrations = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* sql`CREATE TABLE IF NOT EXISTS _migrations (
    migration_id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`

  const existingRows = yield* sql<MigrationRow>`SELECT migration_id, name FROM _migrations WHERE migration_id = ${credentialSchemaMigrationId}`
  const existing = yield* Effect.forEach(existingRows, (row) => Schema.decodeUnknown(MigrationRow)(row))

  if (existing.length > 0) {
    return
  }

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

    yield* sql`CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY NOT NULL,
      credential_id TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
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
})
