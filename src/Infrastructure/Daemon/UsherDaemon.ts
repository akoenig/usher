import { SqliteClient } from "@effect/sql-sqlite-node";
import { Duration, Effect, Layer, Schedule } from "effect";
import { AuditLog } from "../../Application/Ports/AuditLog.js";
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

const AuditRetentionSweepInterval = Duration.hours(1);

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
    HttpExecutorLive({
      timeoutMillis: config.upstreamTimeoutMillis,
      maxResponseBodyBytes: config.maxBodyBytes,
    }),
  );
  const serviceLayer = Layer.provide(services, adapters);
  const serverLayer = Layer.provide(
    HttpServerLive({
      allowedCallerIps: config.allowedCallerIps,
      baseUrl: config.baseUrl,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
    }),
    Layer.mergeAll(serviceLayer, repositories),
  );

  yield* runSqliteMigrations.pipe(Effect.provide(sqlite));

  const daemon = Effect.gen(function* () {
    const retentionDays = config.auditRetentionDays;
    if (retentionDays !== undefined) {
      yield* pruneAuditEvents(retentionDays).pipe(
        Effect.repeat(Schedule.spaced(AuditRetentionSweepInterval)),
        Effect.fork,
      );
    }

    yield* Effect.never;
  });

  yield* daemon.pipe(Effect.provide(Layer.mergeAll(serverLayer, repositories)));
});

function pruneAuditEvents(retentionDays: number) {
  return Effect.gen(function* () {
    const auditLog = yield* AuditLog;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const deleted = yield* auditLog.deleteOlderThan(cutoff);

    if (deleted > 0) {
      yield* Effect.logInfo(`Pruned ${deleted} audit events older than ${cutoff}`);
    }
  });
}
