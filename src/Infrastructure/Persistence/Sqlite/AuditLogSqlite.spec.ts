import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer } from "effect";
import { AuditLog, AuditRecord } from "../../../Application/Ports/AuditLog.js";
import { AuditLogSqlite } from "./AuditLogSqlite.js";
import { runSqliteMigrations } from "./Migrations.js";

describe("AuditLogSqlite", () => {
  it.scoped("persists an audit record", () =>
    Effect.gen(function* () {
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const auditLog = yield* AuditLog;

          yield* runSqliteMigrations;
          yield* auditLog.record({
            timestamp: "2026-05-27T00:00:00.000Z",
            sourceIp: "203.0.113.10",
            userAgent: "usher-test/1.0",
            method: "GET",
            targetUrl: "https://api.internal.example.com/v1/users",
            matchedCredentialId: "cred_0123456789abcdef",
            upstreamStatus: 200,
            outcome: "allowed",
          });

          return yield* sql<{
            readonly source_ip: string;
            readonly user_agent: string;
            readonly method: string;
            readonly target_url: string;
            readonly matched_credential_id: string | null;
            readonly upstream_status: number | null;
            readonly error_code: string | null;
            readonly outcome: string;
            readonly created_at: string;
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
          FROM audit_logs`;
        }),
        makeTestLayer,
      );

      assert.deepStrictEqual(result, [
        {
          source_ip: "203.0.113.10",
          user_agent: "usher-test/1.0",
          method: "GET",
          target_url: "https://api.internal.example.com/v1/users",
          matched_credential_id: "cred_0123456789abcdef",
          upstream_status: 200,
          error_code: null,
          outcome: "allowed",
          created_at: "2026-05-27T00:00:00.000Z",
        },
      ]);
    }),
  );

  it.scoped("reads the latest events oldest-to-newest within the selected tail", () =>
    Effect.gen(function* () {
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const auditLog = yield* AuditLog;

          yield* runSqliteMigrations;
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:00.000Z", "https://api.example.com/v1/one"),
          );
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:01.000Z", "https://api.example.com/v1/two"),
          );
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:02.000Z", "https://api.example.com/v1/three"),
          );

          return yield* auditLog.readRecent({ limit: 2 });
        }),
        makeTestLayer,
      );

      assert.deepStrictEqual(
        result.map((event) => event.targetUrl),
        ["https://api.example.com/v1/two", "https://api.example.com/v1/three"],
      );
      assert.strictEqual(result[0]?.event, "OutboundCallCompleted");
      assert.strictEqual(result[0]?.sequence, 2);
      assert.strictEqual(result[1]?.sequence, 3);
      assert.strictEqual(Object.hasOwn(result[0] ?? {}, "matchedCredentialId"), false);
      assert.strictEqual(Object.hasOwn(result[0] ?? {}, "upstreamStatus"), false);
      assert.strictEqual(Object.hasOwn(result[0] ?? {}, "errorCode"), false);
    }),
  );

  it.scoped("reads events after a sequence cursor", () =>
    Effect.gen(function* () {
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const auditLog = yield* AuditLog;

          yield* runSqliteMigrations;
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:00.000Z", "https://api.example.com/v1/one"),
          );
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:01.000Z", "https://api.example.com/v1/two"),
          );
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:02.000Z", "https://api.example.com/v1/three"),
          );

          return yield* auditLog.readAfter(1);
        }),
        makeTestLayer,
      );

      assert.deepStrictEqual(
        result.map((event) => event.sequence),
        [2, 3],
      );
    }),
  );

  it.scoped("skips legacy audit rows without outbound call fields", () =>
    Effect.gen(function* () {
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const auditLog = yield* AuditLog;

          yield* sql`CREATE TABLE audit_logs (
            audit_log_id TEXT PRIMARY KEY NOT NULL,
            event_type TEXT NOT NULL,
            subject TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`;
          yield* sql`INSERT INTO audit_logs (
            audit_log_id,
            event_type,
            subject,
            metadata_json,
            created_at
          ) VALUES (
            ${"audit_legacy"},
            ${"generic"},
            ${"legacy-subject"},
            ${JSON.stringify({})},
            ${"2026-05-26T00:00:00.000Z"}
          )`;

          yield* runSqliteMigrations;
          yield* auditLog.record(
            auditRecord("2026-05-27T00:00:00.000Z", "https://api.example.com/v1/complete"),
          );

          return yield* auditLog.readRecent({ limit: 10 });
        }),
        makeTestLayer,
      );

      assert.deepStrictEqual(
        result.map((event) => event.targetUrl),
        ["https://api.example.com/v1/complete"],
      );
      assert.deepStrictEqual(
        result.map((event) => event.sequence),
        [1],
      );
    }),
  );
});

const makeTestLayer: Layer.Layer<AuditLog | SqlClient.SqlClient, unknown> = Layer.unwrapScoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const sqlite = SqliteClient.layer({ filename: `${dir}/usher-audit-test.db` });

    return Layer.merge(sqlite, Layer.provide(AuditLogSqlite, sqlite));
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

function auditRecord(timestamp: string, targetUrl: string): AuditRecord {
  return {
    timestamp,
    sourceIp: "203.0.113.10",
    userAgent: "usher-test/1.0",
    method: "GET",
    targetUrl,
    outcome: "allowed",
  };
}
