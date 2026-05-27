import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Layer } from "effect"
import type { Credential, StoredOAuth2Credential } from "../../../Domain/Credentials/Credential.js"
import { CredentialNotFoundError, OAuthStateInvalidError } from "../../../Domain/Errors/UsherErrors.js"
import { CredentialRepository, type OAuthState } from "../../../Application/Ports/CredentialRepository.js"
import { CredentialRepositorySqlite } from "./CredentialRepositorySqlite.js"
import { runSqliteMigrations } from "./Migrations.js"

describe("CredentialRepositorySqlite", () => {
  it.scoped("inserts and retrieves a bearer token credential by id", () =>
    Effect.gen(function*() {
      const credential = makeBearerTokenCredential()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insert(credential)

          return yield* repository.getById(credential.credentialId)
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result, credential)
    }))

  it.scoped("lists inserted non-deleted credentials", () =>
    Effect.gen(function*() {
      const credential = makeBearerTokenCredential()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insert(credential)

          return yield* repository.list()
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result, [credential])
    }))

  it.scoped("delete removes a credential from lookups", () =>
    Effect.gen(function*() {
      const credential = makeBearerTokenCredential()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insert(credential)
          yield* repository.deleteById(credential.credentialId)
          const missing = yield* Effect.flip(repository.getById(credential.credentialId))

          return {
            listed: yield* repository.list(),
            nonDeleted: yield* repository.findAllNonDeleted(),
            missing
          }
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result.listed, [])
      assert.deepStrictEqual(result.nonDeleted, [])
      assert.assertInstanceOf(result.missing, CredentialNotFoundError)
    }))

  it.scoped("updates an existing credential", () =>
    Effect.gen(function*() {
      const credential = makeOAuth2Credential()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insert(credential)
          yield* repository.update({
            ...credential,
            status: "active",
            updatedAt: "2026-05-27T00:01:00.000Z",
            oauth2: {
              ...credential.oauth2,
              grantedScopes: ["calendar.readonly"],
              encryptedRefreshToken: "ciphertext:refresh-token"
            }
          })

          return yield* repository.getById(credential.credentialId)
        }),
        makeTestLayer
      )

      if (result.type === "OAuth2") {
        assert.strictEqual(result.status, "active")
        assert.strictEqual(result.updatedAt, "2026-05-27T00:01:00.000Z")
        assert.deepStrictEqual(result.oauth2.grantedScopes, ["calendar.readonly"])
        assert.strictEqual(result.oauth2.encryptedRefreshToken, "ciphertext:refresh-token")
      } else {
        assert.fail("Expected OAuth2 credential")
      }
    }))

  it.scoped("consumes oauth state once and rejects reused state", () =>
    Effect.gen(function*() {
      const oauthState = makeOAuthState()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insertOAuthState(oauthState)
          const consumed = yield* repository.consumeOAuthState({
            state: oauthState.state,
            now: "2026-05-27T00:01:00.000Z"
          })
          const reused = yield* Effect.flip(repository.consumeOAuthState({
            state: oauthState.state,
            now: "2026-05-27T00:01:00.000Z"
          }))

          return { consumed, reused }
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result.consumed, oauthState)
      assert.assertInstanceOf(result.reused, OAuthStateInvalidError)
    }))

  it.scoped("rejects expired oauth state", () =>
    Effect.gen(function*() {
      const oauthState = makeOAuthState()
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          yield* runSqliteMigrations
          const repository = yield* CredentialRepository

          yield* repository.insertOAuthState(oauthState)

          return yield* Effect.flip(repository.consumeOAuthState({
            state: oauthState.state,
            now: "2026-05-27T00:11:00.000Z"
          }))
        }),
        makeTestLayer
      )

      assert.assertInstanceOf(result, OAuthStateInvalidError)
    }))

  it.scoped("runs migrations idempotently", () =>
    Effect.gen(function*() {
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient

          yield* runSqliteMigrations
          yield* runSqliteMigrations

          return yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM _migrations`
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result, [{ count: 3 }])
    }))

  it.scoped("creates oauth states table when credential migration was already recorded", () =>
    Effect.gen(function*() {
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient

          yield* sql`CREATE TABLE _migrations (
            migration_id INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`
          yield* sql`CREATE TABLE credentials (
            credential_id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL,
            label TEXT NOT NULL,
            status TEXT NOT NULL,
            allowed_requests_json TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
          yield* sql`CREATE TABLE audit_logs (
            audit_log_id TEXT PRIMARY KEY NOT NULL,
            event_type TEXT NOT NULL,
            subject TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`
          yield* sql`INSERT INTO _migrations (migration_id, name) VALUES (${20260527120000}, ${"credential_persistence_schema"})`

          yield* runSqliteMigrations

          return yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauth_states'`
        }),
        makeTestLayer
      )

      assert.deepStrictEqual(result, [{ name: "oauth_states" }])
    }))
})

const makeTestLayer: Layer.Layer<CredentialRepository | SqlClient.SqlClient, unknown> = Layer.unwrapScoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const sqlite = SqliteClient.layer({ filename: `${dir}/usher-test.db` })

  return Layer.merge(sqlite, Layer.provide(CredentialRepositorySqlite, sqlite))
})).pipe(Layer.provide(NodeFileSystem.layer))

function makeBearerTokenCredential(): Credential {
  return {
    credentialId: "cred_0123456789abcdef",
    type: "BearerToken",
    label: "Internal API",
    status: "active",
    allowedRequests: [
      { url: { origin: "https://api.internal.example.com", pathPrefix: "/v1/" } }
    ],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    bearerToken: { encryptedToken: "ciphertext:token" }
  }
}

function makeOAuth2Credential(): StoredOAuth2Credential {
  return {
    credentialId: "cred_0123456789abcdef",
    type: "OAuth2",
    label: "Calendar",
    status: "pending",
    allowedRequests: [
      { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } }
    ],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    oauth2: {
      clientId: "client-id",
      encryptedClientSecret: "ciphertext:client-secret",
      authorizationUrl: "https://provider.example.com/authorize",
      tokenUrl: "https://provider.example.com/token",
      scopes: ["calendar.readonly"],
      grantedScopes: []
    }
  }
}

function makeOAuthState(): OAuthState {
  return {
    state: "oauth-state",
    credentialId: "cred_0123456789abcdef",
    codeVerifier: "code-verifier",
    redirectUri: "https://usher.example.com/oauth2/callback",
    createdAt: "2026-05-27T00:00:00.000Z",
    expiresAt: "2026-05-27T00:10:00.000Z"
  }
}
