import { randomBytes } from "node:crypto";
import { Context, Effect, Layer, Match, Schema } from "effect";
import {
  allowedRequestsOverlap,
  normalizeAllowedRequest,
} from "../../Domain/Credentials/AllowedRequest.js";
import {
  Credential,
  CredentialId,
  type AllowedRequest,
  type CreateCredentialInput,
  type UpdateCredentialInput,
} from "../../Domain/Credentials/Credential.js";
import {
  InvalidCredentialTypeError,
  OverlappingAllowedRequestError,
  type CredentialNotFoundError,
  type SemanticError,
} from "../../Domain/Errors/UsherErrors.js";
import { CredentialRepository } from "../Ports/CredentialRepository.js";
import { SecretVault } from "../Ports/SecretVault.js";

const RedactedCredentialFields = {
  credentialId: CredentialId,
  label: Schema.String,
  allowedRequests: Schema.NonEmptyArray(
    Schema.Struct({
      url: Schema.Struct({
        origin: Schema.String,
        pathPrefix: Schema.String,
      }),
    }),
  ),
  createdAt: Schema.String,
  updatedAt: Schema.String,
};

export const RedactedOAuth2Credential = Schema.Struct({
  ...RedactedCredentialFields,
  type: Schema.Literal("OAuth2"),
  status: Schema.Literal("pending", "active", "error"),
  clientId: Schema.String,
  authorizationUrl: Schema.String,
  tokenUrl: Schema.String,
  scopes: Schema.Array(Schema.String),
  grantedScopes: Schema.Array(Schema.String),
  clientSecretPreview: Schema.String,
  loginUrl: Schema.String,
});
export type RedactedOAuth2Credential = Schema.Schema.Type<typeof RedactedOAuth2Credential>;

export const RedactedBearerTokenCredential = Schema.Struct({
  ...RedactedCredentialFields,
  type: Schema.Literal("BearerToken"),
  status: Schema.Literal("pending", "active", "error"),
  tokenPreview: Schema.String,
});
export type RedactedBearerTokenCredential = Schema.Schema.Type<
  typeof RedactedBearerTokenCredential
>;

export const RedactedCredential = Schema.Union(
  RedactedOAuth2Credential,
  RedactedBearerTokenCredential,
);
export type RedactedCredential = Schema.Schema.Type<typeof RedactedCredential>;

export class CredentialService extends Context.Tag("CredentialService")<
  CredentialService,
  {
    readonly create: (
      input: CreateCredentialInput,
    ) => Effect.Effect<RedactedCredential, SemanticError>;
    readonly list: () => Effect.Effect<ReadonlyArray<RedactedCredential>, SemanticError>;
    readonly getById: (
      credentialId: CredentialId,
    ) => Effect.Effect<RedactedCredential, SemanticError>;
    readonly update: (
      credentialId: CredentialId,
      input: UpdateCredentialInput,
    ) => Effect.Effect<RedactedCredential, SemanticError>;
    readonly deleteById: (
      credentialId: CredentialId,
    ) => Effect.Effect<void, CredentialNotFoundError>;
  }
>() {}

export function CredentialServiceLive(config: { readonly baseUrl: string }) {
  return Layer.effect(
    CredentialService,
    Effect.gen(function* () {
      const repository = yield* CredentialRepository;
      const vault = yield* SecretVault;

      return {
        create: (input) => createCredential(input, config.baseUrl, repository, vault),
        list: () =>
          repository
            .list()
            .pipe(Effect.map((credentials) => credentials.map(redactCredential(config.baseUrl)))),
        getById: (credentialId) =>
          repository.getById(credentialId).pipe(Effect.map(redactCredential(config.baseUrl))),
        update: (credentialId, input) =>
          updateCredential(credentialId, input, config.baseUrl, repository, vault),
        deleteById: (credentialId) => repository.deleteById(credentialId),
      };
    }),
  );
}

function createCredential(
  input: CreateCredentialInput,
  baseUrl: string,
  repository: Context.Tag.Service<CredentialRepository>,
  vault: Context.Tag.Service<SecretVault>,
) {
  return Effect.gen(function* () {
    const credentialId = generateCredentialId();
    const allowedRequests = yield* normalizeAllowedRequests(input.allowedRequests);
    const existingCredentials = yield* repository.findAllNonDeleted();

    if (hasOverlap(allowedRequests, existingCredentials)) {
      return yield* Effect.fail(OverlappingAllowedRequestError.make());
    }

    const now = new Date().toISOString();
    const credential = yield* Match.value(input).pipe(
      Match.when({ type: "BearerToken" }, (bearerInput) =>
        Effect.gen(function* () {
          const encryptedToken = yield* vault.encrypt({
            credentialId,
            purpose: "BearerToken.token",
            plaintext: bearerInput.bearerToken.token,
          });

          return yield* Schema.decodeUnknown(Credential)({
            credentialId,
            type: "BearerToken",
            label: bearerInput.label,
            status: "active",
            allowedRequests,
            createdAt: now,
            updatedAt: now,
            bearerToken: { encryptedToken },
          }).pipe(Effect.orDie);
        }),
      ),
      Match.when({ type: "OAuth2" }, (oauth2Input) =>
        Effect.gen(function* () {
          const encryptedClientSecret = yield* vault.encrypt({
            credentialId,
            purpose: "OAuth2.clientSecret",
            plaintext: oauth2Input.oauth2.clientSecret,
          });

          return yield* Schema.decodeUnknown(Credential)({
            credentialId,
            type: "OAuth2",
            label: oauth2Input.label,
            status: "pending",
            allowedRequests,
            createdAt: now,
            updatedAt: now,
            oauth2: {
              clientId: oauth2Input.oauth2.clientId,
              encryptedClientSecret,
              authorizationUrl: oauth2Input.oauth2.authorizationUrl,
              tokenUrl: oauth2Input.oauth2.tokenUrl,
              scopes: oauth2Input.oauth2.scopes,
              grantedScopes: [],
              tokenAuthMethod: oauth2Input.oauth2.tokenAuthMethod,
            },
          }).pipe(Effect.orDie);
        }),
      ),
      Match.exhaustive,
    );

    yield* repository.insert(credential);

    return redactCredential(baseUrl)(credential);
  });
}

function updateCredential(
  credentialId: CredentialId,
  input: UpdateCredentialInput,
  baseUrl: string,
  repository: Context.Tag.Service<CredentialRepository>,
  vault: Context.Tag.Service<SecretVault>,
) {
  return Effect.gen(function* () {
    const credential = yield* repository.getById(credentialId);

    if (input.bearerToken !== undefined && credential.type !== "BearerToken") {
      return yield* Effect.fail(InvalidCredentialTypeError.make());
    }

    const allowedRequests =
      input.allowedRequests === undefined
        ? credential.allowedRequests
        : yield* normalizeAllowedRequests(input.allowedRequests);

    if (input.allowedRequests !== undefined) {
      const otherCredentials = yield* repository
        .findAllNonDeleted()
        .pipe(
          Effect.map((credentials) =>
            credentials.filter((existing) => existing.credentialId !== credentialId),
          ),
        );

      if (hasOverlap(allowedRequests, otherCredentials)) {
        return yield* Effect.fail(OverlappingAllowedRequestError.make());
      }
    }

    const bearerToken =
      credential.type === "BearerToken"
        ? input.bearerToken === undefined
          ? credential.bearerToken
          : {
              encryptedToken: yield* vault.encrypt({
                credentialId,
                purpose: "BearerToken.token",
                plaintext: input.bearerToken.token,
              }),
            }
        : undefined;

    const updatedCredential = yield* Schema.decodeUnknown(Credential)({
      ...credential,
      label: input.label ?? credential.label,
      allowedRequests,
      updatedAt: new Date().toISOString(),
      ...(bearerToken === undefined ? {} : { bearerToken }),
    }).pipe(Effect.orDie);

    yield* repository.update(updatedCredential);

    return redactCredential(baseUrl)(updatedCredential);
  });
}

function generateCredentialId() {
  return Schema.decodeUnknownSync(CredentialId)(`cred_${randomBytes(18).toString("base64url")}`);
}

function normalizeAllowedRequests(allowedRequests: CreateCredentialInput["allowedRequests"]) {
  return Effect.forEach(allowedRequests, normalizeAllowedRequest);
}

function hasOverlap(
  allowedRequests: ReadonlyArray<AllowedRequest>,
  existingCredentials: ReadonlyArray<Credential>,
) {
  return allowedRequests.some((allowedRequest) =>
    existingCredentials.some((credential) =>
      credential.allowedRequests.some((existingAllowedRequest) =>
        allowedRequestsOverlap(allowedRequest, existingAllowedRequest),
      ),
    ),
  );
}

function redactCredential(baseUrl: string) {
  return function (credential: Credential): RedactedCredential {
    if (credential.type === "BearerToken") {
      return {
        credentialId: credential.credentialId,
        type: "BearerToken",
        label: credential.label,
        status: credential.status,
        allowedRequests: credential.allowedRequests,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
        tokenPreview: "********",
      };
    }

    return {
      credentialId: credential.credentialId,
      type: "OAuth2",
      label: credential.label,
      status: credential.status,
      allowedRequests: credential.allowedRequests,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      clientId: credential.oauth2.clientId,
      authorizationUrl: credential.oauth2.authorizationUrl,
      tokenUrl: credential.oauth2.tokenUrl,
      scopes: credential.oauth2.scopes,
      grantedScopes: credential.oauth2.grantedScopes,
      clientSecretPreview: "********",
      loginUrl: `${baseUrl}/credentials/${credential.credentialId}/oauth2/login`,
    };
  };
}
