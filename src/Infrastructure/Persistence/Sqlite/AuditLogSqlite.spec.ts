import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Layer } from "effect"
import { AuditLog } from "../../../Application/Ports/AuditLog.js"
import { AuditLogSqlite } from "./AuditLogSqlite.js"
import { runSqliteMigrations } from "./Migrations.js"

describe("AuditLogSqlite", () => {
  it.scoped("persists an audit record", () =>
    Effect.gen(function*() {
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          const auditLog = yield* AuditLog

          yield* runSqliteMigrations
          yield* auditLog.record({
            timestamp: "2026-05-27T00:00:00.000Z",
            sourceIp: "203.0.113.10",
            userAgent: "usher-test/1.0",
            method: "GET",
            targetUrl: "https://api.internal.example.com/v1/users",
            matchedCredentialId: "cred_0123456789abcdef",
            upstreamStatus: 200,
            outcome: "allowed"
          })

          return yield* sql<{
            readonly source_ip: string
            readonly user_agent: string
            readonly method: string
            readonly target_url: string
            readonly matched_credential_id: string | null
            readonly upstream_status: number | null
            readonly error_code: string | null
            readonly outcome: string
            readonly created_at: string
          }>`SELECT
            source_ip,
            user_agent,
            method,
            target_url,
            matched_credential_id,
            upstream_status,
            error_code,
            outcome,
            created_at
          FROM audit_logs`
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result, [{
        source_ip: "203.0.113.10",
        user_agent: "usher-test/1.0",
        method: "GET",
        target_url: "https://api.internal.example.com/v1/users",
        matched_credential_id: "cred_0123456789abcdef",
        upstream_status: 200,
        error_code: null,
        outcome: "allowed",
        created_at: "2026-05-27T00:00:00.000Z"
      }])
    }))
})

const makeTestLayer: Layer.Layer<AuditLog | SqlClient.SqlClient, unknown> = Layer.unwrapScoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const sqlite = SqliteClient.layer({ filename: `${dir}/usher-audit-test.db` })

  return Layer.merge(sqlite, Layer.provide(AuditLogSqlite, sqlite))
})).pipe(Layer.provide(NodeFileSystem.layer))
