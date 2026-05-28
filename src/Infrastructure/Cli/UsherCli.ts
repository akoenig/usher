import { Args, Command } from "@effect/cli";
import * as Prompt from "@effect/cli/Prompt";
import { HttpClientError } from "@effect/platform";
import { NodeContext, NodeHttpClient } from "@effect/platform-node";
import { ConfigError, Console, Context, Effect, Layer, Option, Schema } from "effect";
import { CredentialId } from "../../Domain/Credentials/Credential.js";
import { runUsherDaemon } from "../Daemon/UsherDaemon.js";
import { AdminApiClient, AdminApiClientLive, AdminApiError } from "./AdminApiClient.js";
import { loadUsherCliConfig, localAdminBaseUrl } from "./CliConfig.js";
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

const credentialIdArg = Args.text({ name: "credential-id" });

const daemonCommand = Command.make("daemon", {}, () => runUsherDaemon);

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

export const usherCommand = Command.make("usher").pipe(
  Command.withSubcommands([daemonCommand, credentialsCommand]),
);

export function runUsherCli(args: ReadonlyArray<string>): Effect.Effect<void, unknown, never> {
  return Command.run(usherCommand, {
    name: "Usher",
    version: "0.0.0",
  })(args).pipe(
    Effect.catchIf(Schema.is(AdminApiError), (error) =>
      Console.error(`${error.code}: ${error.message}`).pipe(Effect.zipRight(Effect.fail(error))),
    ),
    Effect.catchIf(isTransportRequestError, (error) =>
      Console.error("Daemon unavailable.").pipe(Effect.zipRight(Effect.fail(error))),
    ),
    Effect.catchIf(ConfigError.isConfigError, (error) =>
      Console.error(formatConfigErrorMessage(error)).pipe(Effect.zipRight(Effect.fail(error))),
    ),
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

function withLocalAdminClient<A, E, R>(effect: Effect.Effect<A, E, R | AdminApiClient>) {
  return Effect.gen(function* () {
    const config = yield* loadUsherCliConfig;

    return yield* effect.pipe(Effect.provide(AdminApiClientLive(localAdminBaseUrl(config.port))));
  });
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

function deleteConfirmationMessage(
  credentialId: CredentialId,
  credential: Option.Option<{ readonly label: string }>,
) {
  return Option.match(credential, {
    onNone: () => `Delete credential ${credentialId}?`,
    onSome: (value) => `Delete credential ${value.label} (${credentialId})?`,
  });
}
