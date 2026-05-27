import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Layer } from "effect"
import type { Credential } from "../../../Domain/Credentials/Credential.js"
import { CredentialNotFoundError } from "../../../Domain/Errors/UsherErrors.js"
import { CredentialRepository } from "../../../Application/Ports/CredentialRepository.js"
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

      assert.deepStrictEqual(result, [{ count: 1 }])
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
