import { SqliteClient } from "@effect/sql-sqlite-node"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { CallServiceLive } from "./Application/Services/CallService.js"
import { CredentialServiceLive } from "./Application/Services/CredentialService.js"
import { OAuth2ServiceLive } from "./Application/Services/OAuth2Service.js"
import { loadUsherConfig } from "./Infrastructure/Config/UsherConfig.js"
import { NodeSecretVaultLive } from "./Infrastructure/Encryption/NodeSecretVault.js"
import { HttpExecutorLive } from "./Infrastructure/Http/HttpExecutorLive.js"
import { HttpServerLive } from "./Infrastructure/Http/HttpServer.js"
import { OAuth2HttpClient } from "./Infrastructure/OAuth2/OAuth2HttpClient.js"
import { AuditLogSqlite } from "./Infrastructure/Persistence/Sqlite/AuditLogSqlite.js"
import { CredentialRepositorySqlite } from "./Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.js"
import { runSqliteMigrations } from "./Infrastructure/Persistence/Sqlite/Migrations.js"

export const main = Effect.gen(function*() {
  const config = yield* loadUsherConfig
  const sqlite = SqliteClient.layer({ filename: config.databasePath })
  const repositories = Layer.provide(
    Layer.mergeAll(CredentialRepositorySqlite, AuditLogSqlite),
    sqlite
  )
  const services = Layer.mergeAll(
    CredentialServiceLive({ baseUrl: config.baseUrl }),
    OAuth2ServiceLive({ stateTtlMillis: 10 * 60 * 1000 }),
    CallServiceLive
  )
  const adapters = Layer.mergeAll(
    repositories,
    NodeSecretVaultLive(config.encryptionKeyFile),
    OAuth2HttpClient,
    HttpExecutorLive
  )
  const serviceLayer = Layer.provide(services, adapters)
  const serverLayer = Layer.provide(
    HttpServerLive({
      allowedCallerIps: config.allowedCallerIps,
      port: config.port
    }),
    serviceLayer
  )

  yield* runSqliteMigrations.pipe(Effect.provide(sqlite))
  yield* Effect.never.pipe(Effect.provide(serverLayer))
})

NodeRuntime.runMain(main)
