import { Command } from "@effect/cli";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigError, Console, Effect, Exit, HashMap, HashSet, Layer, Ref, Schema } from "effect";
import packageJson from "../../../package.json" with { type: "json" };
import type { AuditEvent } from "../../Application/Ports/AuditLog.js";
import { EncryptionKeyFileMissingError } from "../../Domain/Errors/UsherErrors.js";
import { AdminApiClient, AdminApiError } from "./AdminApiClient.js";
import {
  credentialsCommand,
  daemonCommand,
  eventsCommand,
  formatConfigErrorMessage,
  formatSemanticErrorMessage,
  initCommand,
  printEventsAfter,
  printNextFollowEvents,
  printRecentEvents,
  runUsherCli,
  usherCommand,
} from "./UsherCli.js";

describe("UsherCli", () => {
  it("defines the usher command tree", () => {
    const usherNames = Command.getNames(usherCommand);
    const usherSubcommands = Command.getSubcommands(usherCommand);
    const daemonSubcommands = Command.getSubcommands(daemonCommand);
    const credentialsSubcommands = Command.getSubcommands(credentialsCommand);
    const eventsNames = Command.getNames(eventsCommand);

    assert.assertTrue(HashSet.has(usherNames, "usher"));
    assert.assertTrue(HashMap.has(usherSubcommands, "daemon"));
    assert.assertTrue(HashMap.has(usherSubcommands, "init"));
    assert.assertTrue(HashMap.has(usherSubcommands, "credentials"));
    assert.assertTrue(HashMap.has(usherSubcommands, "events"));
    assert.assertTrue(HashSet.has(Command.getNames(initCommand), "init"));
    assert.assertTrue(HashMap.has(daemonSubcommands, "start"));
    assert.assertTrue(HashMap.has(daemonSubcommands, "install"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "list"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "get"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "delete"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "create-bearer-token"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "create-oauth2"));
    assert.assertTrue(HashSet.has(eventsNames, "events"));
  });

  it.effect("prints recent events and returns the last sequence", () =>
    Effect.gen(function* () {
      const logs = yield* Ref.make<ReadonlyArray<string>>([]);
      const event = auditEvent(7, "https://api.example.com/v1/users");
      const result = yield* printRecentEvents(50).pipe(
        Effect.provide(adminApiClientLayer([event])),
        Console.withConsole(testConsole(logs)),
      );

      assert.deepStrictEqual(result, 7);
      assert.deepStrictEqual(yield* Ref.get(logs), [
        "OutboundCallCompleted 2026-05-28T00:00:00.000Z allowed GET https://api.example.com/v1/users 200 - cred_123 127.0.0.1 vitest",
      ]);
    }),
  );

  it.effect("prints nothing when recent events are empty", () =>
    Effect.gen(function* () {
      const logs = yield* Ref.make<ReadonlyArray<string>>([]);
      const result = yield* printRecentEvents(10).pipe(
        Effect.provide(adminApiClientLayer([])),
        Console.withConsole(testConsole(logs)),
      );

      assert.strictEqual(result, undefined);
      assert.deepStrictEqual(yield* Ref.get(logs), []);
    }),
  );

  it.effect("requests recent events with the provided limit", () =>
    Effect.gen(function* () {
      const requestedLimits = yield* Ref.make<ReadonlyArray<number>>([]);
      yield* printRecentEvents(50).pipe(
        Effect.provide(adminApiClientLayer([], requestedLimits)),
        Console.withConsole(testConsole(yield* Ref.make<ReadonlyArray<string>>([]))),
      );

      assert.deepStrictEqual(yield* Ref.get(requestedLimits), [50]);
    }),
  );

  it.effect("rejects invalid event limits before calling the admin API", () =>
    Effect.gen(function* () {
      const requestedLimits = yield* Ref.make<ReadonlyArray<number>>([]);
      const error = yield* printRecentEvents(0).pipe(
        Effect.provide(adminApiClientLayer([], requestedLimits)),
        Effect.flip,
      );

      if (!Schema.is(AdminApiError)(error)) {
        return yield* Effect.die("expected AdminApiError");
      }

      assert.strictEqual(error.code, "InvalidEventLimit");
      assert.strictEqual(error.message, "Event limit must be at least 1");
      assert.deepStrictEqual(yield* Ref.get(requestedLimits), []);
    }),
  );

  it.effect("fails invalid event limits parsed from the events command", () =>
    Effect.gen(function* () {
      const error = yield* runUsherCli(["node", "usher", "events", "-n", "0"]).pipe(Effect.flip);

      if (!Schema.is(AdminApiError)(error)) {
        return yield* Effect.die("expected AdminApiError");
      }

      assert.strictEqual(error.code, "InvalidEventLimit");
      assert.strictEqual(error.message, "Event limit must be at least 1");
    }),
  );

  it.effect("prints events after the provided sequence", () =>
    Effect.gen(function* () {
      const logs = yield* Ref.make<ReadonlyArray<string>>([]);
      const requestedSequences = yield* Ref.make<ReadonlyArray<number>>([]);
      const event = auditEvent(8, "https://api.example.com/v1/after");
      const result = yield* printEventsAfter(7).pipe(
        Effect.provide(adminApiClientLayer([event], undefined, requestedSequences)),
        Console.withConsole(testConsole(logs)),
      );

      assert.strictEqual(result, 8);
      assert.deepStrictEqual(yield* Ref.get(requestedSequences), [7]);
      assert.deepStrictEqual(yield* Ref.get(logs), [
        "OutboundCallCompleted 2026-05-28T00:00:00.000Z allowed GET https://api.example.com/v1/after 200 - cred_123 127.0.0.1 vitest",
      ]);
    }),
  );

  it.effect("follows from cursor zero when the initial recent query has no events", () =>
    Effect.gen(function* () {
      const logs = yield* Ref.make<ReadonlyArray<string>>([]);
      const requestedSequences = yield* Ref.make<ReadonlyArray<number>>([]);
      const event = auditEvent(1, "https://api.example.com/v1/first");
      const result = yield* printNextFollowEvents(undefined).pipe(
        Effect.provide(adminApiClientLayer([event], undefined, requestedSequences)),
        Console.withConsole(testConsole(logs)),
      );

      assert.strictEqual(result, 1);
      assert.deepStrictEqual(yield* Ref.get(requestedSequences), [0]);
      assert.deepStrictEqual(yield* Ref.get(logs), [
        "OutboundCallCompleted 2026-05-28T00:00:00.000Z allowed GET https://api.example.com/v1/first 200 - cred_123 127.0.0.1 vitest",
      ]);
    }),
  );

  it.effect("prints root help successfully when invoked with full argv and no command args", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(runUsherCli(["node", "usher"]));

      assert.assertTrue(Exit.isSuccess(result));
    }),
  );

  it.effect("prints the package version", () =>
    Effect.gen(function* () {
      const logs = yield* Ref.make<ReadonlyArray<string>>([]);
      const result = yield* Effect.exit(
        runUsherCli(["node", "usher", "--version"]).pipe(Console.withConsole(testConsole(logs))),
      );

      assert.assertTrue(Exit.isSuccess(result));
      assert.deepStrictEqual(yield* Ref.get(logs), [`${packageJson.version}\n`]);
    }),
  );

  it.effect("fails invalid credential IDs when invoked with full argv", () =>
    Effect.gen(function* () {
      const previousPort = process.env.USHER_PORT;
      process.env.USHER_PORT = "19000";

      yield* Effect.gen(function* () {
        const error = yield* runUsherCli(["node", "usher", "credentials", "get", "invalid"]).pipe(
          Effect.flip,
        );

        if (!Schema.is(AdminApiError)(error)) {
          return yield* Effect.die("expected AdminApiError");
        }

        assert.strictEqual(error.code, "InvalidCredentialId");
        assert.strictEqual(error.message, "Credential ID is invalid");
      }).pipe(Effect.ensuring(restoreUsherPort(previousPort)));
    }),
  );

  it("formats missing configuration errors for operators", () => {
    const message = formatConfigErrorMessage(
      ConfigError.MissingData(["HOME"], "Expected HOME to exist for ~/.config/usher/config.json"),
    );

    assert.assertTrue(message.includes("Daemon configuration invalid."));
    assert.assertTrue(message.includes("HOME"));
  });

  it("formats daemon startup semantic errors for operators", () => {
    const message = formatSemanticErrorMessage(EncryptionKeyFileMissingError.make());

    assert.strictEqual(
      message,
      "Daemon startup failed. EncryptionKeyFileMissingError: Encryption key file is missing",
    );
  });
});

function adminApiClientLayer(
  events: ReadonlyArray<AuditEvent>,
  requestedLimits?: Ref.Ref<ReadonlyArray<number>>,
  requestedSequences?: Ref.Ref<ReadonlyArray<number>>,
) {
  return Layer.succeed(AdminApiClient, {
    list: () => Effect.succeed([]),
    get: () => Effect.fail(AdminApiError.make({ code: "Unexpected", message: "unexpected" })),
    create: () => Effect.fail(AdminApiError.make({ code: "Unexpected", message: "unexpected" })),
    deleteById: () => Effect.void,
    listEvents: (input) =>
      Effect.gen(function* () {
        if (typeof input.limit === "number" && requestedLimits !== undefined) {
          yield* Ref.update(requestedLimits, (limits) => [...limits, input.limit]);
        }

        if (typeof input.after === "number" && requestedSequences !== undefined) {
          yield* Ref.update(requestedSequences, (sequences) => [...sequences, input.after]);
        }

        return events;
      }),
  });
}

function testConsole(logs: Ref.Ref<ReadonlyArray<string>>): Console.Console {
  const append = (...args: ReadonlyArray<unknown>) =>
    Ref.update(logs, (lines) => [...lines, args.map(String).join(" ")]);

  return {
    [Console.TypeId]: Console.TypeId,
    assert: () => Effect.void,
    clear: Effect.void,
    count: () => Effect.void,
    countReset: () => Effect.void,
    debug: append,
    dir: append,
    dirxml: append,
    error: append,
    group: () => Effect.void,
    groupEnd: Effect.void,
    info: append,
    log: append,
    table: append,
    time: () => Effect.void,
    timeEnd: () => Effect.void,
    timeLog: append,
    trace: append,
    warn: append,
    unsafe: console,
  };
}

function auditEvent(sequence: number, targetUrl: string): AuditEvent {
  return {
    sequence,
    event: "OutboundCallCompleted",
    timestamp: "2026-05-28T00:00:00.000Z",
    sourceIp: "127.0.0.1",
    userAgent: "vitest",
    method: "GET",
    targetUrl,
    matchedCredentialId: "cred_123",
    upstreamStatus: 200,
    outcome: "allowed",
  };
}

function restoreUsherPort(previousPort: string | undefined) {
  return Effect.sync(() => {
    if (previousPort === undefined) {
      delete process.env.USHER_PORT;
      return;
    }

    process.env.USHER_PORT = previousPort;
  });
}
