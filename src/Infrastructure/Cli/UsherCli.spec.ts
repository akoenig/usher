import { Command } from "@effect/cli";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigError, Effect, Exit, HashMap, HashSet, Schema } from "effect";
import { EncryptionKeyFileMissingError } from "../../Domain/Errors/UsherErrors.js";
import { AdminApiError } from "./AdminApiClient.js";
import {
  credentialsCommand,
  daemonCommand,
  formatConfigErrorMessage,
  formatSemanticErrorMessage,
  runUsherCli,
  usherCommand,
} from "./UsherCli.js";

describe("UsherCli", () => {
  it("defines the usher command tree", () => {
    const usherNames = Command.getNames(usherCommand);
    const usherSubcommands = Command.getSubcommands(usherCommand);
    const daemonSubcommands = Command.getSubcommands(daemonCommand);
    const credentialsSubcommands = Command.getSubcommands(credentialsCommand);

    assert.assertTrue(HashSet.has(usherNames, "usher"));
    assert.assertTrue(HashMap.has(usherSubcommands, "daemon"));
    assert.assertTrue(HashMap.has(usherSubcommands, "credentials"));
    assert.assertTrue(HashMap.has(daemonSubcommands, "start"));
    assert.assertTrue(HashMap.has(daemonSubcommands, "install"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "list"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "get"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "delete"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "create-bearer-token"));
    assert.assertTrue(HashMap.has(credentialsSubcommands, "create-oauth2"));
  });

  it.effect("prints root help successfully when invoked with full argv and no command args", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(runUsherCli(["node", "usher"]));

      assert.assertTrue(Exit.isSuccess(result));
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
      ConfigError.MissingData(["USHER_DATABASE_PATH"], "Expected USHER_DATABASE_PATH to exist"),
    );

    assert.assertTrue(message.includes("Daemon configuration invalid."));
    assert.assertTrue(message.includes("USHER_DATABASE_PATH"));
  });

  it("formats daemon startup semantic errors for operators", () => {
    const message = formatSemanticErrorMessage(EncryptionKeyFileMissingError.make());

    assert.strictEqual(
      message,
      "Daemon startup failed. EncryptionKeyFileMissingError: Encryption key file is missing",
    );
  });
});

function restoreUsherPort(previousPort: string | undefined) {
  return Effect.sync(() => {
    if (previousPort === undefined) {
      delete process.env.USHER_PORT;
      return;
    }

    process.env.USHER_PORT = previousPort;
  });
}
