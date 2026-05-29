import { Args, Command, Options } from "@effect/cli";
import * as Prompt from "@effect/cli/Prompt";
import { HttpClientError } from "@effect/platform";
import { NodeContext, NodeHttpClient } from "@effect/platform-node";
import { ConfigError, Console, Context, Effect, Layer, Option, Schema } from "effect";
import type {
  AuditEvent,
  AuditEventCursor,
  AuditEventSequence,
} from "../../Application/Ports/AuditLog.js";
import { CredentialId } from "../../Domain/Credentials/Credential.js";
import {
  SemanticError,
  type SemanticError as SemanticErrorType,
} from "../../Domain/Errors/UsherErrors.js";
import { runUsherDaemon } from "../Daemon/UsherDaemon.js";
import { AdminApiClient, AdminApiClientLive, AdminApiError } from "./AdminApiClient.js";
import { loadUsherCliConfig, localAdminBaseUrl } from "./CliConfig.js";
import { installUsherDaemonService, UsherDaemonServiceName } from "./DaemonSystemdInstaller.js";
import { initializeUsherConfig } from "./InitConfig.js";
import {
  formatCredentialCreated,
  formatCredentialDeleted,
  formatCredentialDetail,
  formatCredentialList,
} from "./CredentialFormatting.js";
import {
  promptBearerTokenCredentialInput,
  promptOAuth2CredentialInput,
} from "./CredentialPrompts.js";
import { formatEvents } from "./EventFormatting.js";

const credentialIdArg = Args.text({ name: "credential-id" });

const daemonStartCommand = Command.make("start", {}, () => runUsherDaemon);

const daemonInstallCommand = Command.make("install", {}, () =>
  Effect.gen(function* () {
    yield* installUsherDaemonService({
      executablePath: currentExecutablePath(),
      homeDirectory: currentHomeDirectory(),
      username: currentUsername(),
    });

    yield* Console.log(`${UsherDaemonServiceName} installed and started.`);
  }),
);

export const daemonCommand = Command.make("daemon", {}, () => runUsherDaemon).pipe(
  Command.withSubcommands([daemonStartCommand, daemonInstallCommand]),
);

const credentialsListCommand = Command.make("list", {}, () =>
  withLocalAdminClient(
    Effect.gen(function* () {
      const client = yield* AdminApiClient;
      const credentials = yield* client.list();

      yield* Console.log(formatCredentialList(credentials));
    }),
  ),
);

const credentialsGetCommand = Command.make(
  "get",
  { credentialId: credentialIdArg },
  ({ credentialId }) =>
    Effect.gen(function* () {
      const validCredentialId = yield* validateCredentialId(credentialId);

      yield* withLocalAdminClient(
        Effect.gen(function* () {
          const client = yield* AdminApiClient;
          const credential = yield* client.get(validCredentialId);

          yield* Console.log(formatCredentialDetail(credential));
        }),
      );
    }),
);

const credentialsDeleteCommand = Command.make(
  "delete",
  { credentialId: credentialIdArg },
  ({ credentialId }) =>
    Effect.gen(function* () {
      const validCredentialId = yield* validateCredentialId(credentialId);

      yield* withLocalAdminClient(
        Effect.gen(function* () {
          const client = yield* AdminApiClient;
          const credential = yield* getDeleteCredentialLabel(client, validCredentialId);
          const confirmed = yield* Prompt.confirm({
            message: deleteConfirmationMessage(validCredentialId, credential),
            initial: false,
          });

          if (!confirmed) {
            yield* Console.log("No changes made.");
            return;
          }

          yield* client.deleteById(validCredentialId);
          yield* Console.log(formatCredentialDeleted(validCredentialId));
        }),
      );
    }),
);

const credentialsCreateBearerTokenCommand = Command.make("create-bearer-token", {}, () =>
  withLocalAdminClient(
    Effect.gen(function* () {
      const client = yield* AdminApiClient;
      const input = yield* promptBearerTokenCredentialInput;
      const credential = yield* client.create(input);

      yield* Console.log(formatCredentialCreated(credential));
    }),
  ),
);

const credentialsCreateOAuth2Command = Command.make("create-oauth2", {}, () =>
  withLocalAdminClient(
    Effect.gen(function* () {
      const client = yield* AdminApiClient;
      const input = yield* promptOAuth2CredentialInput;
      const credential = yield* client.create(input);

      yield* Console.log(formatCredentialCreated(credential));
    }),
  ),
);

export const credentialsCommand = Command.make("credentials").pipe(
  Command.withSubcommands([
    credentialsListCommand,
    credentialsGetCommand,
    credentialsDeleteCommand,
    credentialsCreateBearerTokenCommand,
    credentialsCreateOAuth2Command,
  ]),
);

const eventLimitOption = Options.integer("n").pipe(Options.withDefault(10));
const eventFollowOption = Options.boolean("f");

export const eventsCommand = Command.make(
  "events",
  { follow: eventFollowOption, limit: eventLimitOption },
  ({ follow, limit }) =>
    Effect.gen(function* () {
      const validLimit = yield* validateEventLimit(limit);

      yield* withLocalAdminClient(
        Effect.gen(function* () {
          const lastSequence = yield* printRecentEvents(validLimit);

          if (follow) {
            yield* followEvents(lastSequence);
          }
        }),
      );
    }),
);

export const initCommand = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const configPath = yield* initializeUsherConfig({ homeDirectory: currentHomeDirectory() });

    yield* Console.log(`Created ${configPath}.`);
    yield* Console.log("Start Usher with: usher daemon start");
  }),
);

export const usherCommand = Command.make("usher").pipe(
  Command.withSubcommands([initCommand, daemonCommand, credentialsCommand, eventsCommand]),
);

export function runUsherCli(args: ReadonlyArray<string>): Effect.Effect<void, unknown, never> {
  return Command.run(usherCommand, {
    name: "Usher",
    version: "0.0.0",
  })(args).pipe(
    Effect.tapError((error) => {
      if (Schema.is(AdminApiError)(error)) {
        return Console.error(`${error.code}: ${error.message}`);
      }

      if (isTransportRequestError(error)) {
        return Console.error("Daemon unavailable.");
      }

      if (ConfigError.isConfigError(error)) {
        return Console.error(formatConfigErrorMessage(error));
      }

      if (isSemanticError(error)) {
        return Console.error(formatSemanticErrorMessage(error));
      }

      return Effect.void;
    }),
    Effect.provide(Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  );
}

export function formatConfigErrorMessage(error: ConfigError.ConfigError) {
  return `Daemon configuration invalid. ${formatConfigError(error)}`;
}

function formatConfigError(error: ConfigError.ConfigError) {
  const reducer: ConfigError.ConfigErrorReducer<undefined, string> = {
    andCase: (_context, left, right) => `${left}; ${right}`,
    invalidDataCase: (_context, path, message) => `invalid ${formatConfigPath(path)}: ${message}`,
    missingDataCase: (_context, path, message) => `missing ${formatConfigPath(path)}: ${message}`,
    orCase: (_context, left, right) => `${left}; ${right}`,
    sourceUnavailableCase: (_context, path, message) =>
      `unavailable ${formatConfigPath(path)}: ${message}`,
    unsupportedCase: (_context, path, message) =>
      `unsupported ${formatConfigPath(path)}: ${message}`,
  };

  return ConfigError.reduceWithContext(error, undefined, reducer);
}

function formatConfigPath(path: ReadonlyArray<string>) {
  return path.join(".");
}

export function formatSemanticErrorMessage(error: SemanticErrorType) {
  return `Daemon startup failed. ${error.code}: ${error.message}`;
}

function withLocalAdminClient<A, E, R>(effect: Effect.Effect<A, E, R | AdminApiClient>) {
  return Effect.gen(function* () {
    const config = yield* loadUsherCliConfig;

    return yield* effect.pipe(Effect.provide(AdminApiClientLive(localAdminBaseUrl(config.port))));
  });
}

export function printRecentEvents(limit: number) {
  return Effect.gen(function* () {
    const validLimit = yield* validateEventLimit(limit);
    const client = yield* AdminApiClient;
    const events = yield* client.listEvents({ limit: validLimit });

    return yield* printEvents(events);
  });
}

export function printEventsAfter(sequence: AuditEventCursor) {
  return Effect.gen(function* () {
    const client = yield* AdminApiClient;
    const events = yield* client.listEvents({ after: sequence });

    return yield* printEvents(events);
  });
}

export function printNextFollowEvents(sequence: AuditEventSequence | undefined) {
  return printEventsAfter(sequence ?? 0);
}

function followEvents(
  sequence: AuditEventSequence | undefined,
): Effect.Effect<void, unknown, AdminApiClient> {
  return Effect.gen(function* () {
    yield* Effect.sleep("1 second");
    const nextSequence = yield* printNextFollowEvents(sequence);
    return yield* followEvents(nextSequence ?? sequence);
  });
}

function printEvents(events: ReadonlyArray<AuditEvent>) {
  return Effect.gen(function* () {
    if (events.length > 0) {
      yield* Console.log(formatEvents(events));
    }

    return lastEventSequence(events);
  });
}

function lastEventSequence(events: ReadonlyArray<AuditEvent>) {
  const lastEvent = events.at(-1);

  return lastEvent?.sequence;
}

function validateEventLimit(limit: number) {
  if (Number.isInteger(limit) && limit >= 1) {
    return Effect.succeed(limit);
  }

  return Effect.fail(
    AdminApiError.make({
      code: "InvalidEventLimit",
      message: "Event limit must be at least 1",
    }),
  );
}

function validateCredentialId(value: string) {
  return Schema.decodeUnknown(CredentialId)(value).pipe(
    Effect.mapError(() =>
      AdminApiError.make({
        code: "InvalidCredentialId",
        message: "Credential ID is invalid",
      }),
    ),
  );
}

function getDeleteCredentialLabel(
  client: Context.Tag.Service<AdminApiClient>,
  credentialId: CredentialId,
) {
  return client.get(credentialId).pipe(
    Effect.map((credential) => Option.some({ label: credential.label })),
    Effect.catchIf(isCredentialNotFoundError, () => Effect.succeed(Option.none())),
  );
}

function isCredentialNotFoundError(error: unknown) {
  return Schema.is(AdminApiError)(error) && error.code === "CredentialNotFoundError";
}

function isTransportRequestError(error: unknown) {
  return error instanceof HttpClientError.RequestError && error.reason === "Transport";
}

function isSemanticError(error: unknown): error is SemanticErrorType {
  return Schema.is(SemanticError)(error);
}

function currentExecutablePath() {
  return process.argv[1] ?? "usher";
}

function currentHomeDirectory() {
  return process.env.HOME ?? ".";
}

function currentUsername() {
  return process.env.USER ?? process.env.LOGNAME ?? "";
}

function deleteConfirmationMessage(
  credentialId: CredentialId,
  credential: Option.Option<{ readonly label: string }>,
) {
  return Option.match(credential, {
    onNone: () => `Delete credential ${credentialId}?`,
    onSome: (value) => `Delete credential ${value.label} (${credentialId})?`,
  });
}
