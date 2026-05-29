import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { CallServiceLive } from "../../Application/Services/CallService.js";
import { CredentialServiceLive } from "../../Application/Services/CredentialService.js";
import { OAuth2ServiceLive } from "../../Application/Services/OAuth2Service.js";
import { loadUsherConfig } from "../Config/UsherConfig.js";
import { NodeSecretVaultLiveFromKey } from "../Encryption/NodeSecretVault.js";
import { HttpExecutorLive } from "../Http/HttpExecutorLive.js";
import { HttpServerLive } from "../Http/HttpServer.js";
import { OAuth2HttpClient } from "../OAuth2/OAuth2HttpClient.js";
import { AuditLogSqlite } from "../Persistence/Sqlite/AuditLogSqlite.js";
import { CredentialRepositorySqlite } from "../Persistence/Sqlite/CredentialRepositorySqlite.js";
import { runSqliteMigrations } from "../Persistence/Sqlite/Migrations.js";

export const runUsherDaemon = Effect.gen(function* () {
  const config = yield* loadUsherConfig;
  const sqlite = SqliteClient.layer({ filename: config.databasePath });
  const repositories = Layer.provide(
    Layer.mergeAll(CredentialRepositorySqlite, AuditLogSqlite),
    sqlite,
  );
  const services = Layer.mergeAll(
    CredentialServiceLive({ baseUrl: config.baseUrl }),
    OAuth2ServiceLive({ stateTtlMillis: 10 * 60 * 1000 }),
    CallServiceLive,
  );
  const adapters = Layer.mergeAll(
    repositories,
    NodeSecretVaultLiveFromKey(config.encryptionKey),
    OAuth2HttpClient,
    HttpExecutorLive,
  );
  const serviceLayer = Layer.provide(services, adapters);
  const serverLayer = Layer.provide(
    HttpServerLive({
      allowedCallerIps: config.allowedCallerIps,
      baseUrl: config.baseUrl,
      port: config.port,
    }),
    serviceLayer,
  );

  yield* runSqliteMigrations.pipe(Effect.provide(sqlite));
  yield* Effect.never.pipe(Effect.provide(serverLayer));
});
